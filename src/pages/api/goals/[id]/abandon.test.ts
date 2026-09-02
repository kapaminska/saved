import { describe, expect, it } from "vitest";
import { POST } from "@/pages/api/goals/[id]/abandon";
import { asRouteContext, createApiContext, createSupabaseMock, createTestUser } from "@/test/api-route";

const user = createTestUser();
const goalId = "22222222-2222-4222-8222-222222222222";

function abandonContext(mock: ReturnType<typeof createSupabaseMock>, id = goalId) {
  return asRouteContext(createApiContext({ user, supabase: mock.client, params: { id } }));
}

describe("POST /api/goals/[id]/abandon", () => {
  it("returns 404 when the goal is missing", async () => {
    const mock = createSupabaseMock();
    mock.queue({ data: null });
    const response = await POST(abandonContext(mock));
    expect(response.status).toBe(404);
  });

  it("returns 409 when the goal is not active", async () => {
    const mock = createSupabaseMock();
    mock.queue({ data: { status: "completed" } });
    const response = await POST(abandonContext(mock));
    expect(response.status).toBe(409);
  });

  it("abandons an active goal", async () => {
    const mock = createSupabaseMock();
    mock.queue({ data: { status: "active" } });
    mock.queue({ error: null });
    const response = await POST(abandonContext(mock));
    expect(response.status).toBe(200);
    expect(mock.calls.some((call) => call.method === "update")).toBe(true);
  });
});
