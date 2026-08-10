import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

/**
 * Wave 4 — row-open-single-path ratchet (ADR 0018).
 *
 * Locks the contract Waves 1–3 already implemented: one LIST row → one open
 * path / Record Depth doors. Competing overlays (Drawer+Dialog, long-press
 * Drawer beside DETAIL click, Popover-as-detail, fake overflow) fail the gate.
 *
 * Carve-outs (ADR-blessed, not allowlist debt):
 * - C4 zero-action LIST (transfers / production / thresholds) — no menu required
 * - Wave 5 list-first documents — YCM/PO/GRN/YCH/Transfer use query overlays
 * - Dual plane: Owner AppDialog vs Branch Sheet for count slips/assignments
 */

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

/** Competing-path / fake-door bans shared by every Wave 1–3 LIST surface. */
function assertNoCompetingRowOpenPath(source: string, label: string) {
  assert.doesNotMatch(
    source,
    /from "@comtammatu\/ui\/components\/drawer"/,
    `${label}: no Drawer import`,
  );
  assert.doesNotMatch(source, /<Drawer[\s>]/, `${label}: no <Drawer`);
  assert.doesNotMatch(source, /useLongPress/, `${label}: no useLongPress`);
  assert.doesNotMatch(source, /onOpenDrawer/, `${label}: no onOpenDrawer`);
  assert.doesNotMatch(source, /setDrawerRow/, `${label}: no setDrawerRow`);
  assert.doesNotMatch(
    source,
    /from "@comtammatu\/ui\/components\/popover"/,
    `${label}: no Popover import`,
  );
  assert.doesNotMatch(source, /<Popover[\s>]/, `${label}: no <Popover`);
  assert.doesNotMatch(
    source,
    /IconDotsVertical/,
    `${label}: no IconDotsVertical fake overflow`,
  );
}

const D2_DETAIL_LISTS = [
  {
    name: "issues",
    path: "app/(protected)/inventory/issues/issues-client.tsx",
    onRowClick: /onRowClick=\{openIssueDetail\}/,
  },
  {
    name: "stocktake",
    path: "app/(protected)/inventory/stocktake/stocktake-list-client.tsx",
    onRowClick: /onRowClick=\{openStocktakeDetail\}/,
  },
  {
    name: "production",
    path: "app/(protected)/inventory/production/production-runs-client.tsx",
    onRowClick: /onRowClick=\{openProductionDetail\}/,
  },
] as const;

const D1_TASK_LISTS = [
  "app/(protected)/inventory/ingredients/ingredients-client.tsx",
  "app/(protected)/inventory/suppliers/suppliers-client.tsx",
  "app/(protected)/inventory/suppliers/[id]/items/supplier-items-client.tsx",
  "app/(protected)/inventory/menu-recipes/menu-recipes-client.tsx",
  "app/(protected)/inventory/settings/categories/categories-client.tsx",
  "app/(protected)/inventory/settings/units/units-client.tsx",
] as const;

const C4_ZERO_ACTION_LISTS = [
  "app/(protected)/inventory/transfers/stock-fulfillment-hub-client.tsx",
  "app/(protected)/inventory/production/production-runs-client.tsx",
  "app/(protected)/inventory/settings/thresholds/thresholds-client.tsx",
] as const;

const OWNER_D1_VIEW_LISTS = [
  {
    name: "count-slips",
    path: "app/(protected)/inventory/count-slips/count-slips-client.tsx",
  },
  {
    name: "count-assignments",
    path: "app/(protected)/inventory/count-assignments/count-assignments-client.tsx",
  },
] as const;

const BRANCH_D1_VIEW_LISTS = [
  {
    name: "branch-count-slips",
    path: "app/(protected)/br/[branchId]/(operator)/stock/count-slips/branch-count-slips-client.tsx",
  },
  {
    name: "branch-count-assignments",
    path: "app/(protected)/br/[branchId]/(operator)/stock/count-assignments/branch-count-assignments-client.tsx",
  },
] as const;

const FINANCE_INVOICE_LIST =
  "app/(protected)/finance/supplier-invoices/supplier-invoices-client.tsx";
