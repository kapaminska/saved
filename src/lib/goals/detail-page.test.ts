import { describe, expect, it } from "vitest";
import {
  createApiContext,
  createSupabaseMock,
  createTestUser,
  expectOwnershipEq,
  OTHER_USER_ID,
} from "@/test/api-route";
import { getGoalDetailPageData } from "./detail-page";

const aliceGoalId = "22222222-2222-4222-8222-222222222222";

describe("getGoalDetailPageData", () => {
  it("redirects to /dashboard when another user owns the goal", async () => {
    const bob = createTestUser({ id: OTHER_USER_ID });
    const mock = createSupabaseMock();
    mock.queue({ data: null });
    const cookies = createApiContext().cookies;

    const result = await getGoalDetailPageData(mock.client, new Headers(), cookies, bob.id, aliceGoalId);

    expect(result).toEqual({ kind: "redirect", url: "/dashboard" });
    expectOwnershipEq(mock.calls, bob.id, { table: "savings_goals" });
  });
});
