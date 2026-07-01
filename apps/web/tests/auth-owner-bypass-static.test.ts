import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

test("owner bypasses permission RPC after role allowlist passes", () => {
  const source = readFileSync(resolve(import.meta.dirname, "../app/_lib/auth.ts"), "utf8");

  assert.match(
    source,
    /if \(ctx\.claims\.user_role === "owner"\) return true;[\s\S]*ctx\.supabase\.rpc\("has_permission_any"/,
  );
});
