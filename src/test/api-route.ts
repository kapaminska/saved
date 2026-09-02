import type { APIContext, APIRoute, AstroCookies } from "astro";
import type { User } from "@supabase/supabase-js";
import type { SavedSupabaseClient } from "@/lib/supabase";

export type HandlerContext = APIContext;

export interface MockQueryResult {
  data: unknown;
  error: { message: string } | null;
  count: number | null;
}

export interface SupabaseMockCall {
  table: string;
  method: string;
  args: unknown[];
}

const noopCookies = {
  get: () => undefined,
  set: () => undefined,
  delete: () => undefined,
  has: () => false,
} as unknown as AstroCookies;

export function createTestUser(overrides: Partial<User> = {}): User {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    aud: "authenticated",
    role: "authenticated",
    email: "alice@example.com",
    app_metadata: {},
    user_metadata: {},
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

export interface CreateApiContextOptions {
  user?: User | null;
  supabase?: SavedSupabaseClient | null;
  form?: Record<string, string | string[]>;
  json?: unknown;
  params?: APIContext["params"];
  url?: string;
}

export function createApiContext(options: CreateApiContextOptions = {}): HandlerContext {
  const url = options.url ?? "https://saved.test/api/test";
  const request = buildRequest(url, options);

  return {
    locals: {
      user: options.user ?? null,
      profile: null,
      supabase: options.supabase ?? null,
    },
    request,
    cookies: noopCookies,
    params: options.params ?? {},
  } as HandlerContext;
}

function buildRequest(url: string, options: CreateApiContextOptions): Request {
  if (options.json !== undefined) {
    return new Request(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(options.json),
    });
  }

  const form = new FormData();
  if (options.form) {
    for (const [key, value] of Object.entries(options.form)) {
      if (Array.isArray(value)) {
        for (const item of value) {
          form.append(key, item);
        }
      } else {
        form.append(key, value);
      }
    }
  }

  return new Request(url, { method: "POST", body: form });
}

export function createSupabaseMock() {
  const queue: MockQueryResult[] = [];
  const calls: SupabaseMockCall[] = [];

  function take(): MockQueryResult {
    const next = queue.shift();
    if (!next) {
      throw new Error("Supabase mock queue underflow");
    }
    return next;
  }

  function builder(table: string) {
    const record = (method: string, args: unknown[]) => {
      calls.push({ table, method, args });
    };

    const chain: unknown = new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === "then") {
            const result = take();
            return (onFulfilled?: (value: MockQueryResult) => unknown, onRejected?: (reason: unknown) => unknown) =>
              Promise.resolve(result).then(onFulfilled, onRejected);
          }

          if (prop === "single" || prop === "maybeSingle") {
            return () => {
              record(prop, []);
              return Promise.resolve(take());
            };
          }

          return (...args: unknown[]) => {
            record(typeof prop === "string" ? prop : String(prop), args);
            return chain;
          };
        },
      },
    );

    return chain;
  }

  const client = {
    from(table: string) {
      calls.push({ table, method: "from", args: [table] });
      return builder(table);
    },
  } as unknown as SavedSupabaseClient;

  return {
    client,
    calls,
    queue(result: Partial<MockQueryResult> = {}) {
      queue.push({
        data: result.data ?? null,
        error: result.error ?? null,
        count: result.count ?? null,
      });
    },
    queueError(message: string) {
      queue.push({ data: null, error: { message }, count: null });
    },
  };
}

export function asRouteContext(context: HandlerContext): Parameters<APIRoute>[0] {
  return context;
}
