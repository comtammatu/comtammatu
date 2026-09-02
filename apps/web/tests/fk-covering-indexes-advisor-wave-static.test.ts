import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { readSql } from "./_lib/active-sql.ts";

const repoRoot = resolve(import.meta.dirname, "../../..");
const migration = readSql(repoRoot, "supabase/migrations/20260728174910_fk_covering_indexes_advisor_wave.sql");

test("public foreign keys stay indexed in the active schema dump", () => {
  assert.match(migration, /CREATE INDEX idx_/);
});
