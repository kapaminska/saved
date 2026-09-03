import { describe, expect, it } from "vitest";
import { POST } from "@/pages/api/check-in";
import { asRouteContext, createApiContext, createSupabaseMock, createTestUser } from "@/test/api-route";

const goalId = "22222222-2222-4222-8222-222222222222";
const otherGoalId = "44444444-4444-4444-8444-444444444444";
const user = createTestUser();

function checkInContext(mock: ReturnType<typeof createSupabaseMock>, form: Record<string, string | string[]>) {
  return asRouteContext(
    createApiContext({
      user,
      supabase: mock.client,
      form,
    }),
  );
}

function queueRecalc(
  mock: ReturnType<typeof createSupabaseMock>,
  goal: { id: string; name: string; status: string; opening_saved_amount?: number },
) {
  mock.queue({ data: { opening_saved_amount: goal.opening_saved_amount ?? 0 } });
  mock.queue({ data: [{ amount: 100 }] });
  mock.queue({
    data: {
      id: goal.id,
      user_id: user.id,
      name: goal.name,
      target_amount: 1000,
      saved_amount: 100,
      opening_saved_amount: goal.opening_saved_amount ?? 0,
      deadline: null,
      status: goal.status,
      completed_at: goal.status === "completed" ? "2026-03-15T00:00:00.000Z" : null,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-03-15T00:00:00.000Z",
    },
  });
}

function queueSuccessfulCheckIn(
  mock: ReturnType<typeof createSupabaseMock>,
  goal: { id: string; name: string; status?: string } = { id: goalId, name: "Wakacje" },
) {
  const status = goal.status ?? "active";
  mock.queue({ data: [{ id: goal.id, name: goal.name, status }] });
  mock.queue({ error: null });
  queueRecalc(mock, { id: goal.id, name: goal.name, status });
}

function paymentUpserts(mock: ReturnType<typeof createSupabaseMock>) {
  return mock.calls.filter((call) => call.table === "goal_payments" && call.method === "upsert");
}

