import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

test("owner bypasses permission RPC after role allowlist passes", () => {
  const source = readFileSync(
    resolve(import.meta.dirname, "../app/_lib/auth.ts"),
    "utf8",
  );

  assert.match(
    source,
    /if \(ctx\.claims\.user_role === "owner"\) return true;[\s\S]*ctx\.supabase\.rpc\("has_permission_any"/,
  );
});

test("server auth verifies JWT claims and never trusts stored session users", () => {
  const source = readFileSync(
    resolve(import.meta.dirname, "../app/_lib/auth.ts"),
    "utf8",
  );

  assert.doesNotMatch(source, /auth\.getSession\(/);
  assert.equal(source.match(/auth\.getClaims\(\)/g)?.length, 2);
  assert.match(source, /user\.id !== jwtClaims\.sub/);
  assert.match(source, /extractClaimsFromJwtPayload\(jwtClaims\)/);
  assert.match(source, /return \{ supabase, user, claims \};/);
  assert.doesNotMatch(source, /session\.user/);
});

test("login validates claims from the authenticated response instead of cookie state", () => {
  const source = readFileSync(
    resolve(
      import.meta.dirname,
      "../app/(public)/(auth)/login/actions.ts",
    ),
    "utf8",
  );

  assert.match(source, /const \{ data, error \} = await supabase\.auth\.signInWithPassword/);
  assert.match(source, /const session = data\.session;/);
  assert.doesNotMatch(source, /auth\.getSession\(/);
  assert.doesNotMatch(source, /session\.user/);
});
