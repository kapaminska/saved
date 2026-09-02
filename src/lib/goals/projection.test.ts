import { describe, expect, it } from "vitest";
import {
  averageMonthlyPayment,
  computeGoalMetrics,
  countGoalLifetimeMonths,
  goalStatus,
  projectedCompletionDate,
  requiredPace,
} from "./projection";

const asOfDate = "2026-03-15";

describe("requiredPace", () => {
  it("divides remaining amount by inclusive months until deadline", () => {
    // asOf March 2026 through June 2026 → 4 months; (10000 − 2000) / 4 = 2000
    expect(requiredPace(10_000, 2_000, "2026-06-30", asOfDate)).toBe(2_000);
  });

  it("returns null when the goal has no deadline", () => {
    expect(requiredPace(10_000, 2_000, null, asOfDate)).toBeNull();
  });

  it("returns null when the deadline month is before asOfDate", () => {
    expect(requiredPace(10_000, 2_000, "2026-02-28", asOfDate)).toBeNull();
  });
});

describe("projectedCompletionDate", () => {
  it("returns the first of the month after ceil(remaining / average) months", () => {
    // remaining 100, average 50 → 2 months from March 2026 → 2026-05-01
    expect(projectedCompletionDate(0, 100, 50, asOfDate)).toBe("2026-05-01");
  });

  it("returns null when remaining is zero or negative", () => {
    expect(projectedCompletionDate(100, 100, 50, asOfDate)).toBeNull();
    expect(projectedCompletionDate(150, 100, 50, asOfDate)).toBeNull();
  });

  it("returns null when average monthly payment is zero or negative", () => {
    expect(projectedCompletionDate(0, 100, 0, asOfDate)).toBeNull();
    expect(projectedCompletionDate(0, 100, -10, asOfDate)).toBeNull();
  });
});

describe("goalStatus", () => {
  it("returns ahead when the projected date is before the deadline", () => {
    expect(goalStatus("2026-05-01", "2026-06-30")).toBe("ahead");
  });

  it("returns on_track when the projected date equals the deadline", () => {
    expect(goalStatus("2026-06-01", "2026-06-01")).toBe("on_track");
  });

  it("returns behind when the projected date is after the deadline", () => {
    expect(goalStatus("2026-08-01", "2026-06-30")).toBe("behind");
  });

  it("returns null when deadline or projected date is missing", () => {
    expect(goalStatus(null, "2026-06-30")).toBeNull();
    expect(goalStatus("2026-05-01", null)).toBeNull();
    expect(goalStatus(null, null)).toBeNull();
  });
});

describe("countGoalLifetimeMonths", () => {
  it("counts inclusive months from created_at through asOfDate", () => {
    expect(countGoalLifetimeMonths("2026-01-10T00:00:00.000Z", asOfDate)).toBe(3);
  });

  it("starts the window at the earliest payment month when that is before created_at", () => {
    expect(
      countGoalLifetimeMonths("2026-01-10T00:00:00.000Z", asOfDate, [{ amount: 100, payment_month: "2025-12-01" }]),
    ).toBe(4);
  });
});

describe("averageMonthlyPayment", () => {
  it("divides payment total by every month in the window, including zeros", () => {
    // Jan–Mar 2026, only February has 300 → 100
    expect(
      averageMonthlyPayment("2026-01-10T00:00:00.000Z", asOfDate, [{ amount: 300, payment_month: "2026-02-01" }]),
    ).toBe(100);
  });
});

describe("computeGoalMetrics", () => {
  it("composes pace, projection, status, and average from pinned asOfDate", () => {
    const metrics = computeGoalMetrics(
      {
        target_amount: 10_000,
        saved_amount: 2_000,
        deadline: "2026-06-30",
        created_at: "2026-01-10T00:00:00.000Z",
        status: "active",
      },
      [{ amount: 2_000, payment_month: "2026-02-01" }],
      asOfDate,
    );

    expect(metrics.monthsOfData).toBe(3);
    expect(metrics.averageMonthlyPayment).toBe(2_000 / 3);
    expect(metrics.requiredPace).toBe(2_000);
    expect(metrics.projectedCompletionDate).toBe("2027-03-01");
    expect(metrics.status).toBe("behind");
  });
});
