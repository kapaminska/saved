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
    return jsonResponse({ success: false, error: "Brak autoryzacji" }, 401);
  }

  const supabase = getSupabase(context.locals, context.request.headers, context.cookies);
  if (!supabase) {
    return jsonResponse({ success: false, error: "Supabase nie jest skonfigurowany" }, 500);
  }

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return jsonResponse({ success: false, error: "Tekst check-inu nie może być pusty", code: "INVALID_INPUT" }, 400);
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
        error: `Limit check-inu AI (10 na godzinę). Spróbuj ponownie za ok. ${retryMinutes} min lub użyj check-inu ręcznego.`,
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
    return jsonResponse({ success: false, error: "Nie udało się wczytać celów" }, 500);
  }

  if (activeGoals.length === 0) {
    return jsonResponse({ success: false, error: "Brak aktywnych celów do check-inu", code: "NO_GOALS" }, 400);
  }

  try {
    await recordParseAttempt(supabase, user.id);
  } catch {
    return jsonResponse({ success: false, error: "Nie udało się zapisać próby parsowania" }, 500);
  }

  const parseResult = await parseCheckInSentence(env.AI, textResult.text, activeGoals);
  if (!parseResult.ok) {
    return jsonResponse(
      {
        success: false,
        error: "Check-in AI jest chwilowo niedostępny. Użyj check-inu ręcznego.",
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
