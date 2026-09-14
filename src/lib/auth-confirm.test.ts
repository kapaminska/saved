import { describe, expect, it, vi } from "vitest";
import type { User } from "@supabase/supabase-js";
import { GET } from "@/pages/auth/confirm";
import { asRouteContext, createApiContext, createSupabaseMock, createTestUser } from "@/test/api-route";
import type { SavedSupabaseClient } from "@/lib/supabase";

const user = createTestUser();

function confirmContext(options: { search: string; supabase: SavedSupabaseClient | null }) {
  const url = `https://saved.test/auth/confirm${options.search}`;
  const redirects: string[] = [];
  const ctx = createApiContext({ supabase: options.supabase, url });

  return {
    redirects,
    context: asRouteContext({
      ...ctx,
      request: new Request(url),
      url: new URL(url),
      redirect: (path: string) => {
        redirects.push(path);
        return new Response(null, { status: 302, headers: { Location: path } });
      },
    }),
  };
}

function withAuth(
  mock: ReturnType<typeof createSupabaseMock>,
  auth: {
    verifyOtp?: ReturnType<typeof vi.fn>;
    exchangeCodeForSession?: ReturnType<typeof vi.fn>;
  },
): SavedSupabaseClient {
  return Object.assign(mock.client, {
    auth: {
      verifyOtp: auth.verifyOtp ?? vi.fn(),
      exchangeCodeForSession: auth.exchangeCodeForSession ?? vi.fn(),
    },
  });
}

describe("GET /auth/confirm", () => {
  it("redirects to onboarding after a valid token_hash when the profile has no display name", async () => {
    const mock = createSupabaseMock();
    mock.queue({ data: { display_name: null } });
    const verifyOtp = vi.fn().mockResolvedValue({ data: { user }, error: null });
    const { context, redirects } = confirmContext({
      search: "?token_hash=abc&type=email",
      supabase: withAuth(mock, { verifyOtp }),
    });

    const response = await GET(context);

    expect(verifyOtp).toHaveBeenCalledWith({ token_hash: "abc", type: "email" });
    expect(response.status).toBe(302);
    expect(redirects[0]).toBe("/onboarding");
  });

  it("redirects to dashboard after exchanging a PKCE code when the profile is complete", async () => {
    const mock = createSupabaseMock();
    mock.queue({ data: { display_name: "Ala" } });
    const exchangeCodeForSession = vi.fn().mockResolvedValue({ data: { user }, error: null });
    const { context, redirects } = confirmContext({
      search: "?code=pkce-code",
      supabase: withAuth(mock, { exchangeCodeForSession }),
    });

    await GET(context);

    expect(exchangeCodeForSession).toHaveBeenCalledWith("pkce-code");
    expect(redirects[0]).toBe("/dashboard");
  });

  it("returns to sign-in when the magic link is missing params", async () => {
    const mock = createSupabaseMock();
    const { context, redirects } = confirmContext({
      search: "",
      supabase: withAuth(mock, {}),
    });

    await GET(context);

    expect(redirects[0]).toContain("/auth/signin");
    expect(redirects[0]).toContain("error=");
  });

  it("returns to sign-in when verifyOtp fails", async () => {
    const mock = createSupabaseMock();
    const verifyOtp = vi.fn().mockResolvedValue({
      data: { user: null as User | null },
      error: { message: "Token expired" },
    });
    const { context, redirects } = confirmContext({
      search: "?token_hash=abc&type=email",
      supabase: withAuth(mock, { verifyOtp }),
    });

    await GET(context);

    expect(redirects[0]).toContain("/auth/signin");
  });
});
