import { describe, expect, it } from "vitest";
import { formatAuthError } from "@/lib/supabase";

describe("formatAuthError", () => {
  it("returns a real Auth API message", () => {
    expect(formatAuthError({ message: "Email rate limit exceeded" }, "fallback")).toBe("Email rate limit exceeded");
  });

  it("does not surface JSON.stringify(Error) as {}", () => {
    expect(formatAuthError({ message: "{}" }, "Nie udało się wysłać kodu")).toBe("Nie udało się wysłać kodu");
  });
});
