import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

test("E2E manager fixture matches the seeded manager account", () => {
  const seed = read("../../supabase/seed.sql");
  const bringup = read("../../scripts/supabase-e2e-bringup.mjs");
  const authSetup = read("e2e/auth.setup.ts");
  const email = "manager.datdo@comtammatu.vn";

  assert.match(seed, new RegExp(email));
  assert.match(bringup, new RegExp(`E2E_INVENTORY_MANAGER_EMAIL=${email}`));
  assert.match(authSetup, /resolveUserByEmail\(supabase, email\)/);
  assert.match(authSetup, /\.eq\("branch_kind", "branch"\)/);
  assert.match(authSetup, /\.eq\("code", "branch_manager"\)/);
  assert.match(authSetup, /\.eq\("id", manager\.userId\)/);
});
