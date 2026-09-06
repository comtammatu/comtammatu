import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../../..", import.meta.url));

function read(relativePath: string): string {
  return readFileSync(`${repositoryRoot}/${relativePath}`, "utf8");
}

test("Branch table management and POS table gate enforce 48px touch controls and responsive multi-column layouts", () => {
  const tablesClient = read(
    "apps/web/app/(protected)/br/_shared/settings/tables/tables-client.tsx",
  );
  const tableTable = read(
    "apps/web/app/(protected)/br/_shared/settings/tables/table-table.tsx",
  );
  const zoneTable = read(
    "apps/web/app/(protected)/br/_shared/settings/tables/zone-table.tsx",
  );
  const posTableGate = read(
    "apps/web/app/(protected)/br/[branchId]/pos/pos-table-gate.tsx",
  );
  const transferTableDialog = read(
    "apps/web/app/(protected)/br/[branchId]/pos/_components/order-detail/transfer-table-dialog.tsx",
  );
  const multiOrderTablePicker = read(
    "apps/web/app/(protected)/br/[branchId]/pos/_components/multi-order-table-picker.tsx",
  );

  // TablesClient toolbar adapts controlSize and enforces size="touch"
  assert.match(
    tablesClient,
    /controlSize = embedded \? "touch" : "field"/,
    "TablesClient must adapt controlSize based on embedded prop",
  );
  assert.match(
    tablesClient,
    /<SelectTrigger[\s\S]*?id="branch-select"[\s\S]*?size=\{controlSize\}/,
    "TablesClient branch SelectTrigger must use controlSize",
  );
  assert.match(
    tablesClient,
    /<TabsList size="touch" layout="equal">/,
    "TablesClient tabs must use size touch and equal layout",
  );
  assert.match(
    tablesClient,
    /<Button[\s\S]*?size="touch"[\s\S]*?onClick=\{[()\s=>]*setTableDialogOpen\(true\)\}/,
    "Add table button must use size touch",
  );

  // DiningTableSettingsList and ZoneTable enforce 3-column desktop grid and min-h-12
  assert.match(
    tableTable,
    /<ItemGroup className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">/,
    "DiningTableSettingsList must use responsive 3-column grid",
  );
  assert.match(
    tableTable,
    /min-h-12/,
    "DiningTableSettingsList item cards must enforce 48px min-h-12",
  );
  assert.match(
    zoneTable,
    /<ItemGroup className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">/,
    "ZoneTable must use responsive 3-column grid",
  );
  assert.match(
    zoneTable,
    /min-h-12/,
    "ZoneTable item cards must enforce 48px min-h-12",
  );

  // POS table gate enforces OperationalTile with size="tile", touch-manipulation, and multi-column grid
  assert.match(
    posTableGate,
    /<OperationalTile[\s\S]*?size="tile"/,
    "PosTableGate TableButton must use OperationalTile size tile",
  );
  assert.match(
    posTableGate,
    /touch-manipulation/,
    "PosTableGate TableButton must declare touch-manipulation",
  );
  assert.match(
    posTableGate,
    /grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4 2xl:grid-cols-5/,
    "PosTableGate must implement responsive multi-column layout across breakpoints",
  );

  // TransferTableDialog and MultiOrderTablePicker enforce size="touch"
  assert.match(
    transferTableDialog,
    /<Button[\s\S]*?size="touch"[\s\S]*?onClick=\{[()\s=>]*onTableIdChange\(String\(table\.id\)\)\}/,
    "TransferTableDialog target table buttons must use size touch",
  );
  assert.match(
    multiOrderTablePicker,
    /<Button[\s\S]*?size="touch"[\s\S]*?onClick=\{onCreateNew\}/,
    "MultiOrderTablePicker create new order button must use size touch",
  );
});

