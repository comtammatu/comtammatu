import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

function readWeb(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function walkFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      files.push(...walkFiles(full));
    } else if (entry.endsWith(".tsx") || entry.endsWith(".ts")) {
      files.push(full);
    }
  }
  return files;
}

const inventoryDir = join(process.cwd(), "app/(protected)/inventory");
const stockClientSource = readWeb(
  "app/(protected)/inventory/stock/stock-client.tsx",
);
const productionDetailSource = readWeb(
  "app/(protected)/inventory/production/[id]/production-detail-client.tsx",
);
const dashboardClientSource = readWeb(
  "app/(protected)/inventory/dashboard-client.tsx",
);
const inventoryMessagesSource = readWeb("lib/messages/inventory.ts");

test("inventory surfaces use approved tint opacity scale", () => {
  const forbiddenTint =
    /\b(?:bg|border|text)-[a-z-]+\/(?:5|12|35)\b|\b(?:bg|border|text)-(?:primary|success|warning|destructive|info|accent|secondary)\/30\b/g;

  const failures = walkFiles(inventoryDir).flatMap((file) => {
    const source = readFileSync(file, "utf8");
    const matches = [...source.matchAll(forbiddenTint)].map((match) => {
      const rel = file.slice(process.cwd().length + 1);
      return `${rel}: ${match[0]}`;
    });
    return matches;
  });

  assert.deepEqual(failures, []);
});

test("inventory production shortage uses Alert callout", () => {
  assert.match(productionDetailSource, /<Alert variant="destructive">/);
  assert.doesNotMatch(
    productionDetailSource,
    /rounded-md border border-destructive/,
  );
});

test("inventory stock kitchen transfer copy is dictionary-backed", () => {
  assert.match(inventoryMessagesSource, /transferKitchen: "Chuyển Bếp"/);
  assert.doesNotMatch(stockClientSource, /label: "Chuyển Bếp"/);
  assert.doesNotMatch(stockClientSource, />\s*Chuyển Bếp\s*</);
  assert.match(stockClientSource, /stockCopy\.actions\.transferKitchen/);
});

test("inventory dashboard flow copy is dictionary-backed", () => {
  const hardcodedDashboardCopy =
    /"Phân công đếm tồn"|"Duyệt phiếu đếm tồn"|"Lệnh sản xuất"|"1\. Kiểm soát tồn"|"2\. Nhập\/Nhận\/Đối soát"|"3\. Điều phối\/Sản xuất"|"4\. Danh mục & thiết lập"|`\$\{pendingCountSlips\} phiếu đếm tồn chờ duyệt`/;

  assert.doesNotMatch(dashboardClientSource, hardcodedDashboardCopy);
  for (const key of [
    "assignCountsAction",
    "approveCountSlipsAction",
    "productionCommandAction",
    "controlFlowTitle",
    "sourceFlowTitle",
    "productionFlowTitle",
    "catalogFlowTitle",
    "countSlipsPendingTask",
  ]) {
    assert.match(inventoryMessagesSource, new RegExp(`${key}:`));
  }
});
