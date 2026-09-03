import { describe, expect, it } from "vitest";
import { POST } from "@/pages/api/goals/[id]/payments/[paymentId]";
import { asRouteContext, createApiContext, createSupabaseMock, createTestUser } from "@/test/api-route";

const user = createTestUser();
const goalId = "22222222-2222-4222-8222-222222222222";
const paymentId = "33333333-3333-4333-8333-333333333333";

function editPayment(
  mock: ReturnType<typeof createSupabaseMock>,
  options: { goalId?: string; paymentId?: string; form?: Record<string, string> } = {},
) {
  return asRouteContext(
    createApiContext({
      user,
      supabase: mock.client,
      params: { id: options.goalId ?? goalId, paymentId: options.paymentId ?? paymentId },
      form: options.form ?? { amount: "50", payment_month: "2020-01" },
    }),
  );
}

function queueRecalc(mock: ReturnType<typeof createSupabaseMock>, status = "active") {
  mock.queue({ data: { opening_saved_amount: 0 } });
  mock.queue({ data: [{ amount: 50 }] });
  mock.queue({
    data: {
      id: goalId,
      user_id: user.id,
      name: "Wakacje",
      target_amount: 1000,
      saved_amount: 50,
      opening_saved_amount: 0,
      deadline: null,
      status,
      completed_at: null,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-03-15T00:00:00.000Z",
    },
  });
}

describe("POST /api/goals/[id]/payments/[paymentId]", () => {
  it("returns 401 without a user", async () => {
    const response = await POST(asRouteContext(createApiContext({ user: null, params: { id: goalId, paymentId } })));
    expect(response.status).toBe(401);
  });
  it("returns 404 for invalid ids", async () => {
    const mock = createSupabaseMock();
    const response = await POST(editPayment(mock, { goalId: "bad", paymentId: "also-bad" }));
    expect(response.status).toBe(404);
  });

  it("returns 409 when the goal is not active", async () => {
    const mock = createSupabaseMock();
    mock.queue({ data: { id: goalId, status: "abandoned" } });
    const response = await POST(editPayment(mock));
    expect(response.status).toBe(409);
  });

  it("returns 409 when the new month collides with another payment", async () => {
    const mock = createSupabaseMock();
    mock.queue({ data: { id: goalId, status: "active" } });
    mock.queue({ data: { id: paymentId, payment_month: "2020-01-01" } });
    mock.queue({ data: { id: "44444444-4444-4444-8444-444444444444" } });

    const response = await POST(editPayment(mock, { form: { amount: "50", payment_month: "2020-02" } }));
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: "Wpłata na ten miesiąc już istnieje" });
  });

  it("returns 500 when recalc fails after update", async () => {
    const mock = createSupabaseMock();
    mock.queue({ data: { id: goalId, status: "active" } });
    mock.queue({ data: { id: paymentId, payment_month: "2020-01-01" } });
    mock.queue({ error: null });
    mock.queueError("load");

    const response = await POST(editPayment(mock));
    expect(response.status).toBe(500);
  });

  it("recalculates saved_amount after a successful edit", async () => {
    const mock = createSupabaseMock();
    mock.queue({ data: { id: goalId, status: "active" } });
    mock.queue({ data: { id: paymentId, payment_month: "2020-01-01" } });
    mock.queue({ error: null });
    queueRecalc(mock);

    const response = await POST(editPayment(mock));
    expect(response.status).toBe(200);
    expect(mock.calls.filter((call) => call.table === "savings_goals" && call.method === "update").length).toBe(1);
    await expect(response.json()).resolves.toMatchObject({ success: true, completed: false });
  });

  // Risk #2: future month via the edit path, bypassing check-in validation. Not only unit-tested.
  it("rejects a future payment_month with 400 and does not update", async () => {
    const mock = createSupabaseMock();
    mock.queue({ data: { id: goalId, status: "active" } });
    mock.queue({ data: { id: paymentId, payment_month: "2020-01-01" } });

    const response = await POST(editPayment(mock, { form: { amount: "50", payment_month: "2099-12" } }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Miesiąc check-inu nie może być w przyszłości",
    });
    expect(mock.calls.filter((call) => call.table === "goal_payments" && call.method === "update")).toHaveLength(0);
  });
});
