import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const migrationsDir = resolve(repoRoot, "supabase/migrations");

test("historical migrations stay outside the Preview migration input", () => {
  assert.equal(existsSync(resolve(migrationsDir, "_archive")), false);
  assert.equal(existsSync(resolve(repoRoot, "supabase/migration-archive")), false);
  assert.ok(
    readdirSync(migrationsDir).every(
      (entry) =>
        entry.startsWith(".") ||
        entry === "README.md" ||
        /^\d{14}_.+\.sql$/.test(entry),
    ),
  );
});
