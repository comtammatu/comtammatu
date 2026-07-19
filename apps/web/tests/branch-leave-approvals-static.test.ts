import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

test("Branch leave approvals own a fixed-scope touch presenter", () => {
  const route = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/shift/leave-approvals/page.tsx",
  );
  const client = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/shift/leave-approvals/branch-leave-approvals-client.tsx",
  );
  const data = read("apps/web/lib/hr/branch-leave-approval-data.ts");

  assert.match(route, /loadBranchLeaveApprovalData/);
  assert.match(route, /BranchLeaveApprovalsClient/);
  assert.doesNotMatch(route, /LeaveApprovalsPageContent|EmployeePage|embedded/);

  assert.match(data, /import "server-only"/);
  assert.match(data, /resolveBranchContext/);
  assert.match(data, /branch\.branchId !== routeBranchId/);
  assert.match(data, /PERMISSION_KEYS\.HR_APPROVE_LEAVE_REQUEST/);

  assert.match(client, /BranchOperatorPage/);
  assert.match(client, /<button[\s\S]*type="button"[\s\S]*setSelectedId/);
  assert.match(client, /<SheetContent[\s\S]*side="bottom"/);
  assert.match(client, /useBranchOpsEvents\(\{[\s\S]*branchId/);
  assert.match(
    client,
    /view === "pending"[\s\S]*copy\.historyTab\(historyRows\.length\)/,
  );
  assert.match(client, /md:grid-cols-2/);
  assert.match(client, /size="touch(?:-lg)?"/);
  assert.match(client, /sticky bottom-0/);
  assert.doesNotMatch(
    client,
    /DataTable|LeaveRequestsTable|EmployeePage|SelectTrigger/,
  );
});

test("leave data is neutral while Owner surface keeps its desktop presenter", () => {
  const action = read(
    "apps/web/app/(protected)/hr/leave-request-actions.ts",
  );
  const service = read("apps/web/lib/hr/leave-request-data.ts");
  const dashboardData = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/dashboard/data.ts",
  );
  const migration = read(
    "supabase/migrations/20260718174604_canonical_auth_role_position_cleanup.sql",
  );
  const ownerSurface = read(
    "apps/web/app/(protected)/hr/leave-requests-table.tsx",
  );

  assert.match(action, /fetchLeaveRequestRows/);
  assert.match(
    action,
    /revalidatePath\(`\/br\/\$\{branchId\}\/shift\/leave-approvals`\)/,
  );
  assert.match(service, /fetchLeaveRequestRows/);
  assert.match(service, /annual_leave_balance/);
  assert.match(service, /get_leave_review_queue/);
  assert.match(service, /leaveReviewQueueRowSchema/);
  assert.doesNotMatch(service, /createServiceClient|staffRoleFromPositionCode/);
  assert.match(dashboardData, /get_leave_review_queue/);
  assert.doesNotMatch(
    dashboardData,
    /\.from\("leave_requests"\)|staffRoleFromPositionCode/,
  );
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.get_leave_review_queue\([\s\S]*?SECURITY DEFINER[\s\S]*?SET search_path TO ''/,
  );
  assert.match(
    migration,
    /requester_profile\.branch_id = p_branch_id[\s\S]*?IN \('cashier', 'chef', 'branch_staff'\)/,
  );
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.get_leave_review_queue\(bigint, boolean\)\s+TO authenticated/,
  );
  assert.doesNotMatch(
    migration.match(
      /CREATE OR REPLACE FUNCTION public\.get_leave_review_queue\([\s\S]*?COMMENT ON FUNCTION public\.get_leave_review_queue\(bigint, boolean\)/,
    )?.[0] ?? "",
    /base_salary|bank_account|contract_type|insurance_base|id_number/,
  );
  assert.match(ownerSurface, /DataTable/);
  assert.match(ownerSurface, /@lib\/hr\/leave-request-model/);
  assert.equal(
    existsSync(
      resolve(
        repoRoot,
        "apps/web/app/(protected)/hr/leave-approvals-page-content.tsx",
      ),
    ),
    false,
  );
  assert.equal(
    existsSync(
      resolve(repoRoot, "apps/web/app/(protected)/hr/payroll-day-math.ts"),
    ),
    false,
  );
});
