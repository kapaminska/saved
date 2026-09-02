import { afterEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock } from "@/test/api-route";
import { checkRateLimit, recordParseAttempt } from "./rate-limit";

const userId = "11111111-1111-4111-8111-111111111111";

describe("checkRateLimit", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns remaining when usage is under the limit", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-15T12:00:00.000Z"));
    const mock = createSupabaseMock();
    mock.queue({ count: 3, data: null });

    await expect(checkRateLimit(mock.client, userId, 10, 3_600_000)).resolves.toEqual({
      ok: true,
      remaining: 6,
    });
  });

  it("returns not ok when usage is at the limit", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-15T12:00:00.000Z"));
    const mock = createSupabaseMock();
    mock.queue({ count: 10, data: null });
    mock.queue({ data: { created_at: "2026-03-15T11:30:00.000Z" } });

    const result = await checkRateLimit(mock.client, userId, 10, 3_600_000);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.retryAfterMs).toBe(1_800_000);
    }
  });

  it("returns not ok when the count query fails", async () => {
    const mock = createSupabaseMock();
    mock.queueError("db");

    await expect(checkRateLimit(mock.client, userId, 10, 3_600_000)).resolves.toEqual({
      ok: false,
      retryAfterMs: 3_600_000,
    });
  });
});

describe("recordParseAttempt", () => {
  it("resolves when insert succeeds", async () => {
    const mock = createSupabaseMock();
    mock.queue({ data: { id: "r1" } });
    await expect(recordParseAttempt(mock.client, userId)).resolves.toBeUndefined();
  });

  it("throws when insert fails", async () => {
    const mock = createSupabaseMock();
    mock.queueError("insert");
    await expect(recordParseAttempt(mock.client, userId)).rejects.toEqual({ message: "insert" });
  });
});
