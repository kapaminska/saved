import { describe, expect, it } from "vitest";
import { POST } from "@/pages/api/goals/[id]/payments/[paymentId]/delete";
import { asRouteContext, createApiContext, createSupabaseMock, createTestUser } from "@/test/api-route";

const user = createTestUser();
const goalId = "22222222-2222-4222-8222-222222222222";
const paymentId = "33333333-3333-4333-8333-333333333333";

function deleteContext(mock: ReturnType<typeof createSupabaseMock>) {
  return asRouteContext(
    createApiContext({
      user,
      supabase: mock.client,
      params: { id: goalId, paymentId },
    }),
  );
}

describe("POST /api/goals/[id]/payments/[paymentId]/delete", () => {
  it("returns 409 when the goal is not active", async () => {
    const mock = createSupabaseMock();
    mock.queue({ data: { id: goalId, status: "abandoned" } });
    const response = await POST(deleteContext(mock));
    expect(response.status).toBe(409);
  });

  it("returns 500 when recalc fails after delete", async () => {
    const mock = createSupabaseMock();
    mock.queue({ data: { id: goalId, status: "active" } });
    mock.queue({ data: { id: paymentId } });
    mock.queue({ error: null });
    mock.queueError("load");

    const response = await POST(deleteContext(mock));
    expect(response.status).toBe(500);
  });

  it("recalculates saved_amount after delete", async () => {
    const mock = createSupabaseMock();
    mock.queue({ data: { id: goalId, status: "active" } });
    mock.queue({ data: { id: paymentId } });
    mock.queue({ error: null });
    mock.queue({ data: { opening_saved_amount: 10 } });
    mock.queue({ data: [] });
    mock.queue({
      data: {
        id: goalId,
        user_id: user.id,
        name: "Wakacje",
        target_amount: 1000,
        saved_amount: 10,
        opening_saved_amount: 10,
        deadline: null,
        status: "active",
        completed_at: null,
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-03-15T00:00:00.000Z",
      },
    });

    const response = await POST(deleteContext(mock));
    expect(response.status).toBe(200);
    expect(mock.calls.some((call) => call.method === "delete")).toBe(true);
    expect(mock.calls.some((call) => call.table === "savings_goals" && call.method === "update")).toBe(true);
  });
});
