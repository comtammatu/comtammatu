import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");

function readRepo(path: string): string {
  return readFileSync(resolve(repoRoot, path), "utf8");
}

function readClockInResolver(): string {
  const actions = readRepo("apps/web/lib/staff-runtime/clock/actions.ts");
  return actions.slice(
    actions.indexOf("async function resolveAssignedShiftForEmployee"),
    actions.indexOf("function revalidateEmployeeWorkPaths"),
  );
}

test("clock-in requires an existing roster assignment", () => {
  const resolver = readClockInResolver();

  assert.match(resolver, /from\("shift_assignments" as never\)/);
  assert.match(resolver, /resolveClockInGate\(assignments,/);
  assert.doesNotMatch(resolver, /resolveDefaultShiftId/);
  assert.doesNotMatch(resolver, /\.from\("shifts"\)/);
  assert.doesNotMatch(resolver, /\.upsert\(/);
  assert.doesNotMatch(resolver, /source:\s*"floor"/);
});

test("clock-in does not bypass the roster writer RPC boundary", () => {
  const resolver = readClockInResolver();

  assert.doesNotMatch(
    resolver,
    /\.from\("shift_assignments" as never\)[\s\S]*?\.(?:insert|upsert|update|delete)\(/,
  );
  assert.doesNotMatch(
    resolver,
    /onConflict:\s*"tenant_id,employee_id,work_date,shift_id"/,
  );
});
