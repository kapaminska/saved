import { describe, expect, it } from "vitest";
import { POST } from "@/pages/api/goals/[id]";
import { asRouteContext, createApiContext, createSupabaseMock, createTestUser } from "@/test/api-route";

const user = createTestUser();
const goalId = "22222222-2222-4222-8222-222222222222";

const activeGoal = {
  id: goalId,
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

function editContext(mock: ReturnType<typeof createSupabaseMock>, id = goalId) {
  return asRouteContext(
    createApiContext({
      user,
      supabase: mock.client,
      params: { id },
      form: { name: "Wakacje", target_amount: "4000", saved_amount: "50", deadline: "2026-06" },
    }),
  );
}

describe("POST /api/goals/[id]", () => {
  it("returns 401 without a user", async () => {
    const response = await POST(asRouteContext(createApiContext({ user: null, params: { id: goalId } })));
    expect(response.status).toBe(401);
  });
  it("returns 404 for a non-UUID id", async () => {
    const mock = createSupabaseMock();
    const response = await POST(editContext(mock, "bad"));
    expect(response.status).toBe(404);
  });

  it("returns 404 when the goal is missing", async () => {
    const mock = createSupabaseMock();
    mock.queue({ data: null });
    const response = await POST(editContext(mock));
    expect(response.status).toBe(404);
  });

  it("returns 409 when the goal is not active", async () => {
    const mock = createSupabaseMock();
    mock.queue({ data: { ...activeGoal, status: "abandoned" } });
    const response = await POST(editContext(mock));
    expect(response.status).toBe(409);
  });

  it("omits opening and saved amounts when payments exist", async () => {
    const mock = createSupabaseMock();
    mock.queue({ data: activeGoal });
    mock.queue({ count: 2, data: null });
    mock.queue({ error: null });
    mock.queue({ data: { ...activeGoal, target_amount: 4000 } });

    const response = await POST(editContext(mock));
    expect(response.status).toBe(200);

    const update = mock.calls.find((call) => call.method === "update");
    expect(update?.args[0]).toEqual({
      name: "Wakacje",
      target_amount: 4000,
      deadline: "2026-06-01",
    });
    expect(update?.args[0]).not.toHaveProperty("saved_amount");
    expect(update?.args[0]).not.toHaveProperty("opening_saved_amount");
  });
});