const FINANCE_INVOICE_LIST_UI =
  "app/(protected)/finance/supplier-invoices/supplier-invoice-list-ui.tsx";

function readFinanceInvoiceListModule(): string {
  return `${read(FINANCE_INVOICE_LIST)}\n${read(FINANCE_INVOICE_LIST_UI)}`;
}

const THREE_DOOR_LISTS = [
  "app/(protected)/inventory/grn/grn-list-client.tsx",
  "app/(protected)/inventory/issues/issues-client.tsx",
  "app/(protected)/inventory/stocktake/stocktake-list-client.tsx",
  "app/(protected)/inventory/ingredients/ingredients-client.tsx",
  "app/(protected)/inventory/suppliers/suppliers-client.tsx",
  "app/(protected)/inventory/menu-recipes/menu-recipes-client.tsx",
  "app/(protected)/inventory/settings/categories/categories-client.tsx",
  "app/(protected)/inventory/settings/units/units-client.tsx",
  FINANCE_INVOICE_LIST,
] as const;

test("Wave 4 row-open-single-path: Inventory LIST surfaces ban competing open paths", () => {
  const surfaces = [
    ...D2_DETAIL_LISTS.map((s) => s.path),
    ...D1_TASK_LISTS,
    ...C4_ZERO_ACTION_LISTS,
    ...OWNER_D1_VIEW_LISTS.map((s) => s.path),
    "app/(protected)/inventory/waste/approvals/waste-approvals-client.tsx",
  ];

  for (const path of new Set(surfaces)) {
    assertNoCompetingRowOpenPath(read(path), path);
  }
});

test("Wave 4 D2 DETAIL LISTs: one onRowClick detail path, no overlay record view", () => {
  for (const surface of D2_DETAIL_LISTS) {
    const source = read(surface.path);

    assert.match(source, surface.onRowClick, `${surface.name}: onRowClick`);

    // DETAIL Page is the canonical view — no Sheet/AppDialog as a second view.
    // FormDialog for *create* (issues) is a task, not a record view.
    assert.doesNotMatch(
      source,
      /from "@comtammatu\/ui\/components\/sheet"/,
      `${surface.name}: no Sheet import on D2 LIST`,
    );
    assert.doesNotMatch(
      source,
      /<Sheet[\s>]/,
      `${surface.name}: no <Sheet on D2 LIST`,
    );
    assert.doesNotMatch(
      source,
      /import\s*\{[^}]*AppDialog/,
      `${surface.name}: no AppDialog on D2 LIST`,
    );
    assert.doesNotMatch(
      source,
      /<AppDialog[\s>]/,
      `${surface.name}: no <AppDialog on D2 LIST`,
    );
  }
});

test("Wave 4 D1 task LISTs: single FormDialog/task path, no competing overlays", () => {
  for (const path of D1_TASK_LISTS) {
    const source = read(path);
    assertNoCompetingRowOpenPath(source, path);
    assert.doesNotMatch(
      source,
      /from "@comtammatu\/ui\/components\/sheet"/,
      `${path}: D1 task must not use Sheet as record view`,
    );
    assert.doesNotMatch(source, /<Sheet[\s>]/, `${path}: no <Sheet`);
  }
});

test("Wave 4 C4 zero-action LISTs stay menu-free but still single-path", () => {
  for (const path of C4_ZERO_ACTION_LISTS) {
    const source = read(path);
    assertNoCompetingRowOpenPath(source, path);
    assert.doesNotMatch(source, /<RowActionsMenu/, `${path}: C4 no RowActionsMenu`);
    assert.doesNotMatch(
      source,
      /renderRowContextMenu/,
      `${path}: C4 no renderRowContextMenu`,
    );
  }
});

