import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { checkRateLimit, parseCheckInSentence, recordParseAttempt, validateCheckInText } from "@/lib/goals/ai-checkin";
import { getSupabase } from "@/lib/supabase";

function jsonResponse(body: object, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) {
    return jsonResponse({ success: false, error: "Unauthorized" }, 401);
  }

  const supabase = getSupabase(context.locals, context.request.headers, context.cookies);
  if (!supabase) {
    return jsonResponse({ success: false, error: "Supabase is not configured" }, 500);
  }

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return jsonResponse({ success: false, error: "Check-in text cannot be empty", code: "INVALID_INPUT" }, 400);
  }

  const requestText =
    typeof body === "object" && body !== null && "text" in body && typeof body.text === "string" ? body.text : "";
  const textResult = validateCheckInText(requestText);
  if (!textResult.ok) {
    return jsonResponse({ success: false, error: textResult.error, code: "INVALID_INPUT" }, 400);
  }

  const rateLimitResult = await checkRateLimit(supabase, user.id);
  if (!rateLimitResult.ok) {
    const retryMinutes = Math.max(1, Math.ceil(rateLimitResult.retryAfterMs / 60_000));
    return jsonResponse(
      {
        success: false,
        error: `AI check-in limit reached (10 per hour). Try again in about ${retryMinutes} minute(s) or use manual check-in.`,
        code: "RATE_LIMITED",
      },
      429,
    );
  }

  const { data: activeGoals, error: goalsError } = await supabase
    .from("savings_goals")
    .select("id, name")
    .eq("user_id", user.id)
    .eq("status", "active");

  if (goalsError) {
    return jsonResponse({ success: false, error: "Failed to load goals" }, 500);
  }

  if (activeGoals.length === 0) {
    return jsonResponse({ success: false, error: "No active goals to check in against", code: "NO_GOALS" }, 400);
  }

  try {
    await recordParseAttempt(supabase, user.id);
  } catch {
    return jsonResponse({ success: false, error: "Failed to record parse attempt" }, 500);
  }

  const parseResult = await parseCheckInSentence(env.AI, textResult.text, activeGoals);
  if (!parseResult.ok) {
    return jsonResponse(
      {
        success: false,
        error: "AI check-in is temporarily unavailable. Please use manual check-in.",
        code: "AI_UNAVAILABLE",
      },
      503,
    );
  }

  return jsonResponse({
    success: true,
    proposals: parseResult.proposals,
    unrecognized: parseResult.unrecognized,
    rateLimitRemaining: rateLimitResult.remaining,
  });
};
