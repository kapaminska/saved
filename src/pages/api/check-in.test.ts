import { describe, expect, it } from "vitest";
import { POST } from "@/pages/api/check-in";
import { asRouteContext, createApiContext, createSupabaseMock, createTestUser } from "@/test/api-route";

const goalId = "22222222-2222-4222-8222-222222222222";
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
});
