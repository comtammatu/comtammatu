import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  BRANCH_CODE_PATTERN,
  branchCodeSchema,
} from "../lib/branch-code";

const webRoot = path.resolve(import.meta.dirname, "..");
const repositoryRoot = path.resolve(webRoot, "../..");

test("branch code matches the migration contract", async () => {
  for (const code of ["AB", "XYZ", "ABCD"]) {
    assert.equal(branchCodeSchema.safeParse(code).success, true);
  }

  for (const code of ["D", "ABCDE", "dd", "D1", ""]) {
    assert.equal(branchCodeSchema.safeParse(code).success, false);
  }

  assert.equal(BRANCH_CODE_PATTERN.source, "^[A-Z]{2,4}$");

  const migration = await readFile(
    path.join(
      repositoryRoot,
      "supabase/migration-archive/20260727120000_baseline.sql",
    ),
    "utf8",
  );
  assert.match(
    migration,
    /code ~ '\^\[A-Z\]\{2,4\}\$'/,
  );
});

test("createBranch extracts and inserts the validated branch code", async () => {
  const source = await readFile(
    path.join(webRoot, "app/(protected)/branches/actions.ts"),
    "utf8",
  );

  assert.match(source, /schema: createBranchSchema/);
  assert.match(source, /code: fd\.get\("code"\)/);
  assert.match(source, /code: data\.code/);
  assert.match(source, /tenant_id: claims\.tenant_id/);

  const dialog = await readFile(
    path.join(webRoot, "app/(protected)/branches/branch-form-dialog.tsx"),
    "utf8",
  );
  assert.match(dialog, /name="code"/);
  assert.match(dialog, /return createBranch\(null, fd\)/);
});
