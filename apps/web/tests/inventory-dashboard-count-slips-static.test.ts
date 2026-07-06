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
