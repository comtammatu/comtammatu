import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync("app/(protected)/inventory/dashboard-client.tsx", "utf8");
const messageSource = readFileSync("lib/messages/inventory.ts", "utf8");

test("inventory dashboard keeps the four owner entrypoint groups visible", () => {
  for (const text of [
    "title: messages.inventory.dashboard.controlFlowTitle",
    "title: messages.inventory.dashboard.sourceFlowTitle",
    "title: messages.inventory.dashboard.productionFlowTitle",
    "title: messages.inventory.dashboard.catalogFlowTitle",
    "href: paths.ingredients",
    "href: paths.units",
    "href: paths.suppliers",
    "href: paths.countAssignments",
    "href: paths.countSlips",
    "paths.operationTab(\"grn\")",
    "paths.operationTab(\"transfers\")",
    "if (props.showProduction)",
    "href: paths.production",
    "label: messages.inventory.dashboard.productionCommandAction",
    "primary: true",
    "const secondaryActions = flow.actions.filter",
    "{secondaryActions.map((action) => (",
  ]) {
    assert.match(source, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.match(
    source,
    /render=\{<Link href=\{withBranch\(action\.href\)\} \/>\}[\s\S]*\{action\.label\}/,
  );
  assert.match(
    source,
    /flowCards\.length === 4\s*\?\s*"lg:grid-cols-2 xl:grid-cols-2"\s*:\s*"xl:grid-cols-3"/,
  );

  assert.match(messageSource, /mainFlowsTitle: "Điểm vào vận hành chính"/);
  assert.match(messageSource, /controlFlowTitle: "1\. Kiểm soát tồn"/);
  assert.match(messageSource, /sourceFlowTitle: "2\. Nhập\/Nhận\/Đối soát"/);
  assert.match(messageSource, /productionFlowTitle: "3\. Sản xuất"/);
  assert.match(messageSource, /catalogFlowTitle: "4\. Danh mục & thiết lập"/);
  assert.match(messageSource, /productionCommandAction: "Sản xuất"/);
  assert.match(messageSource, /catalogMetricValue: "3"/);
  assert.match(messageSource, /catalogStatusLabel: "Nguyên liệu \/ ĐVT \/ NCC"/);
  assert.match(
    messageSource,
    /headerTagline:\s*"Điểm vào: kiểm soát tồn · giao dịch kho · sản xuất · danh mục."/,
  );
});
