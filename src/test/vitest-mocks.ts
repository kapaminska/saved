import { vi } from "vitest";

const { mockAiRun: hoistedAiRun } = vi.hoisted(() => ({
  mockAiRun: vi.fn(),
}));

export const mockAiRun = hoistedAiRun;

vi.mock("astro:env/server", () => ({
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_KEY: "test-anon-key",
}));

vi.mock("cloudflare:workers", () => ({
  env: {
    AI: {
      run: hoistedAiRun,
    },
  },
}));
