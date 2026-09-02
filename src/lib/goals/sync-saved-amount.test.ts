import { describe, expect, it } from "vitest";
import { createSupabaseMock } from "@/test/api-route";
import { recalcSavedAmount } from "./sync-saved-amount";

const goalId = "22222222-2222-4222-8111-222222222222";

const updatedGoal = {
  id: goalId,
  user_id: "11111111-1111-4111-8111-111111111111",
  name: "Wakacje",
  target_amount: 10_000,
  saved_amount: 175,
  opening_saved_amount: 100,
  deadline: null,
  status: "active",
  completed_at: null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-03-15T00:00:00.000Z",
};

describe("recalcSavedAmount", () => {
  it("sets saved_amount to opening_saved_amount plus the sum of payments", async () => {
    const mock = createSupabaseMock();
    mock.queue({ data: { opening_saved_amount: 100 } });
    mock.queue({ data: [{ amount: 50 }, { amount: 25 }] });
    mock.queue({ data: { ...updatedGoal, saved_amount: 175 } });

    const result = await recalcSavedAmount(mock.client, goalId);

    expect(result).toEqual({ ok: true, goal: { ...updatedGoal, saved_amount: 175 } });
    expect(mock.calls.some((call) => call.method === "update")).toBe(true);
  });

  it("returns ok false when loading the goal fails", async () => {
    const mock = createSupabaseMock();
    mock.queueError("missing");

    await expect(recalcSavedAmount(mock.client, goalId)).resolves.toEqual({
      ok: false,
      error: "Failed to load goal",
    });
  });

  it("returns ok false when summing payments fails", async () => {
    const mock = createSupabaseMock();
    mock.queue({ data: { opening_saved_amount: 100 } });
    mock.queueError("payments");

    await expect(recalcSavedAmount(mock.client, goalId)).resolves.toEqual({
      ok: false,
      error: "Failed to sum payments",
    });
  });

  it("returns ok false when updating saved_amount fails", async () => {
    const mock = createSupabaseMock();
    mock.queue({ data: { opening_saved_amount: 100 } });
    mock.queue({ data: [{ amount: 50 }] });
    mock.queueError("update");

    await expect(recalcSavedAmount(mock.client, goalId)).resolves.toEqual({
      ok: false,
      error: "Failed to update saved amount",
    });
  });
});