describe("POST /api/check-in", () => {
  it("returns 401 without a user", async () => {
    const response = await POST(asRouteContext(createApiContext({ user: null })));
    expect(response.status).toBe(401);
  });

  it("returns 400 for an invalid month", async () => {
    const mock = createSupabaseMock();
    const response = await POST(checkInContext(mock, { payment_month: "nope", goal_id: goalId, amount: "100" }));
    expect(response.status).toBe(400);
  });

  it("returns 400 when goal_id and amount counts differ", async () => {
    const mock = createSupabaseMock();
    const response = await POST(
      checkInContext(mock, { payment_month: "2020-01", goal_id: goalId, amount: ["10", "20"] }),
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "Niezgodne pola celu i kwoty" });
  });

  it("returns 400 when every amount is empty", async () => {
    const mock = createSupabaseMock();
    const response = await POST(checkInContext(mock, { payment_month: "2020-01", goal_id: goalId, amount: "  " }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "Brak wpłat do zapisania" });
  });

  it("returns 400 for a non-UUID goal id", async () => {
    const mock = createSupabaseMock();
    const response = await POST(
      checkInContext(mock, { payment_month: "2020-01", goal_id: "not-a-uuid", amount: "100" }),
    );
    expect(response.status).toBe(400);
  });

  it("returns 404 when an active goal is missing", async () => {
    const mock = createSupabaseMock();
    mock.queue({ data: [] });
    const response = await POST(checkInContext(mock, { payment_month: "2020-01", goal_id: goalId, amount: "100" }));
    expect(response.status).toBe(404);
  });

  it("returns 500 when upsert fails", async () => {
    const mock = createSupabaseMock();
    mock.queue({ data: [{ id: goalId, name: "Wakacje", status: "active" }] });
    mock.queueError("upsert");
    const response = await POST(checkInContext(mock, { payment_month: "2020-01", goal_id: goalId, amount: "100" }));
    expect(response.status).toBe(500);
  });

  it("returns 500 when recalc fails", async () => {
    const mock = createSupabaseMock();
    mock.queue({ data: [{ id: goalId, name: "Wakacje", status: "active" }] });
    mock.queue({ error: null });
    mock.queueError("load");
    const response = await POST(checkInContext(mock, { payment_month: "2020-01", goal_id: goalId, amount: "100" }));
    expect(response.status).toBe(500);
  });

  it("returns completedGoals when recalc flips the goal to completed", async () => {
    const mock = createSupabaseMock();
    mock.queue({ data: [{ id: goalId, name: "Wakacje", status: "active" }] });
    mock.queue({ error: null });
    queueRecalc(mock, { id: goalId, name: "Wakacje", status: "completed" });

    const response = await POST(checkInContext(mock, { payment_month: "2020-01", goal_id: goalId, amount: "100" }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      completedGoals: [{ id: goalId, name: "Wakacje" }],
    });
  });

  // Risk #2: future month booked silently. Handler-layer check — not only validateCheckInMonth unit tests.
  it("rejects a future payment_month with 400 and does not upsert", async () => {
    const mock = createSupabaseMock();
    const response = await POST(
      checkInContext(mock, { payment_month: "2099-12", goal_id: goalId, amount: "100" }),
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Miesiąc check-inu nie może być w przyszłości",
    });
    expect(paymentUpserts(mock)).toHaveLength(0);
  });

  // Risk #2: zero treated as skip or rejected. Distinct from an omitted/empty amount.
  it("upserts amount 0 when the form submits an explicit zero", async () => {
    const mock = createSupabaseMock();
    queueSuccessfulCheckIn(mock);

    const response = await POST(checkInContext(mock, { payment_month: "2020-01", goal_id: goalId, amount: "0" }));
    expect(response.status).toBe(200);

    const upserts = paymentUpserts(mock);
    expect(upserts).toHaveLength(1);
    expect(upserts[0]?.args[0]).toMatchObject({
      goal_id: goalId,
      amount: 0,
      payment_month: "2020-01-01",
    });
  });

  // Risk #2: empty amount creates a spurious row or corrupts totals.
  it("does not upsert a skipped (empty/whitespace) amount in a multi-goal form", async () => {
    const mock = createSupabaseMock();
    queueSuccessfulCheckIn(mock);

    const response = await POST(
      checkInContext(mock, {
        payment_month: "2020-01",
        goal_id: [goalId, otherGoalId],
        amount: ["150", "  "],
      }),
    );
    expect(response.status).toBe(200);

    const upserts = paymentUpserts(mock);
    expect(upserts).toHaveLength(1);
    expect(upserts[0]?.args[0]).toMatchObject({ goal_id: goalId, amount: 150 });
    expect(
      upserts.some((call) => (call.args[0] as { goal_id: string }).goal_id === otherGoalId),
    ).toBe(false);
  });

  // Risk #2: duplicate rows for the same goal+month. Upsert onConflict, not a second insert.
  it("overwrites the same goal+month via upsert onConflict instead of inserting a second row", async () => {
    const mock = createSupabaseMock();
    queueSuccessfulCheckIn(mock);
    queueSuccessfulCheckIn(mock);

    const first = await POST(checkInContext(mock, { payment_month: "2020-01", goal_id: goalId, amount: "100" }));
    const second = await POST(checkInContext(mock, { payment_month: "2020-01", goal_id: goalId, amount: "250" }));
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);

    const upserts = paymentUpserts(mock);
    expect(upserts).toHaveLength(2);
    for (const call of upserts) {
      expect(call.args[1]).toEqual({ onConflict: "goal_id,payment_month" });
      expect(call.args[0]).toMatchObject({ goal_id: goalId, payment_month: "2020-01-01" });
    }
    expect(upserts[0]?.args[0]).toMatchObject({ amount: 100 });
    expect(upserts[1]?.args[0]).toMatchObject({ amount: 250 });
  });
});
