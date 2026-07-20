import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

test("checkout queue and decisions share the live exact-branch hierarchy", () => {
  const migration = read(
    "supabase/migrations/20260718174604_canonical_auth_role_position_cleanup.sql",
  );
  const page = read("apps/web/lib/staff-runtime/checkout-approvals/page.tsx");
  const actions = read("apps/web/lib/staff-runtime/clock/actions.ts");
  const dashboard = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/dashboard/data.ts",
  );
  const workday = read("apps/web/lib/staff-runtime/page.tsx");

  const queueFunction =
    migration.match(
      /CREATE OR REPLACE FUNCTION public\.get_checkout_review_queue\([\s\S]*?COMMENT ON FUNCTION public\.get_checkout_review_queue\(bigint, boolean\)/,
    )?.[0] ?? "";
  assert.match(queueFunction, /SECURITY DEFINER[\s\S]*SET search_path TO ''/);
  assert.match(
    queueFunction,
    /requester_profile\.branch_id = attendance\.branch_id/,
  );
  assert.match(queueFunction, /IN \('cashier', 'chef', 'branch_staff'\)/);
  assert.match(queueFunction, /v_is_owner[\s\S]*?= 'branch_manager'/);
  assert.match(
    queueFunction,
    /GRANT EXECUTE ON FUNCTION public\.get_checkout_review_queue\(bigint, boolean\)[\s\S]*TO authenticated/,
  );

  assert.match(page, /get_checkout_review_queue/);
  assert.match(page, /checkoutReviewRowSchema/);
  assert.doesNotMatch(
    page,
    /createServiceClient|\.from\("attendance_records"\)/,
  );
  assert.match(dashboard, /get_checkout_review_queue/);
  assert.match(workday, /get_checkout_review_queue/);

  for (const functionName of [
    "approve_employee_clock_out",
    "reject_employee_clock_out",
  ]) {
    const functionBody =
      migration.match(
        new RegExp(
          `CREATE OR REPLACE FUNCTION public\\.${functionName}\\([\\s\\S]*?COMMENT ON FUNCTION public\\.${functionName}\\(bigint, text\\)`,
        ),
      )?.[0] ?? "";
    assert.match(functionBody, /auth\.uid\(\)/);
    assert.match(
      functionBody,
      /v_actor_role IS NULL[\s\S]*v_actor_role NOT IN \('owner', 'branch_manager'\)/,
    );
    assert.match(
      functionBody,
      /v_requester_role IS NULL[\s\S]*v_requester_role NOT IN \('cashier', 'chef', 'branch_staff'\)/,
    );
    assert.match(
      functionBody,
      /requester_profile\.branch_id = attendance\.branch_id/,
    );
    assert.match(
      functionBody,
      /public\.has_permission\(v_branch_id, 'hr:approve_checkout'\)/,
    );
    assert.match(functionBody, /IN \('cashier', 'chef', 'branch_staff'\)/);
    assert.match(functionBody, /TO authenticated/);
  }

  assert.match(actions, /ctx\.supabase\.rpc\(\s*"approve_employee_clock_out"/);
  assert.match(actions, /ctx\.supabase\.rpc\(\s*"reject_employee_clock_out"/);
  assert.match(
    migration,
    /DROP FUNCTION IF EXISTS public\.branch_manager_approve_employee_clock_out/,
  );
  assert.match(
    migration,
    /DROP FUNCTION IF EXISTS public\.branch_manager_reject_employee_clock_out/,
  );
});

test("checkout approval RPC signature stays aligned and discoverable", () => {
  const actions = read("apps/web/lib/staff-runtime/clock/actions.ts");
  const migration = read(
    "supabase/migrations/20260718174604_canonical_auth_role_position_cleanup.sql",
  );
  const databaseTypes = read("packages/database/src/types/database.types.ts");
  const cacheReload = read(
    "supabase/migrations/20260720110100_reload_checkout_rpc_schema_cache.sql",
  );

  assert.match(
    actions,
    /"approve_employee_clock_out",\s*\{\s*p_attendance_id: parsed\.data\.attendanceId,\s*p_note: parsed\.data\.note \?\? undefined,/,
  );
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.approve_employee_clock_out\(\s*p_attendance_id bigint,\s*p_note text DEFAULT NULL\s*\)/,
  );
  assert.match(
    databaseTypes,
    /approve_employee_clock_out:\s*\{\s*Args: \{ p_attendance_id: number; p_note\?: string \}/,
  );
  assert.match(cacheReload, /^NOTIFY pgrst, 'reload schema';\s*$/);
});
