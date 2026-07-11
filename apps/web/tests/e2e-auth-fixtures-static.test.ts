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
  const userId = "a0000003-0000-4000-8000-000000000003";

  assert.match(seed, new RegExp(`${userId}[^\\n]*${email}`));
  assert.match(bringup, new RegExp(`E2E_INVENTORY_MANAGER_EMAIL=${email}`));
  assert.match(authSetup, new RegExp(`\\.eq\\("id", "${userId}"\\)`));
});
