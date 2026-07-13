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
  assert.match(route, /query\.view === "history" \? "history" : "pending"/);
  assert.doesNotMatch(route, /LeaveApprovalsPageContent|EmployeePage|embedded/);

  assert.match(data, /import "server-only"/);
  assert.match(data, /resolveBranchContext/);
  assert.match(data, /branch\.branchId !== routeBranchId/);
  assert.match(data, /PERMISSION_KEYS\.HR_APPROVE_LEAVE_REQUEST/);

  assert.match(client, /BranchOperatorPage/);
  assert.match(client, /<button[\s\S]*type="button"[\s\S]*setSelectedId/);
  assert.match(client, /<SheetContent[\s\S]*side="bottom"/);
  assert.match(client, /<SheetDescription className="sr-only">/);
  assert.match(client, /useBranchOpsEvents\(\{[\s\S]*branchId/);
  assert.match(
    client,
    /href=\{`\/br\/\$\{branchId\}\/shift\/leave-approvals\?view=pending`\}/,
  );
  assert.match(
    client,
    /href=\{`\/br\/\$\{branchId\}\/shift\/leave-approvals\?view=history`\}/,
  );
  assert.match(client, /<ItemGroup>[\s\S]*size="sm"/);
  assert.match(client, /size="touch(?:-lg)?"/);
  assert.match(client, /<SheetFooter className="[^"]*sticky bottom-0/);
  assert.doesNotMatch(client, /BranchOperatorPanel|md:grid-cols-2|setView/);
  assert.doesNotMatch(
    client,
    /DataTable|LeaveRequestsTable|EmployeePage|SelectTrigger/,
  );
});

test("leave data is neutral while Admin Dashboard keeps its desktop presenter", () => {
  const action = read("apps/web/app/(protected)/hr/leave-request-actions.ts");
  const service = read("apps/web/lib/hr/leave-request-data.ts");
  const adminDashboard = read(
    "apps/web/app/(protected)/hr/leave-requests-table.tsx",
  );

  assert.match(action, /fetchLeaveRequestRows/);
  assert.match(
    action,
    /revalidatePath\(`\/br\/\$\{branchId\}\/shift\/leave-approvals`\)/,
  );
  assert.match(service, /fetchLeaveRequestRows/);
  assert.match(service, /annual_leave_balance/);
  assert.match(adminDashboard, /DataTable/);
  assert.match(adminDashboard, /@lib\/hr\/leave-request-model/);
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
