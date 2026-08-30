import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { normalizeEol } from "./static-source";

const read = (path: string) =>
  normalizeEol(readFileSync(join(process.cwd(), path), "utf8"));

const posShellSource = read(
  "app/(protected)/br/[branchId]/pos/pos-desktop-shell.tsx",
);
const posDesktopInnerSource = read(
  "app/(protected)/br/[branchId]/pos/pos-desktop-inner.tsx",
);
const posDesktopSource = `${posShellSource}\n${posDesktopInnerSource}`;

const appendDraftSource = read(
  "app/(protected)/br/[branchId]/pos/_components/append-draft-pane.tsx",
);

const takeawayGateSource = read(
  "app/(protected)/br/[branchId]/pos/pos-takeaway-gate.tsx",
);

const tableGateSource = read(
  "app/(protected)/br/[branchId]/pos/pos-table-gate.tsx",
);

const orderListPaneSource = read(
  "app/(protected)/br/[branchId]/pos/_components/order-list-pane.tsx",
);

const sidebarVariantsSource = read(
  "app/(protected)/br/[branchId]/pos/_components/pos-sidebar-variants.tsx",
);

const sidebarPanelSource = read(
  "app/(protected)/br/[branchId]/pos/pos-sidebar-panel.tsx",
);

const mobileActionBarSource = read(
  "app/(protected)/br/[branchId]/pos/_components/pos-mobile-action-bar.tsx",
);

const menuGridSource = read(
  "app/(protected)/br/[branchId]/pos/pos-menu-grid.tsx",
);

const orderDetailTouchSources = [
  ["split-order-sheet.tsx", 2],
  ["service-charge-sheet.tsx", 3],
  ["discount-sheet.tsx", 9],
  ["merge-orders-sheet.tsx", 4],
  ["transfer-table-dialog.tsx", 3],
] as const;

test("POS order-detail overlays keep their footer controls touch-sized", () => {
  for (const [file, expectedTouchControls] of orderDetailTouchSources) {
    const source = read(
      `app/(protected)/br/[branchId]/pos/_components/order-detail/${file}`,
    );
    assert.equal(
      source.match(/size="touch"/g)?.length,
      expectedTouchControls,
      file,
    );
  }
});

const orderHistorySource = read(
  "app/(protected)/br/[branchId]/pos/order-history.tsx",
);

const orderCardSummarySource =
  /export function OrderCardSummary[\s\S]*?\n}\n\nexport const ACTIVE_POS_STATUSES/.exec(
    orderHistorySource,
  )?.[0] ?? "";

const activeOrdersListSource =
  /function ActiveOrdersListComponent[\s\S]*?\n}\n\nexport const ActiveOrdersList/.exec(
    orderHistorySource,
  )?.[0] ?? "";

const orderReadsSource = read(
  "app/(protected)/br/[branchId]/pos/order-reads.ts",
);

const archivedOrdersSource =
  /\/\* ─── fetchArchivedOrders ─── \*\/[\s\S]*?const activeTableOrderSchema/.exec(
    orderReadsSource,
  )?.[0] ?? "";

const archivedHookSource = read(
  "app/(protected)/br/[branchId]/pos/_hooks/use-archived-orders.ts",
);

const orderSyncSource = read(
  "app/(protected)/br/[branchId]/pos/_hooks/use-order-sync.ts",
);

const serviceModeSelector =
  /const serviceModeSelector = \([\s\S]*?\n\s*\);/.exec(
    posDesktopSource,
  )?.[0] ?? "";

