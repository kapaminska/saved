import { describe, expect, it } from "vitest";
import { goalStatus, projectedCompletionDate, requiredPace } from "./projection";

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
