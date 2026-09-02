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

describe("POST /api/check-in/parse", () => {
  beforeEach(() => {
    mockAiRun.mockReset();
  });

  it("returns 401 without a user", async () => {
    const response = await POST(asRouteContext(createApiContext({ user: null, json: { text: "500" } })));
    expect(response.status).toBe(401);
  });

  it("returns 400 INVALID_INPUT for empty text", async () => {
    const mock = createSupabaseMock();
    const response = await POST(parseContext(mock, { text: "   " }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "INVALID_INPUT" });
  });

  it("returns 400 INVALID_INPUT when text exceeds 500 characters", async () => {
    const mock = createSupabaseMock();
    const response = await POST(parseContext(mock, { text: "x".repeat(501) }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "INVALID_INPUT" });
  });

  it("returns 429 RATE_LIMITED when the hourly cap is reached", async () => {
    const mock = createSupabaseMock();
    mock.queue({ count: 10, data: null });
    mock.queue({ data: { created_at: new Date(Date.now() - 60_000).toISOString() } });

    const response = await POST(parseContext(mock, { text: "500 na wakacje" }));
    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toMatchObject({ code: "RATE_LIMITED" });
  });

  it("returns 400 NO_GOALS when the user has no active goals", async () => {
    const mock = createSupabaseMock();
    queueUnderLimit(mock);
    mock.queue({ data: [] });

    const response = await POST(parseContext(mock, { text: "500 na wakacje" }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "NO_GOALS" });
  });

  it("returns 503 AI_UNAVAILABLE when the model fails", async () => {
    const mock = createSupabaseMock();
    queueUnderLimit(mock);
    mock.queue({ data: [goal] });
    mock.queue({ error: null });
    mockAiRun.mockRejectedValue(new Error("down"));

    const response = await POST(parseContext(mock, { text: "500 na wakacje" }));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ code: "AI_UNAVAILABLE" });
  });

  it("returns proposals on a well-formed model response", async () => {
    const mock = createSupabaseMock();
    queueUnderLimit(mock);
    mock.queue({ data: [goal] });
    mock.queue({ error: null });
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
  });
});
