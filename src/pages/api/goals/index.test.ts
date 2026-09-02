import { describe, expect, it } from "vitest";
import { POST } from "@/pages/api/goals/index";
import { asRouteContext, createApiContext, createSupabaseMock, createTestUser } from "@/test/api-route";

const user = createTestUser();

const createdGoal = {
  id: "22222222-2222-4222-8222-222222222222",
  user_id: user.id,
  name: "Wakacje",
  target_amount: 5000,
  saved_amount: 100,
  opening_saved_amount: 100,
  deadline: "2026-06-01",
  status: "active",
  completed_at: null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

describe("POST /api/goals", () => {
  it("returns 401 without a user", async () => {
    const response = await POST(asRouteContext(createApiContext({ user: null })));
    expect(response.status).toBe(401);
  });

  it("returns 400 when validation fails", async () => {
    const mock = createSupabaseMock();
    const response = await POST(
      asRouteContext(
        createApiContext({
          user,
          supabase: mock.client,
          form: { name: "", target_amount: "5000" },
        }),
      ),
    );
    expect(response.status).toBe(400);
  });

  it("inserts both saved_amount and opening_saved_amount", async () => {
    const mock = createSupabaseMock();
    mock.queue({ data: createdGoal });

    const response = await POST(
      asRouteContext(
        createApiContext({
          user,
          supabase: mock.client,
          form: { name: "Wakacje", target_amount: "5000", saved_amount: "100", deadline: "2026-06" },
        }),
      ),
    );

    expect(response.status).toBe(200);
    const insert = mock.calls.find((call) => call.method === "insert");
    expect(insert?.args[0]).toMatchObject({
      saved_amount: 100,
      opening_saved_amount: 100,
      name: "Wakacje",
      target_amount: 5000,
    });
    await expect(response.json()).resolves.toMatchObject({ success: true, goal: { name: "Wakacje" } });
  });
});
