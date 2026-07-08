import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const repoRoot = join(import.meta.dirname, "..");

function readWebFile(path: string) {
  return readFileSync(join(repoRoot, path), "utf8");
}

test("inventory dashboard surfaces pending count slips for Branch Manager review", () => {
  const dataSrc = readWebFile("app/(protected)/inventory/_lib/dashboard-data.ts");
  const clientSrc = readWebFile("app/(protected)/inventory/dashboard-client.tsx");
  const pathsSrc = readWebFile("app/(protected)/inventory/_lib/paths.ts");

  assert.match(
    dataSrc,
    /currentUserHasPermissionAny\(PERMISSION_KEYS\.INVENTORY_COUNT_APPROVE\)/,
    "pending count-slip count must stay behind inventory count approval permission",
  );
  assert.match(
    dataSrc,
    /\.from\("inventory_count_slips"\)[\s\S]*\.select\("id", \{ count: "exact", head: true \}\)[\s\S]*\.eq\("status", "submitted"\)/,
    "dashboard data must count submitted inventory count slips",
  );
  assert.match(
    pathsSrc,
    /countSlips: joinInventoryPath\(base, "\/count-slips"\)/,
    "inventory paths must expose count-slip review route",
  );
  assert.match(
    pathsSrc,
    /countAssignments: joinInventoryPath\(base, "\/count-assignments"\)/,
    "inventory paths must expose count assignment route",
  );
  assert.match(
    dataSrc,
    /currentUserHasPermissionAny\(PERMISSION_KEYS\.INVENTORY_COUNT_ASSIGN\)/,
    "dashboard count-assignment link must stay behind inventory count assignment permission",
  );
  assert.match(
    clientSrc,
    /props\.canAssignCounts[\s\S]*Phân công đếm tồn[\s\S]*href: paths\.countAssignments/,
    "dashboard control flow must link count assignment after the sidebar is compressed",
  );
  assert.match(
    clientSrc,
    /pendingCountSlips > 0[\s\S]*phiếu đếm tồn chờ duyệt[\s\S]*href: paths\.countSlips/,
    "dashboard tasks must link pending count slips to the review queue",
  );
});

test("inventory dashboard keeps masked and degraded data truthful", () => {
  const dataSrc = readWebFile("app/(protected)/inventory/_lib/dashboard-data.ts");
  const clientSrc = readWebFile("app/(protected)/inventory/dashboard-client.tsx");
  const messagesSrc = readWebFile("lib/messages/inventory.ts");

  assert.match(dataSrc, /totalStockValue: number \| null/);
  assert.match(dataSrc, /dashboardWarnings: DashboardWarning\[\]/);
  assert.match(dataSrc, /dashboardData\?\.summary\.totalValueVnd \?\? null/);
  assert.doesNotMatch(
    dataSrc,
    /dashboardRes\.data\.summary\.totalValueVnd \?\? 0/,
  );
  assert.match(dataSrc, /dashboardWarnings\.push\("stockValue"\)/);
  assert.match(dataSrc, /dashboardWarnings\.push\("priceReview"\)/);
  assert.match(dataSrc, /dashboardWarnings\.push\("countSlips"\)/);

  assert.match(clientSrc, /stockValueMasked/);
  assert.match(clientSrc, /stockValueUnavailable/);
  assert.match(clientSrc, /<NoteCallout[\s\S]*dataDegradedTitle/);
  assert.match(messagesSrc, /stockValueMasked: "Đã ẩn"/);
  assert.match(messagesSrc, /dataDegradedTitle: "Dữ liệu chưa đầy đủ"/);
});

test("inventory dashboard uses one open-transfer predicate for KPI and list", () => {
  const dataSrc = readWebFile("app/(protected)/inventory/_lib/dashboard-data.ts");
  const clientSrc = readWebFile("app/(protected)/inventory/dashboard-client.tsx");

  assert.match(dataSrc, /const OPEN_TRANSFER_STATUSES = new Set\(/);
  assert.match(dataSrc, /"draft"/);
  assert.match(dataSrc, /"confirmed"/);
  assert.match(
    dataSrc,
    /rawTransfers\.filter\(\s*\(t\) => OPEN_TRANSFER_STATUSES\.has\(t\.status\),\s*\)\.length/,
  );
  assert.match(clientSrc, /function isTransferOpen\(status: string\)/);
  assert.match(clientSrc, /const activeTransferList = transfers\s*\.filter\(\(t\) => isTransferOpen\(t\.status\)\)/);
  assert.doesNotMatch(
    clientSrc,
    /activeTransferList = transfers[\s\S]*\["in_transit",[\s\S]*"confirmed_receive"/,
  );
});
