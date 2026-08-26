import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import {
  AUTH_SESSION_CLEAR_PATH,
  isRevokedAuthSessionError,
  probeAuthSessionLiveness,
} from "../app/_lib/auth-session-liveness";

const readWeb = (rel: string) =>
  readFileSync(resolve(import.meta.dirname, "..", rel), "utf8");

test("isRevokedAuthSessionError recognizes Auth session revoke codes", () => {
  assert.equal(
    isRevokedAuthSessionError({
      name: "AuthSessionMissingError",
      code: "session_not_found",
    }),
    true,
  );
  assert.equal(isRevokedAuthSessionError({ code: "session_not_found" }), true);
  assert.equal(isRevokedAuthSessionError({ code: "session_expired" }), true);
  assert.equal(
    isRevokedAuthSessionError({ code: "refresh_token_not_found" }),
    true,
  );
  assert.equal(
    isRevokedAuthSessionError({ code: "refresh_token_already_used" }),
    true,
  );
  assert.equal(
    isRevokedAuthSessionError({ code: "unexpected_failure" }),
    false,
  );
  assert.equal(isRevokedAuthSessionError(null), false);
  assert.equal(isRevokedAuthSessionError("boom"), false);
});

test("probeAuthSessionLiveness redirects to signout on revoked Auth session", async () => {
  let receivedToken: string | undefined;
  const supabase = {
    auth: {
      getUser: async (accessToken?: string) => {
        receivedToken = accessToken;
        return {
          data: { user: null },
          error: {
            name: "AuthSessionMissingError",
            code: "session_not_found",
          },
        };
      },
    },
  };

  await assert.rejects(
    () =>
      probeAuthSessionLiveness(
        supabase as Parameters<typeof probeAuthSessionLiveness>[0],
        "access-token",
      ),
    (error: unknown) => {
      const text = String(
        error && typeof error === "object" && "digest" in error
          ? (error as { digest?: string }).digest
          : error,
      );
      // next/navigation redirect() throws NEXT_REDIRECT (digest or message).
      return (
        text.includes(AUTH_SESSION_CLEAR_PATH) ||
        text.includes("NEXT_REDIRECT") ||
        (typeof error === "object" &&
          error !== null &&
          "digest" in error &&
          typeof (error as { digest?: unknown }).digest === "string")
      );
    },
  );
  assert.equal(receivedToken, "access-token");
});

test("probeAuthSessionLiveness returns the verified live user", async () => {
  const user = { id: "user-1" };
  const supabase = {
    auth: {
      getUser: async () => ({
        data: { user },
        error: null,
      }),
    },
  };

  assert.equal(
    await probeAuthSessionLiveness(
      supabase as Parameters<typeof probeAuthSessionLiveness>[0],
      "access-token",
    ),
    user,
  );
});

test("probeAuthSessionLiveness skips incomplete fakes without getUser", async () => {
  const supabase = { auth: {} };
  assert.equal(
    await probeAuthSessionLiveness(
      supabase as Parameters<typeof probeAuthSessionLiveness>[0],
      "access-token",
    ),
    null,
  );
});

test("probeAuthSessionLiveness preserves non-revoked Auth failures", async () => {
  const supabase = {
    auth: {
      getUser: async () => ({
        data: { user: null },
        error: { code: "unexpected_failure" },
      }),
    },
  };

  assert.equal(
    await probeAuthSessionLiveness(
      supabase as Parameters<typeof probeAuthSessionLiveness>[0],
      "access-token",
    ),
    null,
  );
});

