import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import type { ResolvedOperatorTileGroup } from "@comtammatu/shared/auth";
import { getOperatorMoreGroups } from "../app/(protected)/br/[branchId]/(operator)/_lib/operator-home-contract";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

test("operator more redirects branch floor roles to profile", () => {
  const more = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/more/page.tsx",
  );

  assert.match(more, /branchKind === "branch"/);
  assert.match(more, /claims\.user_role !== "branch_manager"/);
  assert.match(more, /claims\.user_role !== "owner"/);
  assert.match(more, /redirect\(`\/br\/\$\{context\.branchId\}\/profile`\)/);
  assert.match(more, /getOperatorMoreGroups\([\s\S]*claims\.user_role/);
});

test("operator more keeps branch manager overflow narrow", () => {
  const tile = (href: string, moduleKey = "inventory") => ({
    moduleKey,
    href,
    label: href,
    icon: "Package",
    group: "stock",
  });
  const groups = [
    {
      id: "sales_kitchen",
      title: "Sales",
      tiles: [
        tile("/br/1/pos", "pos"),
        tile("/br/1/runner", "runner"),
        tile("/br/1/kds", "kds"),
        tile("/br/1/menu-limits", "branch_menu_limits"),
        tile("/br/1/orders", "orders"),
      ],
    },
    {
      id: "team",
      title: "Team",
      tiles: [
        tile("/br/1/shift/clock", "operator_home"),
        tile("/br/1/shift", "operator_home"),
        tile("/br/1/team", "branch_team"),
      ],
    },
    {
      id: "stock",
      title: "Stock",
      tiles: [
        tile("/br/1/stock"),
        tile("/br/1/stock/receive"),
        tile("/br/1/stock/production", "inventory_procurement"),
        tile("/br/1/stock/transfer"),
        tile("/br/1/stock/stocktake"),
        tile("/br/1/stock/count-assignments", "employee_checkout_approvals"),
        tile("/br/1/stock/waste"),
        tile("/br/1/stock/grn"),
      ],
    },
  ] as ResolvedOperatorTileGroup[];

  const staffMoreHrefs = getOperatorMoreGroups(groups, "branch").flatMap(
    (group) => group.tiles.map((tile) => tile.href),
  );
  const managerMoreHrefs = getOperatorMoreGroups(
    groups,
    "branch",
    "branch_manager",
  ).flatMap((group) => group.tiles.map((tile) => tile.href));

  assert.ok(staffMoreHrefs.includes("/br/1/team"));
  assert.deepEqual(managerMoreHrefs, [
    "/br/1/runner",
    "/br/1/kds",
    "/br/1/stock/production",
    "/br/1/stock/grn",
  ]);
});
