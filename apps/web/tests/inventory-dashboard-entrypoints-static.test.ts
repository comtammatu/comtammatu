import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync("app/(protected)/inventory/dashboard-client.tsx", "utf8");
const messageSource = readFileSync("lib/messages/inventory.ts", "utf8");

test("inventory dashboard keeps the four owner entrypoint groups visible", () => {
  for (const text of [
    'title: "1. Kiểm soát tồn"',
    'title: "2. Nhập/Nhận/Đối soát"',
    'title: "3. Điều phối/Sản xuất"',
    'title: "4. Danh mục & thiết lập"',
    "href: paths.ingredients",
    "href: paths.units",
    "href: paths.suppliers",
    "href: paths.recipes",
    "href: props.showProduction ? paths.production : paths.transfers",
    "primary: !props.showProduction",
    'label: "Lệnh sản xuất"',
    "primary: true",
    "const secondaryActions = flow.actions.filter",
    "{secondaryActions.map((action) => (",
    "<Link href={withBranch(action.href)}>{action.label}</Link>",
  ]) {
    assert.match(source, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.match(messageSource, /mainFlowsTitle: "4 điểm vào vận hành chính"/);
  assert.match(
    messageSource,
    /headerTagline:\s*"4 điểm vào: kiểm soát tồn · nhập\/nhận · điều phối · danh mục."/,
  );
});
