import { describe, expect, it } from "vitest";
import { computeNetWorth, getNetWorthHeadline, isAssetStale } from "./compute";

describe("computeNetWorth", () => {
  it("subtracts liability totals from asset totals", () => {
    expect(computeNetWorth([{ amount: 100 }, { amount: 50 }], [{ amount: 30 }])).toBe(120);
  });

  it("returns a negative value when liabilities exceed assets", () => {
    expect(computeNetWorth([{ amount: 10 }], [{ amount: 40 }])).toBe(-30);
  });
});

describe("isAssetStale", () => {
  const now = new Date(2026, 5, 15);

  it("is stale when last_updated_at is older than three calendar months before now", () => {
    expect(isAssetStale(new Date(2026, 2, 14).toISOString(), now)).toBe(true);
  });

  it("is not stale inside the three-month window", () => {
    expect(isAssetStale(new Date(2026, 2, 16).toISOString(), now)).toBe(false);
  });
});

describe("getNetWorthHeadline", () => {
  it("uses the plural headline for married and partnership", () => {
    expect(getNetWorthHeadline("married")).toBe("Wasza wartość netto");
    expect(getNetWorthHeadline("partnership")).toBe("Wasza wartość netto");
  });

  it("uses the singular headline otherwise", () => {
    expect(getNetWorthHeadline("single")).toBe("Twoja wartość netto");
    expect(getNetWorthHeadline(null)).toBe("Twoja wartość netto");
  });
});
