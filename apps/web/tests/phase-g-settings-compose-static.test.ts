import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

/**
 * Phase G — Control Surface settings compose ratchet:
 * activity LIST-in-frame, print jobs LIST, templates DETAIL editor,
 * notifications feed lock, orders copy centralization.
 */

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

test("Activity LIST uses SettingsPageFrame xwide with DataTable empty in frame", () => {
  const page = read("app/(protected)/settings/activity/page.tsx");
  const client = read(
    "app/(protected)/settings/activity/system-activity-client.tsx",
  );
  const filters = read(
    "app/(protected)/settings/activity/system-activity-filters.tsx",
  );
  const table = read(
    "app/(protected)/settings/activity/system-activity-table.tsx",
  );

  assert.match(page, /SettingsPageFrame/);
  assert.match(page, /width="xwide"/);
  assert.match(client, /AppListFrame/);
  assert.match(client, /SystemActivityTable/);
  assert.match(client, /emptyTitle=/);
  assert.doesNotMatch(client, /AppEmptyState/);
  assert.match(filters, /AppToolbar[\s\S]*variant="inline"/);
  assert.doesNotMatch(filters, /<AppToolbar\s+sticky\b/);
  assert.match(table, /DataTable/);
  assert.match(table, /emptyTitle/);
});

test("Print jobs LIST uses SettingsPageFrame KPI row and inline DataTable frame", () => {
  const page = read("app/(protected)/settings/printers/jobs/page.tsx");
  const client = read(
    "app/(protected)/settings/printers/jobs/print-jobs-client.tsx",
  );

  assert.match(page, /SettingsPageFrame/);
  assert.match(page, /KpiRow/);
  assert.match(page, /PrintJobsClient/);
  assert.match(client, /AppListFrame/);
  assert.match(client, /AppToolbar[\s\S]*variant="inline"/);
  assert.match(client, /DataTable/);
  assert.match(client, /mobileCardRender/);
  assert.doesNotMatch(client, /<AppToolbar\s+sticky\b/);
});

test("Print templates stays DETAIL editor without AppListFrame LIST recipe", () => {
  const page = read("app/(protected)/settings/printers/templates/page.tsx");
  const client = read(
    "app/(protected)/settings/printers/templates/templates-client.tsx",
  );

  assert.match(page, /SettingsPageFrame/);
  assert.doesNotMatch(page, /AppListFrame/);
  assert.doesNotMatch(client, /AppListFrame/);
});

test("Notifications feed uses AppListFrame without DataTable", () => {
  const client = read(
    "app/(protected)/notifications/notifications-client.tsx",
  );

  assert.match(client, /AppListFrame/);
  assert.match(client, /NotificationList/);
  assert.match(client, /NotificationFeedFilter/);
  assert.doesNotMatch(client, /DataTable/);
});

test("Orders copy lives in @lib/messages/orders and page-local file is retired", () => {
  const ordersMessages = read("lib/messages/orders.ts");
  const ordersIndex = read("lib/messages/index.ts");
  const oldPath = join(
    process.cwd(),
    "app/(protected)/orders/orders-copy.ts",
  );

  assert.equal(existsSync(oldPath), false);
  assert.match(ordersMessages, /export const orders/);
  assert.match(ordersIndex, /orders/);

  for (const file of [
    "app/(protected)/orders/page.tsx",
    "app/(protected)/orders/orders-page-body.tsx",
    "app/(protected)/orders/refunds-client.tsx",
    "app/(protected)/orders/order-detail-sheet.tsx",
    "app/(protected)/orders/_lib/order-wait-time.ts",
    "app/(protected)/br/[branchId]/(operator)/orders/page.tsx",
    "app/(protected)/br/[branchId]/(operator)/orders/operator-orders-client.tsx",
  ]) {
    const source = read(file);
    assert.match(
      source,
      /@lib\/messages\/orders/,
      `${file} must import orders from @lib/messages/orders`,
    );
    assert.doesNotMatch(source, /orders-copy/);
  }
});
