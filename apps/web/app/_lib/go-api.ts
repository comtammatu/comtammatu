// Go BE bridge. Forwards the caller's Supabase access_token to the Go service
// (which validates the JWT against the same SUPABASE_JWT_SECRET) so the user's
// identity, tenant, role, and branch claims survive the hop.
//
// Used by server actions that have started migrating off direct supabase.rpc /
// supabase.from(...) calls. Reads stay on Supabase for now; this helper is for
// the write paths where Go owns the validation + side effects (e.g. payment
// settings, MoMo webhook routing, payment confirmation).

import "server-only";

import type { Session } from "@supabase/supabase-js";

/**
 * Resolves the Go backend URL. Reads GO_API_URL at request time so a
 * misconfigured prod deploy fails fast instead of caching a stale value.
 *
 * Defaults to localhost:8080 in development so the team doesn't have to wire
 * an env var on every laptop. Production MUST set GO_API_URL explicitly —
 * we throw rather than silently routing prod payments at localhost.
 */
function resolveBaseUrl(): string {
  const url = process.env.GO_API_URL;
  if (url) return url.replace(/\/+$/, "");
  if (process.env.NODE_ENV === "production") {
    throw new Error("GO_API_URL must be set in production");
  }
  return "http://localhost:8080";
}

export type GoApiError = {
  status: number;
  body: string;
  /** Parsed error message from `{error: "..."}` when present, else raw body. */
  message: string;
};

export type GoApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: GoApiError };

type GoFetchInit = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** Plain object — will be JSON.stringify'd. */
  body?: unknown;
  /** Forwarded to fetch — supports next.revalidate, next.tags, cache, etc. */
  next?: RequestInit["next"];
  /** Forwarded to fetch — supports no-store/force-cache. */
  cache?: RequestCache;
  /** Extra headers; Authorization + Content-Type are injected automatically. */
  headers?: Record<string, string>;
};

/**
 * Server-side fetch to the Go backend. Requires a Supabase session whose
 * `access_token` is forwarded as `Authorization: Bearer`. Throws if the
 * session is missing — the caller is responsible for resolving auth (e.g.
 * via getAuthContext / loadAuthState) before calling.
 *
 * Returns a `GoApiResult` discriminated union. Callers must handle the
 * error branch — we never throw on non-2xx, because Go's "expected" 4xx
 * paths (validation errors, permission denials) are how the action surfaces
 * a user-visible failure to the form.
 */
export async function goFetch<T = unknown>(
  path: string,
  session: Pick<Session, "access_token">,
  init: GoFetchInit = {},
): Promise<GoApiResult<T>> {
  if (!session.access_token) {
    return {
      ok: false,
      error: {
        status: 401,
        body: "",
        message: "missing session access_token",
      },
    };
  }
  if (!path.startsWith("/")) {
    return {
      ok: false,
      error: {
        status: 0,
        body: "",
        message: `goFetch path must start with /: ${path}`,
      },
    };
  }

  const baseUrl = resolveBaseUrl();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${session.access_token}`,
    ...(init.headers ?? {}),
  };
  if (init.body !== undefined && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  let res: Response;
  try {
    res = await fetch(`${baseUrl}${path}`, {
      method: init.method ?? "GET",
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      next: init.next,
      cache: init.cache,
    });
  } catch (err) {
    // Network errors (Go BE down, DNS, timeout) — surface with status 0 so
    // the action can render a "service unavailable" message instead of
    // swallowing the failure.
    return {
      ok: false,
      error: {
        status: 0,
        body: "",
        message: err instanceof Error ? err.message : "network error",
      },
    };
  }

  const bodyText = await res.text();
  if (!res.ok) {
    let message = bodyText || res.statusText;
    try {
      const parsed = JSON.parse(bodyText) as { error?: string };
      if (parsed.error) message = parsed.error;
    } catch {
      // body is not JSON — keep raw bodyText as message
    }
    return {
      ok: false,
      error: { status: res.status, body: bodyText, message },
    };
  }

  // 204 No Content (e.g. webhook ACK) decodes to null — typed as T because
  // callers asking for void responses know they get null back.
  if (res.status === 204 || bodyText === "") {
    return { ok: true, data: null as unknown as T };
  }
  try {
    return { ok: true, data: JSON.parse(bodyText) as T };
  } catch {
    return {
      ok: false,
      error: {
        status: res.status,
        body: bodyText,
        message: "go BE returned non-JSON response",
      },
    };
  }
}
