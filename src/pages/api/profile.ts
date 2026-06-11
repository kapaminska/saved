import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";

const VALID_RELATIONSHIP_STATUSES = ["single", "married", "partnership", ""];

function toNullable(value: string | null | undefined): string | null {
  return value && value.length > 0 ? value : null;
}

export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) {
    return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return new Response(JSON.stringify({ success: false, error: "Supabase is not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const form = await context.request.formData();
  const displayName = (form.get("display_name") as string | null)?.trim();
  const dateOfBirth = toNullable((form.get("date_of_birth") as string | null)?.trim());
  const retirementAgeRaw = toNullable((form.get("retirement_age") as string | null)?.trim());
  const relationshipStatus = (form.get("relationship_status") as string | null)?.trim() ?? "";

  if (!displayName) {
    return new Response(JSON.stringify({ success: false, error: "Display name is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  let retirementAge: number | null = null;
  if (retirementAgeRaw) {
    retirementAge = parseInt(retirementAgeRaw, 10);
    if (isNaN(retirementAge) || retirementAge < 30 || retirementAge > 100) {
      return new Response(JSON.stringify({ success: false, error: "Retirement age must be between 30 and 100" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  if (!VALID_RELATIONSHIP_STATUSES.includes(relationshipStatus)) {
    return new Response(JSON.stringify({ success: false, error: "Invalid relationship status" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      display_name: displayName,
      date_of_birth: dateOfBirth,
      retirement_age: retirementAge,
      relationship_status: toNullable(relationshipStatus),
    })
    .eq("id", user.id);

  if (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ success: true }), {
    headers: { "Content-Type": "application/json" },
  });
};
