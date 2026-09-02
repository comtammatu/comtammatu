import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";
import { readSql, assertSqlMatch, extractSqlFunction, looksLikeDump } from "./_lib/active-sql.ts";


const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readSql(repoRoot, path);

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

  const queueFunction = extractSqlFunction(
    migration,
    "get_checkout_review_queue",
  );
  assertSqlMatch(queueFunction, /SECURITY DEFINER[\s\S]*SET search_path TO ''/);
  assertSqlMatch(migration,
    /requester_profile\.branch_id = attendance\.branch_id/,
  );
  assertSqlMatch(migration, /IN \('cashier', 'chef', 'branch_staff'\)/);
  assertSqlMatch(migration, /v_is_owner[\s\S]*?= 'branch_manager'/);
  assertSqlMatch(migration,
    /GRANT EXECUTE ON FUNCTION public\.get_checkout_review_queue/,
  );

  assert.match(page, /get_checkout_review_queue/);
  assert.match(page, /checkoutReviewRowSchema/);
  assert.doesNotMatch(
    page,
    /createServiceClient|\.from\("attendance_records"\)/,
  );
  assert.match(page, /loadCheckoutChecklistPhotoMeta/);
  assert.match(page, /allowsPhoto/);
  assert.match(page, /hasPhoto/);
  assert.match(dashboard, /get_checkout_review_queue/);
  assert.match(workday, /get_checkout_review_queue/);

  const photoMeta = read(
    "apps/web/lib/staff-runtime/checkout-approvals/checklist-photo-meta.ts",
  );
  assert.match(photoMeta, /createServiceClient/);
  assert.match(photoMeta, /\.from\("attendance_checklist_items"\)/);

  const client = read(
    "apps/web/lib/staff-runtime/checkout-approvals/checkout-approvals-client.tsx",
  );
  assert.match(client, /getCheckoutChecklistTaskPhotoUrl/);
  assert.match(client, /Xem ảnh minh chứng/);
  assert.match(client, /Ảnh minh chứng việc trong ca/);
  assert.match(client, /data-checkout-approval-row/);
  assert.match(client, /bg-card/);
  assert.match(client, /item\.shiftName/);
  assert.doesNotMatch(client, /EmployeeDetailList/);
  assert.doesNotMatch(
    client,
    /data-checkout-approval-row[\s\S]*?employeeCode/,
  );
  assert.match(actions, /export async function getCheckoutChecklistTaskPhotoUrl/);
  assert.match(actions, /ATTENDANCE_PHOTO_SIGNED_URL_TTL_SECONDS/);
  assert.match(actions, /ATTENDANCE_PHOTO_BUCKET/);
  assert.match(actions, /createSignedUrl\(item\.photo_path/);

  for (const functionName of [
    "approve_employee_clock_out",
    "reject_employee_clock_out",
  ]) {
    if (looksLikeDump(migration)) continue;
    const functionBody = extractSqlFunction(migration, functionName);
    assertSqlMatch(functionBody, /auth\.uid\(\)/);
    assertSqlMatch(functionBody,
      /v_actor_role IS NULL[\s\S]*v_actor_role NOT IN \('owner', 'branch_manager'\)/,
    );
    assertSqlMatch(functionBody,
      /v_requester_role IS NULL[\s\S]*v_requester_role NOT IN \('cashier', 'chef', 'branch_staff'\)/,
    );
    assertSqlMatch(functionBody,
      /requester_profile\.branch_id = attendance\.branch_id/,
    );
    assertSqlMatch(functionBody,
      /public\.has_permission\(v_branch_id, 'hr:approve_checkout'\)/,
    );
    assertSqlMatch(functionBody, /IN \('cashier', 'chef', 'branch_staff'\)/);
    assertSqlMatch(migration, new RegExp(`FUNCTION public\\.${functionName}[\\s\\S]*TO authenticated`));
  }

  assert.match(actions, /ctx\.supabase\.rpc\(\s*"approve_employee_clock_out"/);
  assert.match(actions, /ctx\.supabase\.rpc\(\s*"reject_employee_clock_out"/);
  assertSqlMatch(migration,
    /DROP FUNCTION IF EXISTS public\.branch_manager_approve_employee_clock_out/,
  );
  assertSqlMatch(migration,
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
  assertSqlMatch(migration,
    /CREATE OR REPLACE FUNCTION public\.approve_employee_clock_out\(\s*p_attendance_id bigint,\s*p_note text DEFAULT NULL\s*\)/,
  );
  assert.match(
    databaseTypes,
    /approve_employee_clock_out:\s*\{\s*Args: \{ p_attendance_id: number; p_note\?: string \}/,
  );
  assertSqlMatch(cacheReload, /^NOTIFY pgrst, 'reload schema';\s*$/);
});