test("Wave 4 Owner D1 count views: AppDialog only (no Sheet/Drawer dual frame)", () => {
  for (const surface of OWNER_D1_VIEW_LISTS) {
    const source = read(surface.path);
    assertNoCompetingRowOpenPath(source, surface.name);
    assert.match(source, /<AppDialog[\s>]/, `${surface.name}: AppDialog`);
    assert.doesNotMatch(
      source,
      /from "@comtammatu\/ui\/components\/sheet"/,
      `${surface.name}: Owner D1 uses AppDialog, not Sheet`,
    );
    assert.doesNotMatch(source, /<Sheet[\s>]/, `${surface.name}: no <Sheet`);
  }
});

test("Wave 4 Branch D1 count views: Sheet dual-plane carve-out (same depth as Owner)", () => {
  for (const surface of BRANCH_D1_VIEW_LISTS) {
    const source = read(surface.path);
    // Branch may use bottom Sheet / Drawer at D1; current surfaces use Sheet.
    // Still forbid long-press + Popover competing doors and Owner AppDialog import.
    assert.doesNotMatch(
      source,
      /useLongPress/,
      `${surface.name}: no useLongPress dual path`,
    );
    assert.doesNotMatch(
      source,
      /from "@comtammatu\/ui\/components\/popover"/,
      `${surface.name}: no Popover`,
    );
    assert.doesNotMatch(source, /<Popover[\s>]/, `${surface.name}: no <Popover`);
    assert.doesNotMatch(
      source,
      /IconDotsVertical/,
      `${surface.name}: no fake overflow`,
    );
    assert.match(
      source,
      /from "@comtammatu\/ui\/components\/sheet"/,
      `${surface.name}: Branch Sheet dual-plane frame`,
    );
    assert.match(source, /<Sheet[\s>]/, `${surface.name}: <Sheet`);
    assert.doesNotMatch(
      source,
      /import\s*\{[^}]*AppDialog/,
      `${surface.name}: Branch does not import Owner AppDialog`,
    );
  }
});

test("Wave 4 Finance invoice LIST: Sheet D1 view with filter Popover", () => {
  const source = readFinanceInvoiceListModule();
  assert.doesNotMatch(
    read(FINANCE_INVOICE_LIST),
    /from "@comtammatu\/ui\/components\/drawer"|<Drawer[\s>]/,
  );
  assert.doesNotMatch(read(FINANCE_INVOICE_LIST), /useLongPress|onOpenDrawer|setDrawerRow/);
  assert.match(source, /const filterPopover = \(\s*<Popover>/);
  assert.match(source, /filters=\{[\s\S]*\{filterPopover\}[\s\S]*\}/);
  assert.match(
    read(FINANCE_INVOICE_LIST),
    /SupplierInvoiceDetailSheet/,
    "supplier-invoices: Sheet D1 view",
  );
  assert.match(read(FINANCE_INVOICE_LIST), /onRowClick=\{/, "supplier-invoices: onRowClick");
});

test("Wave 4 three-door LISTs keep one RowActionItem[] wiring (no sole ContextMenu path)", () => {
  for (const path of THREE_DOOR_LISTS) {
    const source =
      path === FINANCE_INVOICE_LIST ? readFinanceInvoiceListModule() : read(path);
    assert.match(source, /onRowClick=\{/, `${path}: door 1 onRowClick`);
    if (path.includes("issues/issues-client")) {
      assert.match(
        source,
        /actions=\{getIssueRowActions\(item\)\}/,
        `${path}: door 2 IssueRowCard actions`,
      );
    } else {
      assert.match(source, /<RowActionsMenu/, `${path}: door 2 RowActionsMenu`);
    }
    assert.match(
      source,
      /renderRowContextMenu=\{/,
      `${path}: door 3 renderRowContextMenu`,
    );
    assert.match(
      source,
      /RowActionsContextMenuItems/,
      `${path}: RowActionsContextMenuItems`,
    );
  }
});

test("Wave 5 purchase-orders uses one query-addressed document view", () => {
  const client = read(
    "app/(protected)/inventory/purchase-orders/purchase-orders-client.tsx",
  );
  assert.match(client, /overlay\.patchOverlay/);
  assert.match(client, /poId,/);
  assert.match(client, /mode: nextMode/);
  assert.match(client, /variant="document"/);
  assert.doesNotMatch(client, /DocumentFormFrame/);
});
