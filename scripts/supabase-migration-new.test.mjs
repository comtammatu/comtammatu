import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("supabase-migration-new creates migration file without hanging", () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "comtammatu-migration-new-"));

  try {
    const scriptDir = join(fixtureRoot, "scripts");
    const migrationsDir = join(fixtureRoot, "supabase", "migrations");
    mkdirSync(scriptDir, { recursive: true });
    mkdirSync(migrationsDir, { recursive: true });

    const scriptSrc = readFileSync("scripts/supabase-migration-new.mjs", "utf8");
    const scriptPath = join(scriptDir, "supabase-migration-new.mjs");
    writeFileSync(scriptPath, scriptSrc, "utf8");

    const result = spawnSync(
      process.execPath,
      [scriptPath, "test_migration_sample"],
      {
        cwd: fixtureRoot,
        encoding: "utf8",
      },
    );

    assert.equal(result.status, 0, result.stderr);
    const files = readdirSync(migrationsDir);
    assert.equal(files.length, 1);
    assert.match(files[0] ?? "", /^\d{14}_test_migration_sample\.sql$/);
  } finally {
    rmSync(fixtureRoot, { force: true, recursive: true });
  }
});

test("supabase-migration-new validates migration name", () => {
  const result = spawnSync(
    process.execPath,
    ["scripts/supabase-migration-new.mjs", "INVALID-NAME!"],
    {
      encoding: "utf8",
    },
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Usage: node scripts\/supabase-migration-new\.mjs/);
});