test("Order management and refunds enforce 48px touch targets and responsive card layouts", () => {
  const operatorOrdersClient = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/orders/operator-orders-client.tsx",
  );
  const ordersClient = read(
    "apps/web/app/(protected)/orders/orders-client.tsx",
  );
  const refundsClient = read(
    "apps/web/app/(protected)/orders/refunds-client.tsx",
  );

  // OperatorOrdersClient cards enforce min-h-14, touch-manipulation, and responsive 3-column grid
  assert.match(
    operatorOrdersClient,
    /className="chrome-tap min-h-14 touch-manipulation cursor-pointer bg-card text-left hover:bg-muted\/30 transition-colors"/,
    "Operator orders items must enforce min-h-14, touch-manipulation, and hover/active states",
  );
  assert.match(
    operatorOrdersClient,
    /<ItemGroup className="gap-2 sm:grid sm:grid-cols-2 lg:grid-cols-3">/,
    "Operator orders must preserve responsive multi-column layout",
  );
  assert.match(
    operatorOrdersClient,
    /<TabsList[\s\S]*?size="touch"[\s\S]*?layout="equal"/,
    "Operator orders tabs must use size touch and equal layout",
  );

  // OrdersClient inline detail close button adapts to touch
  assert.match(
    ordersClient,
    /size=\{controlSize === "touch" \? "icon-touch" : "icon-sm"\}/,
    "OrdersClient inline section close button must adapt to controlSize touch",
  );

  // RefundsClient adapts approve/reject buttons dynamically
  assert.match(
    refundsClient,
    /size=\{isTouchLayout \? "touch" : "default"\}/,
    "RefundsClient action buttons must adapt dynamically to touch layout",
  );
});

test("Operational reports and POS sessions enforce 48px touch controls and dense multi-column layouts", () => {
  const posSessionsClient = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/pos-sessions/pos-sessions-client.tsx",
  );
  const stockReportsClient = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/reports/branch-stock-reports-client.tsx",
  );

  // PosSessionsClient bills list enforces min-h-12 and touch-manipulation
  assert.match(
    posSessionsClient,
    /className="cursor-pointer min-h-12 gap-1 rounded-none border-0 bg-card px-3 py-2 text-left hover:bg-muted active:bg-muted touch-manipulation"/,
    "PosSessionsClient bills list item must enforce min-h-12 and touch-manipulation",
  );

  // PosSessionsClient variance resolution buttons enforce size touch
  assert.match(
    posSessionsClient,
    /<Button[\s\S]*?size="touch"[\s\S]*?onClick=\{\(\) => setResolutionType\("accepted_adjustment"\)\}/,
    "PosSessionsClient variance resolution buttons must enforce size touch",
  );

  // PosSessionsClient report sections enforce multi-column grids
  assert.match(
    posSessionsClient,
    /grid gap-2 grid-cols-2 sm:grid-cols-2 lg:grid-cols-4/,
    "PosSessionsClient metrics must use responsive 4-column layout",
  );
  assert.match(
    posSessionsClient,
    /topItems\}<\/SectionLabel>\s*<ItemGroup className="grid gap-2 sm:grid-cols-2">/,
    "PosSessionsClient top items must use 2-column grid",
  );

  // BranchStockReportsClient enforces responsive 2-column layout and touch targets
  assert.match(
    stockReportsClient,
    /varianceExceptions[\s\S]*?<ItemGroup className="grid gap-2 lg:grid-cols-2" role="list">/,
    "BranchStockReportsClient variance exceptions must use responsive 2-column grid",
  );
  assert.match(
    stockReportsClient,
    /movementHighlights[\s\S]*?<ItemGroup className="grid gap-2 lg:grid-cols-2" role="list">/,
    "BranchStockReportsClient movement highlights must use responsive 2-column grid",
  );
  assert.match(
    stockReportsClient,
    /className="min-h-20 touch-manipulation"/,
    "BranchStockReportsClient variance items must enforce min-h-20 touch target",
  );
  assert.match(
    stockReportsClient,
    /className="min-h-28 touch-manipulation"/,
    "BranchStockReportsClient movement items must enforce min-h-28 touch target",
  );
});
