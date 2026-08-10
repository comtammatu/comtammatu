import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const printActionsSource = readFileSync(
  join(process.cwd(), "app/(protected)/br/[branchId]/pos/print-actions.ts"),
  "utf8",
);
const alertsHookSource = readFileSync(
  join(
    process.cwd(),
    "app/(protected)/br/[branchId]/pos/_hooks/use-print-job-alerts.ts",
  ),
  "utf8",
);
const providerSource = readFileSync(
  join(
    process.cwd(),
    "app/(protected)/br/[branchId]/pos/_providers/pos-desktop-provider.tsx",
  ),
  "utf8",
);
const badgeSource = readFileSync(
  join(
    process.cwd(),
    "app/(protected)/br/[branchId]/pos/printer-status-badge.tsx",
  ),
  "utf8",
);
const invoiceListSource = readFileSync(
  join(process.cwd(), "app/(protected)/finance/invoice-list.tsx"),
  "utf8",
);
const toolbarSource = readFileSync(
  join(
    process.cwd(),
    "app/(protected)/br/[branchId]/_components/operational-pwa/toolbar.tsx",
  ),
  "utf8",
);
const pwaToolbarSource = readFileSync(
  join(process.cwd(), "app/components/pwa-toolbar.tsx"),
  "utf8",
);
const pwaRuntimeSource = readFileSync(
  join(process.cwd(), "app/components/pwa-runtime.tsx"),
  "utf8",
);

test("retryPrintJob is gated for the whole POS counter, not managers only", () => {
  assert.doesNotMatch(printActionsSource, /MANAGER_ROLES/);
  assert.match(
    printActionsSource,
    /getAuthContextWithPermission\(\s*POS_ROLES,\s*PERMISSION_KEYS\.POS_PRINT,\s*\);\s*\n\s*if \(!ctx\) return \{ success: false, error: "Không có quyền thử lại" \}/,
  );
});

test("print enqueue actions report agent_offline so callers can downgrade the toast", () => {
  assert.match(printActionsSource, /isPrintAgentOffline/);
  assert.match(printActionsSource, /agent_offline: agentOffline/);
});

test("POS hears the fate of print jobs after enqueue", () => {
  assert.match(alertsHookSource, /table: "print_jobs"/);
  assert.match(alertsHookSource, /FAILED_STATUSES = new Set\(\["failed", "expired"\]\)/);
  assert.match(alertsHookSource, /label: "In lại"/);
  assert.match(alertsHookSource, /retryPrintJob/);
  assert.match(providerSource, /usePrintJobAlerts\(\{ branchId, audioMode \}\)/);
});

test("printer badge surfaces the failed-job count above heartbeat tone", () => {
  assert.match(badgeSource, /\.in\("status", \["failed", "expired"\]\)/);
  assert.match(badgeSource, /failedCount > 0/);
});

test("blocked HĐĐT jobs requeue through their exact work item", () => {
  assert.match(invoiceListSource, /job\.status === "blocked"/);
  assert.match(invoiceListSource, /requeueTaxInvoiceIssueJob\(job\.id\)/);
  assert.doesNotMatch(invoiceListSource, /reissueAllDraftInvoices|createTaxInvoice\(\{/);
});

test("PWA runtime exposes the new-version signal and the toolbar offers reload", () => {
  assert.match(pwaRuntimeSource, /controllerchange/);
  assert.match(pwaRuntimeSource, /export function useHasNewVersion/);
  assert.match(pwaToolbarSource, /useHasNewVersion/);
  assert.match(pwaToolbarSource, /window\.location\.reload\(\)/);
  assert.match(toolbarSource, /"pos" \| "kds" \| "pickup"/);
});
