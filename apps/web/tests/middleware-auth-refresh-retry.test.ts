import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { NextRequest } from "next/server";
import {
  createAuthSocketRetryFetch,
  updateSession,
} from "@comtammatu/database/supabase/middleware";

const refreshUrl =
  "https://example.supabase.co/auth/v1/token?grant_type=refresh_token";
const authCookieName = "sb-example-auth-token";
const terminalSessionCodes = [
  "refresh_token_not_found",
  "refresh_token_already_used",
  "session_expired",
  "session_not_found",
] as const;

function expiredAuthRequest(): NextRequest {
  const session = {
    access_token: "expired-access-token",
    refresh_token: "missing-refresh-token",
    expires_at: Math.floor(Date.now() / 1000) - 60,
  };
  const cookie = `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`;
  return new NextRequest("https://app.example.test/orders", {
    headers: { cookie: `${authCookieName}=${cookie}` },
  });
}

function mockSupabaseEnv(t: TestContext) {
  const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const previousKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test-publishable-key";
  t.after(() => {
    if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
    if (previousKey === undefined) {
      delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    } else {
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = previousKey;
    }
  });
}

function socketCloseError(): TypeError {
  return new TypeError("fetch failed", {
    cause: Object.assign(new Error("other side closed"), {
      code: "UND_ERR_SOCKET",
    }),
  });
}

test("middleware retries one auth refresh socket close", async (t) => {
  const warning = t.mock.method(console, "warn", () => undefined);
  let calls = 0;
  const fetcher: typeof fetch = async () => {
    calls += 1;
    if (calls === 1) throw socketCloseError();
    return new Response(null, { status: 200 });
  };
  const fetchWithRetry = createAuthSocketRetryFetch(fetcher);

  const response = await fetchWithRetry(refreshUrl, { method: "POST" });

  assert.equal(response.status, 200);
  assert.equal(calls, 2);
  assert.deepEqual(warning.mock.calls[0]?.arguments, [
    "[supabase-middleware] retrying auth refresh",
    { code: "UND_ERR_SOCKET", attempt: 2 },
  ]);
});

test("middleware does not retry socket closes for other POST requests", async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () => {
    calls += 1;
    throw socketCloseError();
  };
  const fetchWithRetry = createAuthSocketRetryFetch(fetcher);

  await assert.rejects(
    fetchWithRetry("https://example.supabase.co/rest/v1/rpc/confirm_payment", {
      method: "POST",
    }),
    TypeError,
  );
  assert.equal(calls, 1);
});

test("middleware adds at most one auth refresh attempt per request", async (t) => {
  t.mock.method(console, "warn", () => undefined);
  let calls = 0;
  const fetcher: typeof fetch = async () => {
    calls += 1;
    throw socketCloseError();
  };
  const fetchWithRetry = createAuthSocketRetryFetch(fetcher);

  await assert.rejects(
    fetchWithRetry(refreshUrl, { method: "POST" }),
    TypeError,
  );
  await assert.rejects(
    fetchWithRetry(refreshUrl, { method: "POST" }),
    TypeError,
  );
  assert.equal(calls, 3);
});

test("middleware clears terminal sessions without error-level logs", async (t) => {
  for (const errorCode of terminalSessionCodes) {
    await t.test(errorCode, async (t) => {
      mockSupabaseEnv(t);
      const errorLog = t.mock.method(console, "error", () => undefined);
      const fetcher: typeof fetch = async () =>
        new Response(
          JSON.stringify({
            error_code: errorCode,
            msg: "Session is terminal",
          }),
          { status: 400, headers: { "content-type": "application/json" } },
        );
      t.mock.method(globalThis, "fetch", fetcher);

      const { response, session } = await updateSession(expiredAuthRequest());

      assert.equal(session, null);
      assert.equal(response.cookies.get(authCookieName)?.value, "");
      assert.equal(response.cookies.get(authCookieName)?.maxAge, 0);
      assert.equal(errorLog.mock.calls.length, 0);
    });
  }
});

test("middleware does not turn unrelated auth failures into logout redirects", async (t) => {
  mockSupabaseEnv(t);
  const errorLog = t.mock.method(console, "error", () => undefined);
  const fetcher: typeof fetch = async () =>
    new Response(
      JSON.stringify({
        error_code: "validation_failed",
        msg: "Request rejected",
      }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  t.mock.method(globalThis, "fetch", fetcher);

  await assert.rejects(updateSession(expiredAuthRequest()), (error: unknown) => {
    return (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "validation_failed"
    );
  });
  assert.ok(errorLog.mock.calls.length > 0);
});