test("POS service mode uses ToggleGroup primitive state instead of route-local state colors", () => {
  assert.match(serviceModeSelector, /<ToggleGroup[\s\S]*variant="outline"/);
  assert.match(serviceModeSelector, /<ToggleGroup[\s\S]*size="touch"/);
  assert.match(serviceModeSelector, /<ToggleGroup[\s\S]*spacing=\{0\}/);
  assert.match(
    serviceModeSelector,
    /className="w-full min-w-0 justify-center text-sm font-semibold"/,
  );

  assert.doesNotMatch(serviceModeSelector, /data-\[state=on\]:bg-primary/);
  assert.doesNotMatch(serviceModeSelector, /!rounded-none/);
  assert.doesNotMatch(serviceModeSelector, /border-r border-border/);
  assert.doesNotMatch(serviceModeSelector, /className="h-full/);
});

test("POS append draft item rows stay on Item composition instead of Button height overrides", () => {
  assert.match(appendDraftSource, /targetLabel/);
  assert.match(appendDraftSource, /messages\.pos\.appendDraft\.title/);
  assert.doesNotMatch(appendDraftSource, /appendDraft\.description/);
  assert.doesNotMatch(appendDraftSource, /orderNumber=/);
  assert.match(appendDraftSource, /<Item[\s\S]*variant="outline"/);
  assert.match(appendDraftSource, /<Item[\s\S]*size="sm"/);
  assert.match(
    appendDraftSource,
    /<Button[\s\S]*onClick=\{\(\) => onEditItem\(item\)\}[\s\S]*<PosLineItemCompact/,
  );
  assert.doesNotMatch(appendDraftSource, /render=\{/);
  assert.doesNotMatch(appendDraftSource, /asChild/);
  assert.match(appendDraftSource, /size="icon-touch"/);
  assert.doesNotMatch(appendDraftSource, /variant="warning"/);
  assert.doesNotMatch(appendDraftSource, /Badge/);

  assert.doesNotMatch(appendDraftSource, /<Button[\s\S]*min-h-24/);
  assert.doesNotMatch(appendDraftSource, /transition-all/);
  assert.doesNotMatch(appendDraftSource, /rounded-none/);
  assert.doesNotMatch(appendDraftSource, /line-clamp-2/);
});

test("POS menu mounts one responsive toolbar tree", () => {
  assert.match(menuGridSource, /const isCompactMenu = useIsMobile\(\);/);
  assert.match(menuGridSource, /\{isCompactMenu \? \(/);
  assert.doesNotMatch(menuGridSource, /md:hidden/);
  assert.doesNotMatch(menuGridSource, /hidden md:flex/);
});

test("POS takeaway mode uses a context grid before entering the new-order menu", () => {
  assert.match(posDesktopSource, /const \[takeawayDraftActive/);
  assert.match(posDesktopSource, /const \[deliveryDraftActive/);
  assert.match(
    posDesktopSource,
    /const orderContextReady =\s*takeawayDraftReady \|\| deliveryDraftReady \|\| selectedTableUsable;/,
  );
  assert.match(
    posDesktopSource,
    /const isServiceGateActive\s*=\s*!menuContextReady\s*&&\s*\(cartOrderType === "takeaway" \|\| cartOrderType === "delivery"\);/,
  );
  assert.match(posDesktopSource, /hideTakeawayOrders: isServiceGateActive/);
  assert.match(posDesktopSource, /currentOrderTarget/);
  assert.match(posDesktopSource, /orderTargetRow/);
  assert.match(posDesktopSource, /headerAction=\{serviceModeSelector\}/);
  assert.match(tableGateSource, /headerAction\?: ReactNode/);
  assert.doesNotMatch(tableGateSource, /tableGate\.tableCount/);
  assert.doesNotMatch(tableGateSource, /tableGate\.availableCount/);
  assert.match(takeawayGateSource, /headerAction\?: ReactNode/);
  assert.doesNotMatch(takeawayGateSource, /takeawayGate\.activeCount/);
  assert.match(posDesktopSource, /onCancelAppend=\{cancelAppendWorkflow\}/);
  assert.match(
    posDesktopSource,
    /isAppendingToOrder\s*\?\s*cancelAppendWorkflow/,
  );
  assert.doesNotMatch(posDesktopSource, /appendBannerRow/);
  assert.doesNotMatch(posDesktopSource, /appendBannerTitle/);
  assert.doesNotMatch(
    posDesktopSource,
    /border-b border-border\/60 bg-background p-0 md:px-4 md:py-3/,
  );
  assert.doesNotMatch(posDesktopSource, /bg-background p-0 md:hidden/);
  assert.match(mobileActionBarSource, /onCancelAppend/);
  assert.match(mobileActionBarSource, /messages\.pos\.appendDraft\.cancel/);
  assert.match(mobileActionBarSource, /messages\.pos\.appendDraft\.cancelAria/);
  assert.match(posDesktopSource, /const isTouchLayout = useIsMobile\(1280\);/);
  assert.match(posDesktopSource, /const sidebars = isTouchLayout \? null : \(/);
  assert.match(posDesktopSource, /\{isTouchLayout \? \(\s*<PosSessionTopBar/);
  assert.doesNotMatch(
    posDesktopSource,
    /<div className="xl:hidden">\s*<PosSessionTopBar/,
  );
  assert.match(posDesktopSource, /await confirm\(\{/);
  assert.match(posDesktopSource, /messages\.pos\.appendDraft\.cancelTitle/);
  assert.match(posDesktopSource, /setSelfOrderSyncFailed\(true\)/);
  assert.match(posDesktopSource, /messages\.pos\.selfOrderSync\.failed/);
  assert.match(mobileActionBarSource, /isTouchLayout/);
  assert.match(mobileActionBarSource, /xl:hidden/);
  assert.match(sidebarVariantsSource, /bg-background xl:flex/);
  assert.doesNotMatch(posDesktopSource, /useIsLargeUp/);
  assert.doesNotMatch(posDesktopSource, /<TabbedSidebar/);
  assert.doesNotMatch(posDesktopSource, /className="md:hidden"/);
  assert.doesNotMatch(mobileActionBarSource, /md:hidden/);
  assert.doesNotMatch(
    posDesktopSource,
    /const sidebars = isTouchLayout \|\| isTakeawayGateActive \? null : \(/,
  );
  assert.doesNotMatch(
    posDesktopSource,
    /const orderContextReady = cartOrderType === "takeaway" \|\| selectedTableUsable;/,
  );
  assert.match(orderListPaneSource, /hideTakeawayOrders = false/);
  assert.match(
    orderListPaneSource,
    /orders\.filter\(\(order\) => order\.order_type === "dine_in"\)/,
  );
  assert.match(
    posDesktopSource,
    /messages\.pos\.orderHistory\.dineInSessionOrders/,
  );
  assert.match(
    sidebarVariantsSource,
    /hideTakeawayOrders=\{hideTakeawayOrders\}/,
  );
  assert.match(sidebarVariantsSource, /isContextGate/);
  assert.match(sidebarVariantsSource, /if \(isContextGate\)/);
  assert.match(
    sidebarVariantsSource,
    /hidden h-full min-h-0 w-80 shrink-0 flex-col/,
  );
  assert.match(
    sidebarVariantsSource,
    /hidden h-full min-h-0 shrink-0 flex-col border-l/,
  );
  assert.match(
    sidebarVariantsSource,
    /flex h-full min-h-0 w-80 shrink-0 flex-col 2xl:w-88/,
  );
  assert.match(sidebarVariantsSource, /const sessionTopBar = \(/);
  assert.doesNotMatch(
    posDesktopSource,
    // Desktop dual-pane must not keep a spanning top bar above both columns.
    /xl:flex">\s*<PosSessionTopBar/,
  );
  assert.match(
    sidebarVariantsSource,
    /<OrderListPane[\s\S]*hideTakeawayOrders=\{hideTakeawayOrders\}/,
  );
  assert.match(
    sidebarVariantsSource,
    /targetLabel=\{appendDraft\.target\.targetLabel\}/,
  );
  assert.match(sidebarPanelSource, /hideTakeawayOrders=\{hideTakeawayOrders\}/);
  assert.match(posDesktopSource, /pendingNewTitle/);
  assert.match(posDesktopSource, /<PosTakeawayGate/);
  assert.match(posDesktopSource, /handleCreateDeliveryOrder/);
  assert.match(
    posDesktopSource,
    /onCreateNew=\{\s*cartOrderType === "delivery"\s*\?\s*handleCreateDeliveryOrder\s*:\s*handleCreateTakeawayOrder\s*\}/,
  );

  assert.doesNotMatch(takeawayGateSource, /OperationalBoardCard/);
  assert.match(takeawayGateSource, /<OperationalTile/);
  assert.match(takeawayGateSource, /data-testid=\{`pos-\$\{mode\}-create-tile`\}/);
  assert.match(takeawayGateSource, /onClick=\{onCreateNew\}/);
  assert.match(takeawayGateSource, /data-testid=\{`pos-\$\{mode\}-order-tile-/);
  assert.match(
    takeawayGateSource,
    /onViewDetail\(order\.id, order\.order_number, order\)/,
  );
  assert.match(takeawayGateSource, /order\.order_type === mode/);
  assert.doesNotMatch(takeawayGateSource, /onAppendOrder/);
  assert.doesNotMatch(takeawayGateSource, /<OrderCardSummary/);
  assert.doesNotMatch(takeawayGateSource, /<ItemFooter/);
  assert.doesNotMatch(takeawayGateSource, /onViewBill/);
});

test("POS active order cards do not badge unpaid as a default status", () => {
  assert.doesNotMatch(takeawayGateSource, /waitingPayment/);
  assert.doesNotMatch(orderHistorySource, /waitingPayment/);
});

test("POS active order card actions fill the sidebar width without overflow", () => {
  assert.match(
    orderHistorySource,
    /className="w-full max-w-full min-w-0 flex-col items-stretch overflow-hidden bg-card"/,
  );
  assert.match(
    orderHistorySource,
    /ItemFooter className="mt-1\.5 grid w-full min-w-0 grid-cols-2 gap-2 border-t border-border\/60 pt-2"/,
  );
  assert.match(orderHistorySource, /className="w-full min-w-0 px-2 text-sm"/);
  assert.match(
    orderHistorySource,
    /flex w-full min-w-0 max-w-full flex-col gap-3/,
  );
  assert.match(
    orderHistorySource,
    /ScrollArea className="min-h-0 min-w-0 w-full flex-1 overflow-hidden"/,
  );
  assert.doesNotMatch(
    orderHistorySource,
    /ItemFooter className="[^"]*justify-end/,
  );
});

test("POS active order sidebar stays a single queue without status section headers", () => {
  assert.match(activeOrdersListSource, /const activeOrders = useMemo/);
  assert.match(activeOrdersListSource, /\.sort\(compareOrdersByNextAction\)/);
  assert.match(activeOrdersListSource, /const multiOrderTableIds = useMemo/);
  assert.match(activeOrdersListSource, /count > 1/);
  assert.match(activeOrdersListSource, /showDineInSequence=/);
  assert.match(activeOrdersListSource, /<ItemGroup className="w-full min-w-0 gap-2">/);
  assert.match(activeOrdersListSource, /activeOrders\.map/);

  assert.doesNotMatch(activeOrdersListSource, /getOrderSectionKey/);
  assert.doesNotMatch(activeOrdersListSource, /OrderSectionKey/);
  assert.doesNotMatch(
    activeOrdersListSource,
    /messages\.pos\.orderHistory\.sections/,
  );
  assert.doesNotMatch(activeOrdersListSource, /sections\.map/);
  assert.doesNotMatch(activeOrdersListSource, /showHeaders/);
});

test("POS order cards show compact operational sequence instead of full order code", () => {
  assert.match(orderHistorySource, /const ORDER_SEQUENCE_RE/);
  assert.match(orderHistorySource, /function getCompactOrderTitle/);
  assert.match(
    orderHistorySource,
    /order\.order_type === "takeaway" \|\| order\.order_type === "delivery"/,
  );
  assert.match(orderHistorySource, /\$\{contextLabel\} #\$\{sequence\}/);
  assert.match(
    orderHistorySource,
    /messages\.pos\.orderHistory\.orderSequence/,
  );
  assert.match(orderHistorySource, /showDineInSequence === true/);
  assert.match(orderHistorySource, /return contextLabel;/);
  assert.match(
    orderHistorySource,
    /formatTime\(metaTimestamp \?\? order\.created_at\)/,
  );
  assert.match(
    orderCardSummarySource,
    /getCompactOrderTitle\(order, \{ showDineInSequence \}\)/,
  );
  assert.doesNotMatch(orderCardSummarySource, /\|/);
  assert.doesNotMatch(orderCardSummarySource, /#\{order\.order_number\}/);
  assert.doesNotMatch(
    orderCardSummarySource,
    /getOrderContextLabel\(order\)} -/,
  );
});

test("POS archived orders sort by archived transition time, not order creation time", () => {
  assert.match(orderReadsSource, /created_at,\s*\n\s*updated_at,/);
  assert.match(archivedOrdersSource, /archivedAt/);
  assert.match(
    archivedOrdersSource,
    /updated_at\.lt\.\$\{cursor\.archivedAt\}/,
  );
  assert.match(
    archivedOrdersSource,
    /\.order\("updated_at", \{ ascending: false \}\)/,
  );
  assert.match(archivedOrdersSource, /archivedAt: last\.updated_at/);
  assert.doesNotMatch(archivedOrdersSource, /createdAt/);
  assert.doesNotMatch(archivedOrdersSource, /\.order\("created_at"/);
  assert.match(
    archivedHookSource,
    /type Cursor = \{ archivedAt: string; id: number \} \| null;/,
  );
  assert.doesNotMatch(archivedHookSource, /createdAt/);
  assert.match(orderSyncSource, /next\.updated_at = payload\.updated_at/);
});

test("POS archived orders search matches order_number or payment_code", () => {
  assert.match(
    archivedOrdersSource,
    /order_number\.ilike\."\$\{pattern\}",payment_code\.ilike\."\$\{pattern\}"/,
  );
  assert.match(archivedOrdersSource, /q: z\.string\(\)\.trim\(\)\.max\(80\)/);
  assert.match(
    read("lib/messages/pos.ts"),
    /searchPlaceholder: "Tìm số đơn hoặc mã thanh toán\.\.\."/,
  );
});
