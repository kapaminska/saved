import { describe, expect, it } from "vitest";
import { POST } from "@/pages/api/liabilities/[id]/delete";
import {
  asRouteContext,
  createApiContext,
  createSupabaseMock,
  createTestUser,
  expectOwnershipEq,
  OTHER_USER_ID,
} from "@/test/api-route";

const liabilityId = "66666666-6666-4666-8666-666666666666";

describe("POST /api/liabilities/[id]/delete", () => {
  it("returns 401 without a user", async () => {
    const response = await POST(asRouteContext(createApiContext({ user: null, params: { id: liabilityId } })));
    expect(response.status).toBe(401);
  });

  it("returns 404 when another user owns the liability", async () => {
    const bob = createTestUser({ id: OTHER_USER_ID });
    const mock = createSupabaseMock();
    mock.queue({ data: null });
    const response = await POST(
      asRouteContext(
        createApiContext({
          user: bob,
          supabase: mock.client,
          params: { id: liabilityId },
        }),
      ),
    );
    expect(response.status).toBe(404);
    expectOwnershipEq(mock.calls, bob.id, { table: "liabilities" });
    expect(mock.calls.some((call) => call.method === "delete")).toBe(false);
  });
});
