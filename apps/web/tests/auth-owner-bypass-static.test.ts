import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

test("permission checks never bypass the live RPC for Owner", () => {
  const source = readFileSync(resolve(import.meta.dirname, "../app/_lib/auth.ts"), "utf8");

  assert.doesNotMatch(source, /claims\.user_role === "owner"[\s\S]*return true/);
  assert.match(source, /ctx\.supabase\.rpc\("has_permission"/);
});
