import { REVIEW_SCHEMA, type Review } from "./schema.ts";

export function extractJsonPayload(text: string): string {
  const trimmed = text.trim();
  const fencedMatch = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  if (fencedMatch) {
    return fencedMatch[1].trim();
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start !== -1 && end > start) {
    return trimmed.slice(start, end + 1);
  }

  return trimmed;
}

export function parseReview(text: string | undefined): Review | null {
  if (!text?.trim()) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(extractJsonPayload(text));
    const result = REVIEW_SCHEMA.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