test("loadAuthState probes Auth liveness; getAuthContext stays getSession-only", () => {
  const source = readWeb("app/_lib/auth.ts");
  // Strip comments so doc mentions of getUser / probe helpers do not fail
  // the executable-code invariant (mirrors lint:regression-guards).
  const codeOnly = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
  const getAuthStart = codeOnly.indexOf("export const getAuthContext");
  const getAuthEnd = codeOnly.indexOf("type PermissionLike", getAuthStart);
  const loadAuthStart = codeOnly.indexOf("export const loadAuthState");
  assert.ok(getAuthStart >= 0 && getAuthEnd > getAuthStart);
  assert.ok(loadAuthStart > getAuthEnd);

  const getAuthBody = codeOnly.slice(getAuthStart, getAuthEnd);
  assert.match(getAuthBody, /await supabase\.auth\.getSession\(\)/);
  assert.doesNotMatch(getAuthBody, /supabase\.auth\.getUser\(/);
  assert.doesNotMatch(getAuthBody, /probeAuthSessionLiveness/);
  // User id comes from the JWT `sub`, never the insecure-user warning
  // proxy around `session.user` (auth-js logs on every property read).
  assert.match(getAuthBody, /extractUserIdFromAccessToken\(/);
  assert.doesNotMatch(getAuthBody, /session\.user\b/);
  assert.match(getAuthBody, /return \{ supabase, claims, userId \}/);

  const loadAuthBody = codeOnly.slice(loadAuthStart);
  assert.match(loadAuthBody, /await supabase\.auth\.getSession\(\)/);
  assert.match(
    loadAuthBody,
    /const user = await probeAuthSessionLiveness\([\s\S]*supabase,[\s\S]*session\.access_token/,
  );
  assert.match(
    loadAuthBody,
    /return \{ supabase, session, claims, user, userId \}/,
  );
  assert.match(loadAuthBody, /extractUserIdFromAccessToken\(/);
  assert.doesNotMatch(loadAuthBody, /session\.user\b/);
  assert.doesNotMatch(loadAuthBody, /supabase\.auth\.getUser\(/);
});

test("auth-session-liveness redirects revoked sessions to cookie-clear signout", () => {
  const source = readWeb("app/_lib/auth-session-liveness.ts");
  assert.match(source, /auth\?\.getUser/);
  assert.match(source, /getUser\.call\(/);
  assert.match(source, /getUser\.call\(supabase\.auth, accessToken\)/);
  assert.match(source, /AUTH_SESSION_CLEAR_PATH/);
  assert.match(source, /\/api\/auth\/signout/);
  assert.match(source, /redirect\(AUTH_SESSION_CLEAR_PATH\)/);
  assert.match(source, /isRevokedAuthSessionError/);
});

test("signout Route Handler supports GET for RSC zombie recovery", () => {
  const source = readWeb("app/api/auth/signout/route.ts");
  assert.match(source, /export async function GET\(/);
  assert.match(source, /export async function POST\(/);
  assert.match(source, /signOut\(\{\s*scope:\s*["']local["']\s*\}\)/);
  assert.match(source, /\/login/);
});

test("POS layout calls loadAuthState for far-from-expiry zombie clear", () => {
  const source = readWeb("app/(protected)/br/[branchId]/pos/layout.tsx");
  assert.match(source, /await loadAuthState\(\)/);
});

test("persistent control-surface shell never reads the unverified session user", () => {
  const protectedLayout = readWeb("app/(protected)/layout.tsx");
  assert.match(
    protectedLayout,
    /const \{[^}]*\buser\b[^}]*\} = await loadAuthState\(\)/,
  );
  assert.doesNotMatch(protectedLayout, /session\.user\./);

  for (const layout of [
    "app/(protected)/branches/layout.tsx",
    "app/(protected)/feedback/layout.tsx",
    "app/(protected)/inventory/layout.tsx",
  ]) {
    const source = readWeb(layout);
    assert.doesNotMatch(source, /session\.user\./);
  }
});

test("proxy and middleware still never call getUser", () => {
  assert.doesNotMatch(readWeb("proxy.ts"), /\.getUser\(\)/);
  assert.doesNotMatch(
    readFileSync(
      resolve(
        import.meta.dirname,
        "../../../packages/database/src/supabase/middleware.ts",
      ),
      "utf8",
    ),
    /\.getUser\(\)/,
  );
  assert.doesNotMatch(readWeb("app/_lib/auth.ts"), /\.getUser\(\)/);
});

test("protected navigation does not prefetch one Auth probe per visible target", () => {
  const protectedLink = readWeb("app/_components/protected-link.tsx");
  assert.match(protectedLink, /prefetch=\{false\}/);
  assert.match(protectedLink, /Omit<ComponentProps<typeof Link>, "prefetch">/);

  for (const path of [
    "app/components/app-shell.tsx",
    "app/components/app-bottom-nav.tsx",
    "app/components/surface/app-link-card.tsx",
    "lib/branch-operator/components/branch-operator-page.tsx",
    "lib/staff-runtime/components/staff-runtime-page.tsx",
  ]) {
    const source = readWeb(path);
    assert.match(source, /ProtectedLink/);
    assert.doesNotMatch(source, /from "next\/link"/);
  }
});

test("initial schedule RSC reuses its employee context without invoking a Server Action", () => {
  const page = readWeb("lib/staff-runtime/schedule/page.tsx");
  const action = readWeb("lib/staff-runtime/schedule/actions.ts");
  const data = readWeb("lib/staff-runtime/schedule/data.ts");

  assert.match(page, /loadScheduleMonth\(ctx, monthStart\)/);
  assert.doesNotMatch(page, /fetchMySchedule\(monthStart\)/);
  assert.match(action, /const ctx = await getEmployeeContext\(\)/);
  assert.match(action, /return loadScheduleMonth\(ctx, monthStartDate\)/);
  assert.match(data, /export async function loadScheduleMonth\(/);
  assert.doesNotMatch(data, /["']use server["']/);
});
