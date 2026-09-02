import { readSql } from "./_lib/active-sql.ts";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { LayoutDashboard } from "lucide-react";

import {
  flattenInventoryDeepNav,
  partitionControlSurfacePrimaryNav,
  selectControlSurfaceBottomNavItems,
} from "../app/lib/control-surface-nav";
import type { ShellNavGroup, ShellNavItem } from "../app/lib/shell-primitives";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (path: string) =>
  String(path).includes("supabase/migrations/")
    ? readSql(repoRoot, String(path).replace(/^.*?(supabase\/)/, "supabase/"))
    : readFileSync(join(repoRoot, path), "utf8");

function item(href: string, label: string): ShellNavItem {
  return { href, label, icon: LayoutDashboard };
}

// WP0: pin flatten helper shape so removing it is a visible test change.
test("WP0 flattenInventoryDeepNav still exports one untitled group", () => {
  const groups: ShellNavGroup[] = [
    { title: "1 · Kiểm soát tồn", items: [item("/inventory/stock", "Tồn")] },
    { title: "2 · Nhập hàng", items: [item("/inventory/grn", "Nhập")] },
  ];
  const flat = flattenInventoryDeepNav(groups);
  assert.equal(flat.length, 1);
  assert.equal(flat[0]?.title, "");
  assert.deepEqual(
    flat[0]?.items.map((entry) => entry.href),
    ["/inventory/stock", "/inventory/grn"],
  );
});

test("inventory bottom nav prefers Tồn / Nhập / Giao nhận / SX over first-four flatten", () => {
  const groups: ShellNavGroup[] = [
    {
      title: "1 · Kiểm soát tồn",
      items: [
        item("/inventory/stock", "Tồn"),
        item("/inventory/stocktake", "Kiểm kê"),
      ],
    },
    {
      title: "2 · Nhập hàng",
      items: [
        item("/inventory/purchase-orders", "Mua"),
        item("/inventory/grn", "Nhập"),
        item("/inventory/transfers", "Giao nhận"),
      ],
    },
    {
      title: "3 · Sản xuất",
      items: [item("/inventory/production", "SX")],
    },
  ];

  const selected = selectControlSurfaceBottomNavItems({
    groups,
    fallbackItems: [],
    pathname: "/inventory/stock",
    inventory: true,
  });

  assert.deepEqual(
    selected.map((entry) => entry.href),
    [
      "/inventory/stock",
      "/inventory/grn",
      "/inventory/transfers",
      "/inventory/production",
    ],
  );
});

test("inventory bottom nav swaps in the active page when it is outside the four slots", () => {
  const groups: ShellNavGroup[] = [
    {
      title: "1 · Kiểm soát tồn",
      items: [
        item("/inventory/stock", "Tồn"),
        item("/inventory/stocktake", "Kiểm kê"),
      ],
    },
    {
      title: "2 · Nhập hàng",
      items: [
        item("/inventory/grn", "Nhập"),
        item("/inventory/transfers", "Giao nhận"),
      ],
    },
    {
      title: "3 · Sản xuất",
      items: [item("/inventory/production", "SX")],
    },
  ];

  const selected = selectControlSurfaceBottomNavItems({
    groups,
    fallbackItems: [],
    pathname: "/inventory/stocktake/new",
    inventory: true,
  });

  assert.equal(selected.length, 4);
  assert.ok(selected.some((entry) => entry.href === "/inventory/stocktake"));
  assert.ok(selected.some((entry) => entry.href === "/inventory/stock"));
});

test("non-inventory bottom nav keeps first-four plus active swap", () => {
  const groups: ShellNavGroup[] = [
    {
      title: "Tiền",
      items: [
        { ...item("/finance", "Hôm nay"), exact: true },
        item("/finance/bank-transactions", "Ngân hàng"),
        item("/finance/expenses", "Chi phí"),
      ],
    },
    {
      title: "Báo cáo",
      items: [
        item("/finance/revenue", "Doanh thu"),
        item("/finance/food-cost", "Food cost"),
      ],
    },
  ];

  const selected = selectControlSurfaceBottomNavItems({
    groups,
    fallbackItems: [],
    pathname: "/finance/food-cost",
    inventory: false,
  });

  assert.deepEqual(
    selected.map((entry) => entry.href),
    [
      "/finance",
      "/finance/bank-transactions",
      "/finance/expenses",
      "/finance/food-cost",
    ],
  );
});

