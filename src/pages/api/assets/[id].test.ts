import { describe, expect, it } from "vitest";
import { POST } from "@/pages/api/assets/[id]";
import {
  asRouteContext,
  createApiContext,
  createSupabaseMock,
  createTestUser,
  expectOwnershipEq,
  OTHER_USER_ID,
} from "@/test/api-route";

const assetId = "55555555-5555-4555-8555-555555555555";

describe("POST /api/assets/[id]", () => {
  it("returns 401 without a user", async () => {
    const response = await POST(asRouteContext(createApiContext({ user: null, params: { id: assetId } })));
    expect(response.status).toBe(401);
  });

  it("returns 404 when another user owns the asset", async () => {
    const bob = createTestUser({ id: OTHER_USER_ID });
    const mock = createSupabaseMock();
    mock.queue({ data: null });
    const response = await POST(
      asRouteContext(
        createApiContext({
          user: bob,
          supabase: mock.client,
          params: { id: assetId },
        }),
      ),
    );
    expect(response.status).toBe(404);
    expectOwnershipEq(mock.calls, bob.id, { table: "assets" });
    expect(mock.calls.some((call) => call.method === "update")).toBe(false);
  });
});
