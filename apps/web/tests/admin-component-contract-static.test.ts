import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

const DATA_TABLE = "apps/web/app/components/data-table/data-table.tsx";
const SURFACE = "apps/web/app/components/surface.tsx";
const PACKAGE_JSON = "package.json";
const UI_AUDIT = "scripts/audit-ui-components.mjs";
const UI_CONTRACT = "scripts/check-ui-contract.mjs";
const DESIGN_SYSTEM = "docs/spec/design-system.md";
const UI_MODULE = "docs/modules/ui.md";
const STATUS_BADGE = "apps/web/app/components/status-badge.tsx";
const SHARED_LABELS = "packages/shared/src/labels/vi.ts";
const BRANCH_TABLE =
  "apps/web/app/(protected)/branches/branch-table.tsx";
const PRINT_JOBS =
  "apps/web/app/(protected)/admin/settings/printers/jobs/print-jobs-client.tsx";
const STAFF_AUDIT = "apps/web/app/(protected)/hr/staff/audit/page.tsx";
const STAFF_AUDIT_TABLE =
  "apps/web/app/(protected)/hr/staff/audit/permission-audit-table.tsx";
const HR_DATA_TABLE_FILES = [
  "apps/web/app/(protected)/hr/attendance-table.tsx",
  "apps/web/app/(protected)/hr/leave-requests-table.tsx",
  "apps/web/app/(protected)/hr/employee-table.tsx",
  "apps/web/app/(protected)/hr/shifts-table.tsx",
  "apps/web/app/(protected)/hr/payroll/payroll-list-client.tsx",
  "apps/web/app/(protected)/hr/payroll/[periodId]/payroll-detail-client.tsx",
];

test("DataTable renders the toolbar contract it exposes", () => {
  const dataTable = read(DATA_TABLE);
  const surface = read(SURFACE);

  assert.match(dataTable, /import \{ Input \}/);
  assert.match(dataTable, /SelectTrigger/);
  assert.match(dataTable, /<AppToolbar[\s\S]*variant="inline"/);
  assert.match(dataTable, /searchable === true/);
  assert.match(dataTable, /filters\.map/);
  assert.match(dataTable, /actions=\{actions\}/);
  assert.match(dataTable, /mobileCardRender\(row, index\)/);
  assert.match(surface, /variant\?: "card" \| "inline"/);
});

test("Batch 1 admin screens use DataTable instead of raw table/card layout", () => {
  for (const file of [BRANCH_TABLE, PRINT_JOBS, STAFF_AUDIT_TABLE]) {
    const source = read(file);
    assert.match(source, /@\/components\/data-table\/data-table/);
    assert.doesNotMatch(source, /@comtammatu\/ui\/components\/table/);
  }

  assert.doesNotMatch(read(STAFF_AUDIT), /@comtammatu\/ui\/components\/card/);
  assert.doesNotMatch(read(STAFF_AUDIT), /@comtammatu\/ui\/components\/table/);
  assert.match(read(STAFF_AUDIT), /PermissionAuditTable/);
});

test("Print job monitor keeps owner recovery filter through DataTable filters", () => {
  const source = read(PRINT_JOBS);

  assert.match(source, /PRINT_JOB_ATTENTION_STATUS = "needs_attention"/);
  assert.match(source, /filters=\{filters\}/);
  assert.match(source, /filterValues=\{\{/);
  assert.match(source, /onFilterChange=\{\(key, value\) =>/);
  assert.match(source, /retryJobFromMonitor/);
});

test("UI contract guard freezes Admin Finance Branch component drift", () => {
  const source = read(UI_CONTRACT);
  const designSystem = read(DESIGN_SYSTEM);
  const uiModule = read(UI_MODULE);

  for (const id of [
    "admin-finance-branch-raw-table-import",
    "admin-finance-branch-raw-card-import",
    "admin-finance-branch-toolbar-fixed-control",
    "raw-card-import-file-baseline",
    "raw-table-import-file-baseline",
    "raw-dialog-import-file-baseline",
    "raw-alert-dialog-import-file-baseline",
  ]) {
    assert.match(source, new RegExp(`id: "${id}"`));
  }

  for (const marker of [
    "frozenPrimitiveImportBaselines",
    'component: "card"',
    'component: "table"',
    'component: "dialog"',
    'component: "alert-dialog"',
  ]) {
    assert.match(
      source,
      new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    );
  }

  assert.match(designSystem, /High-level primitive import governance/);
  assert.match(designSystem, /raw-\*-import-file-baseline/);
  assert.match(uiModule, /raw-card-import-file-baseline/);
  assert.match(uiModule, /raw-alert-dialog-import-file-baseline/);

  assert.doesNotMatch(
    source,
    new RegExp(BRANCH_TABLE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
  );
  assert.doesNotMatch(
    source,
    new RegExp(PRINT_JOBS.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
  );
  assert.doesNotMatch(
    source,
    new RegExp(STAFF_AUDIT.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
  );
});

test("UI component audit command stays wired for route-family drill-down", () => {
  const packageJson = JSON.parse(read(PACKAGE_JSON)) as {
    scripts?: Record<string, string>;
  };
  const auditScript = read(UI_AUDIT);
  const uiModule = read(UI_MODULE);

  assert.equal(
    packageJson.scripts?.["audit:ui-components"],
    "node scripts/audit-ui-components.mjs",
  );

  for (const marker of [
    "ROUTE_FAMILIES",
    "PRIMITIVES",
    "ADAPTERS",
    "parseOptions",
    "--family",
    "--all",
  ]) {
    assert.match(auditScript, new RegExp(marker));
  }

  assert.match(uiModule, /pnpm audit:ui-components/);
  assert.match(uiModule, /route-family summary/);
  assert.match(uiModule, /shared adapter adoption/);
});

test("HR list surfaces use DataTable and shared status badge domains", () => {
  for (const file of HR_DATA_TABLE_FILES) {
    const source = read(file);
    assert.match(source, /@\/components\/data-table\/data-table/);
    assert.doesNotMatch(source, /@comtammatu\/ui\/components\/table/);
  }

  for (const file of [
    "apps/web/app/(protected)/hr/attendance-table.tsx",
    "apps/web/app/(protected)/hr/leave-requests-table.tsx",
    "apps/web/app/(protected)/hr/payroll/payroll-list-client.tsx",
  ]) {
    const source = read(file);
    assert.match(source, /@\/components\/status-badge/);
    assert.doesNotMatch(source, /\bconst\s+[A-Z0-9_]*STATUS[A-Z0-9_]*/);
  }

  const statusBadge = read(STATUS_BADGE);
  const sharedLabels = read(SHARED_LABELS);
  for (const marker of [
    "ATTENDANCE_STATUS_LABELS_VI",
    "LEAVE_REQUEST_STATUS_LABELS_VI",
    "PAYROLL_PERIOD_STATUS_LABELS_VI",
    "attendance",
    "leave-request",
    "payroll-period",
  ]) {
    assert.match(statusBadge + sharedLabels, new RegExp(marker));
  }
});
