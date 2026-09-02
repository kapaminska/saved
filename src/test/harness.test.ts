import { describe, expect, it } from "vitest";
import { getSupabase } from "@/lib/supabase";
import { POST } from "@/pages/api/goals/index";
import { asRouteContext, createApiContext, createSupabaseMock } from "@/test/api-route";

describe("vitest harness", () => {
  it("imports getSupabase without throwing on astro:env/server", () => {
    const { client } = createSupabaseMock();
    const context = createApiContext({ supabase: client });

    expect(getSupabase(context.locals, context.request.headers, context.cookies)).toBe(client);
  });

  it("returns 401 from goals POST when unauthenticated", async () => {
    const response = await POST(asRouteContext(createApiContext({ user: null })));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ success: false, error: "Brak autoryzacji" });
  });
});
