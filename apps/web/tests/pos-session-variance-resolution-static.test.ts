import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { resolve } from "node:path";

const repoRoot = resolve(process.cwd(), "../..");

function read(path: string): string {
  return readFileSync(resolve(repoRoot, path), "utf8");
}

test("POS session variance resolution keeps the close-time cash difference immutable", () => {
  const action = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/pos-sessions/actions.ts",
  );
  const client = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/pos-sessions/pos-sessions-client.tsx",
  );
  const migration = read(
    "supabase/migrations/20260705203920_pos_session_variance_resolution.sql",
  );

  assert.match(action, /resolvePosSessionVariance/);
  assert.match(action, /PERMISSION_KEYS\.POS_CLOSE_SHIFT/);
  assert.match(action, /variance_approval_note/);
  assert.match(action, /variance_approver_user_id/);
  assert.doesNotMatch(action, /\.update\(\{[\s\S]*cash_difference/m);

  assert.match(client, /resolvePosSessionVariance/);
  assert.match(client, /varianceResolvedShort/);
  assert.match(client, /varianceResolutionLabel/);

  assert.match(migration, /ps\.variance_approval_note IS NULL/);
  assert.match(
    migration,
    /Aggregate unresolved over-threshold POS cash variance/,
  );
});
