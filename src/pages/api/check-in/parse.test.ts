import { beforeEach, describe, expect, it } from "vitest";
import { POST } from "@/pages/api/check-in/parse";
import { mockAiRun } from "@/test/vitest-mocks";
import { asRouteContext, createApiContext, createSupabaseMock, createTestUser } from "@/test/api-route";

const user = createTestUser();
const goal = { id: "22222222-2222-4222-8222-222222222222", name: "Wakacje" };

function parseContext(mock: ReturnType<typeof createSupabaseMock>, json: unknown) {
  return asRouteContext(createApiContext({ user, supabase: mock.client, json }));
}

function queueUnderLimit(mock: ReturnType<typeof createSupabaseMock>) {
  mock.queue({ count: 0, data: null });
}

function queueRateLimited(mock: ReturnType<typeof createSupabaseMock>) {
  mock.queue({ count: 10, data: null });
  mock.queue({ data: { created_at: "2026-03-15T11:00:00.000Z" } });
}

function queueParseAttempt(mock: ReturnType<typeof createSupabaseMock>) {
  queueUnderLimit(mock);
  mock.queue({ data: [goal] });
  mock.queue({ error: null });
}

function paymentWrites(mock: ReturnType<typeof createSupabaseMock>) {
  return mock.calls.filter(
    (call) => call.table === "goal_payments" && (call.method === "upsert" || call.method === "insert"),
  );
}

function parseAttemptInserts(mock: ReturnType<typeof createSupabaseMock>) {
  return mock.calls.filter((call) => call.table === "ai_checkin_requests" && call.method === "insert");
}

describe("POST /api/check-in/parse", () => {
  beforeEach(() => {
    mockAiRun.mockReset();
  });

  it("returns 401 without a user", async () => {
    const response = await POST(asRouteContext(createApiContext({ user: null, json: { text: "500" } })));
    expect(response.status).toBe(401);
  });

  // Risk #6: rejected empty input must not consume the 10/hour budget.
  it("returns 400 INVALID_INPUT for empty text and does not insert an attempt", async () => {
    const mock = createSupabaseMock();
    const response = await POST(parseContext(mock, { text: "   " }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "INVALID_INPUT" });
    expect(parseAttemptInserts(mock)).toHaveLength(0);
  });

  it("returns 400 INVALID_INPUT when text exceeds 500 characters", async () => {
    const mock = createSupabaseMock();
    const response = await POST(parseContext(mock, { text: "x".repeat(501) }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "INVALID_INPUT" });
  });

  // Risks #4/#6: 11th parse is denied with fallback copy; no AI, no extra quota row, no payment write.
  it("denies the 11th parse with RATE_LIMITED fallback, no AI, no attempt insert, and no payment write", async () => {
    const mock = createSupabaseMock();
    queueRateLimited(mock);

    const response = await POST(parseContext(mock, { text: "500 na wakacje" }));
    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toMatchObject({
      code: "RATE_LIMITED",
      error: expect.stringMatching(/ręczn/),
    });
    expect(mockAiRun).not.toHaveBeenCalled();
    expect(parseAttemptInserts(mock)).toHaveLength(0);
    expect(paymentWrites(mock)).toHaveLength(0);
  });

  // Risk #6: no-goals exit is free (count query may hit the table; insert must not).
  it("returns 400 NO_GOALS and does not insert an attempt", async () => {
    const mock = createSupabaseMock();
    queueUnderLimit(mock);
    mock.queue({ data: [] });

    const response = await POST(parseContext(mock, { text: "500 na wakacje" }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "NO_GOALS" });
    expect(parseAttemptInserts(mock)).toHaveLength(0);
  });

  // Risks #4/#6: failed AI still burns quota; month is not recorded; UI keys AI_UNAVAILABLE + manual copy.
  it("returns 503 AI_UNAVAILABLE with fallback copy, burns quota, and does not write goal_payments", async () => {
    const mock = createSupabaseMock();
    queueParseAttempt(mock);
    mockAiRun.mockRejectedValue(new Error("down"));

    const response = await POST(parseContext(mock, { text: "500 na wakacje" }));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      code: "AI_UNAVAILABLE",
      error: expect.stringMatching(/ręczn/),
    });
    expect(parseAttemptInserts(mock).length).toBeGreaterThan(0);
    expect(paymentWrites(mock)).toHaveLength(0);
  });

  it("returns 503 AI_UNAVAILABLE when the model returns unparsable text", async () => {
    const mock = createSupabaseMock();
    queueParseAttempt(mock);
    mockAiRun.mockResolvedValue({ response: "not json" });

    const response = await POST(parseContext(mock, { text: "500 na wakacje" }));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ code: "AI_UNAVAILABLE" });
  });

  // Risk #4: a 200 from parse is proposals only — it must not record the month.
  it("returns proposals on a well-formed model response without writing goal_payments", async () => {
    const mock = createSupabaseMock();
    queueParseAttempt(mock);
    mockAiRun.mockResolvedValue({
      response: JSON.stringify({ payments: [{ goal_name: "Wakacje", amount: 500 }] }),
    });

    const response = await POST(parseContext(mock, { text: "500 na wakacje" }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      proposals: [{ goalId: goal.id, goalName: "Wakacje", amount: 500 }],
      unrecognized: [],
    });
    expect(paymentWrites(mock)).toHaveLength(0);
  });
});
