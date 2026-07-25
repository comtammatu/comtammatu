import assert from "node:assert/strict";
import { test } from "node:test";
import { createAuthSocketRetryFetch } from "@comtammatu/database/supabase/middleware";

const refreshUrl =
  "https://example.supabase.co/auth/v1/token?grant_type=refresh_token";

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