test("catalog partition keeps membership and isolates menu/promotions/branches/feedback", () => {
  const items = [
    item("/", "Hôm nay"),
    item("/finance", "Tài chính"),
    item("/menu", "Thực đơn"),
    item("/promotions", "Khuyến mãi"),
    item("/branches", "Chi nhánh"),
    item("/feedback", "Phản hồi"),
    item("/settings", "Thiết lập"),
  ];
  const { primary, catalog } = partitionControlSurfacePrimaryNav(items);
  assert.deepEqual(
    primary.map((entry) => entry.href),
    ["/", "/finance", "/settings"],
  );
  assert.deepEqual(
    catalog.map((entry) => entry.href),
    ["/menu", "/promotions", "/branches", "/feedback"],
  );
});

test("shell no longer flattens inventory groups", () => {
  const shell = read("apps/web/app/components/control-surface-shell.tsx");
  assert.doesNotMatch(shell, /flattenInventoryDeepNav/);
});

test("mobile chrome is tools-only and does not compete with the page H1", () => {
  const source = read("apps/web/app/components/app-shell.tsx");
  const shell = read("apps/web/app/components/control-surface-shell.tsx");
  const meHub = read("apps/web/app/(protected)/me/page.tsx");
  const meLeave = read("apps/web/app/(protected)/me/schedule/leave/page.tsx");
  const mePayslip = read("apps/web/app/(protected)/me/payslip/page.tsx");
  const toolsStart = source.indexOf("data-control-surface-mobile-tools");
  const scrollStart = source.indexOf("data-control-surface-scroll");
  assert.notEqual(toolsStart, -1, "mobile tools band must exist");
  assert.notEqual(scrollStart, -1, "scrollport must exist");
  const toolsBand = source.slice(toolsStart, scrollStart);

  assert.match(source, /data-control-surface-mobile-tools/);
  assert.doesNotMatch(source, /data-control-surface-mobile-h1/);
  assert.doesNotMatch(source, /mobileHeaderTitle|mobileTitle/);
  assert.doesNotMatch(shell, /mobileHeaderTitle/);
  assert.doesNotMatch(toolsBand, /<AppPageHeader|<h1\b|headingLevel/);
  assert.match(toolsBand, /mobileScopeAccessory/);
  assert.match(toolsBand, /<NotificationBell/);
  assert.match(toolsBand, /variant="mobile"/);
  assert.doesNotMatch(
    source,
    /justify-end gap-2 border-b border-border\/70 bg-background px-3 lg:hidden/,
  );
  assert.doesNotMatch(
    source,
    /sticky top-0 z-20 shrink-0 border-b[\s\S]*mobileScopeAccessory/,
  );

  assert.match(meHub, /<EmployeePage/);
  assert.doesNotMatch(meHub, /hideHeaderOnMobile/);
  assert.doesNotMatch(meLeave, /hideHeaderOnMobile/);
  assert.doesNotMatch(mePayslip, /hideHeaderOnMobile/);

  const schedule = read("apps/web/lib/staff-runtime/schedule/page.tsx");
  const clock = read("apps/web/lib/staff-runtime/clock/page.tsx");
  const profile = read("apps/web/lib/staff-runtime/profile/page.tsx");
  // Branch plane keeps one AppPageHeader H1 — no hideHeaderOnMobile swap strip.
  assert.doesNotMatch(schedule, /hideHeaderOnMobile=\{plane === "branch"\}/);
  assert.doesNotMatch(clock, /hideHeaderOnMobile=\{plane === "branch"\}/);
  assert.doesNotMatch(
    schedule,
    /<BranchOperatorControlBar className="sm:hidden">/,
  );
  assert.doesNotMatch(
    clock,
    /<BranchOperatorControlBar className="sm:hidden">/,
  );
  assert.doesNotMatch(
    profile,
    /<EmployeePage[\s\S]*hideHeaderOnMobile/,
  );
});
