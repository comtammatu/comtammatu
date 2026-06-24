import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const posShellSource = readFileSync(
  join(process.cwd(), "app/(protected)/br/[branchId]/pos/pos-desktop-shell.tsx"),
  "utf8",
);
const posDesktopInnerSource = readFileSync(
  join(process.cwd(), "app/(protected)/br/[branchId]/pos/pos-desktop-inner.tsx"),
  "utf8",
);
const posDesktopSource = `${posShellSource}\n${posDesktopInnerSource}`;

const appendDraftSource = readFileSync(
  join(
    process.cwd(),
    "app/(protected)/br/[branchId]/pos/_components/append-draft-pane.tsx",
  ),
  "utf8",
);

const takeawayGateSource = readFileSync(
  join(process.cwd(), "app/(protected)/br/[branchId]/pos/pos-takeaway-gate.tsx"),
  "utf8",
);

const tableGateSource = readFileSync(
  join(process.cwd(), "app/(protected)/br/[branchId]/pos/pos-table-gate.tsx"),
  "utf8",
);

const orderListPaneSource = readFileSync(
  join(
    process.cwd(),
    "app/(protected)/br/[branchId]/pos/_components/order-list-pane.tsx",
  ),
  "utf8",
);

const sidebarVariantsSource = readFileSync(
  join(
    process.cwd(),
    "app/(protected)/br/[branchId]/pos/_components/pos-sidebar-variants.tsx",
  ),
  "utf8",
);

const sidebarPanelSource = readFileSync(
  join(process.cwd(), "app/(protected)/br/[branchId]/pos/pos-sidebar-panel.tsx"),
  "utf8",
);

const mobileActionBarSource = readFileSync(
  join(
    process.cwd(),
    "app/(protected)/br/[branchId]/pos/_components/pos-mobile-action-bar.tsx",
  ),
  "utf8",
);

const orderHistorySource = readFileSync(
  join(process.cwd(), "app/(protected)/br/[branchId]/pos/order-history.tsx"),
  "utf8",
);

const orderCardSummarySource =
  /export function OrderCardSummary[\s\S]*?\n}\n\nexport const ACTIVE_POS_STATUSES/.exec(
    orderHistorySource,
  )?.[0] ?? "";

const activeOrdersListSource =
  /function ActiveOrdersListComponent[\s\S]*?\n}\n\nexport const ActiveOrdersList/.exec(
    orderHistorySource,
  )?.[0] ?? "";

const orderReadsSource = readFileSync(
  join(process.cwd(), "app/(protected)/br/[branchId]/pos/order-reads.ts"),
  "utf8",
);

const archivedOrdersSource =
  /\/\* ─── fetchArchivedOrders ─── \*\/[\s\S]*?const activeTableOrderSchema/.exec(
    orderReadsSource,
  )?.[0] ?? "";

const archivedHookSource = readFileSync(
  join(
    process.cwd(),
    "app/(protected)/br/[branchId]/pos/_hooks/use-archived-orders.ts",
  ),
  "utf8",
);

const orderSyncSource = readFileSync(
  join(
    process.cwd(),
    "app/(protected)/br/[branchId]/pos/_hooks/use-order-sync.ts",
  ),
  "utf8",
);

const serviceModeSelector =
  /const serviceModeSelector = \([\s\S]*?\n\s*\);/.exec(posDesktopSource)?.[0] ??
  "";

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
  assert.match(appendDraftSource, /<Item\s+asChild[\s\S]*variant="outline"/);
  assert.match(appendDraftSource, /<Item\s+asChild[\s\S]*size="sm"/);
  assert.match(appendDraftSource, /size="icon-touch"/);

  assert.doesNotMatch(appendDraftSource, /<Button[\s\S]*min-h-24/);
  assert.doesNotMatch(appendDraftSource, /transition-all/);
  assert.doesNotMatch(appendDraftSource, /rounded-none/);
  assert.doesNotMatch(appendDraftSource, /line-clamp-2/);
});

test("POS takeaway mode uses a context grid before entering the new-order menu", () => {
  assert.match(posDesktopSource, /const \[takeawayDraftActive/);
  assert.match(
    posDesktopSource,
    /const orderContextReady = takeawayDraftReady \|\| selectedTableUsable;/,
  );
  assert.match(
    posDesktopSource,
    /const isTakeawayGateActive = !menuContextReady && cartOrderType === "takeaway";/,
  );
  assert.match(
    posDesktopSource,
    /hideTakeawayOrders: isTakeawayGateActive/,
  );
  assert.match(posDesktopSource, /currentOrderTarget/);
  assert.match(posDesktopSource, /orderTargetRow/);
  assert.match(posDesktopSource, /headerAction=\{serviceModeSelector\}/);
  assert.match(tableGateSource, /headerAction\?: ReactNode/);
  assert.doesNotMatch(tableGateSource, /tableGate\.tableCount/);
  assert.doesNotMatch(tableGateSource, /tableGate\.availableCount/);
  assert.match(takeawayGateSource, /headerAction\?: ReactNode/);
  assert.doesNotMatch(takeawayGateSource, /takeawayGate\.activeCount/);
  assert.match(posDesktopSource, /onCancelAppend=\{cancelAppendWorkflow\}/);
  assert.match(posDesktopSource, /isAppendingToOrder\s*\?\s*cancelAppendWorkflow/);
  assert.doesNotMatch(posDesktopSource, /appendBannerRow/);
  assert.doesNotMatch(posDesktopSource, /appendBannerTitle/);
  assert.doesNotMatch(posDesktopSource, /border-b border-border\/60 bg-background p-0 md:px-4 md:py-3/);
  assert.doesNotMatch(posDesktopSource, /bg-background p-0 md:hidden/);
  assert.match(mobileActionBarSource, /onCancelAppend/);
  assert.match(mobileActionBarSource, /messages\.pos\.appendDraft\.cancel/);
  assert.match(mobileActionBarSource, /messages\.pos\.appendDraft\.cancelAria/);
  assert.match(posDesktopSource, /const sidebars = isMobile \? null : \(/);
  assert.doesNotMatch(
    posDesktopSource,
    /const sidebars = isMobile \|\| isTakeawayGateActive \? null : \(/,
  );
  assert.doesNotMatch(
    posDesktopSource,
    /const orderContextReady = cartOrderType === "takeaway" \|\| selectedTableUsable;/,
  );
  assert.match(orderListPaneSource, /hideTakeawayOrders = false/);
  assert.match(
    orderListPaneSource,
    /orders\.filter\(\(order\) => order\.order_type !== "takeaway"\)/,
  );
  assert.match(
    orderListPaneSource,
    /messages\.pos\.orderHistory\.dineInSessionOrders/,
  );
  assert.match(sidebarVariantsSource, /hideTakeawayOrders=\{hideTakeawayOrders\}/);
  assert.match(sidebarVariantsSource, /isContextGate/);
  assert.match(sidebarVariantsSource, /showOrders: true/);
  assert.match(sidebarVariantsSource, /if \(isContextGate\)/);
  assert.match(sidebarVariantsSource, /targetLabel=\{appendDraft\.target\.targetLabel\}/);
  assert.match(sidebarPanelSource, /hideTakeawayOrders=\{hideTakeawayOrders\}/);
  assert.match(sidebarPanelSource, /pendingNewTitle/);
  assert.match(posDesktopSource, /<PosTakeawayGate/);
  assert.match(posDesktopSource, /onCreateNew=\{handleCreateTakeawayOrder\}/);

  assert.doesNotMatch(takeawayGateSource, /OperationalBoardCard/);
  assert.match(takeawayGateSource, /<OperationalTile/);
  assert.match(takeawayGateSource, /data-testid="pos-takeaway-create-tile"/);
  assert.match(takeawayGateSource, /onClick=\{onCreateNew\}/);
  assert.match(takeawayGateSource, /data-testid=\{`pos-takeaway-order-tile-/);
  assert.match(
    takeawayGateSource,
    /onViewDetail\(order\.id, order\.order_number, order\)/,
  );
  assert.match(takeawayGateSource, /order\.order_type === "takeaway"/);
  assert.doesNotMatch(takeawayGateSource, /onAppendOrder/);
  assert.doesNotMatch(takeawayGateSource, /<OrderCardSummary/);
  assert.doesNotMatch(takeawayGateSource, /<ItemFooter/);
  assert.doesNotMatch(takeawayGateSource, /onViewBill/);
});

test("POS active order cards do not badge unpaid as a default status", () => {
  assert.doesNotMatch(takeawayGateSource, /waitingPayment/);
  assert.doesNotMatch(orderHistorySource, /waitingPayment/);
});

test("POS active order sidebar stays a single queue without status section headers", () => {
  assert.match(activeOrdersListSource, /const activeOrders = useMemo/);
  assert.match(activeOrdersListSource, /\.sort\(compareOrdersByNextAction\)/);
  assert.match(activeOrdersListSource, /const multiOrderTableIds = useMemo/);
  assert.match(activeOrdersListSource, /count > 1/);
  assert.match(activeOrdersListSource, /showDineInSequence=/);
  assert.match(activeOrdersListSource, /<ItemGroup className="gap-2">/);
  assert.match(activeOrdersListSource, /activeOrders\.map/);

  assert.doesNotMatch(activeOrdersListSource, /getOrderSectionKey/);
  assert.doesNotMatch(activeOrdersListSource, /OrderSectionKey/);
  assert.doesNotMatch(activeOrdersListSource, /messages\.pos\.orderHistory\.sections/);
  assert.doesNotMatch(activeOrdersListSource, /sections\.map/);
  assert.doesNotMatch(activeOrdersListSource, /showHeaders/);
});

test("POS order cards show compact operational sequence instead of full order code", () => {
  assert.match(orderHistorySource, /const ORDER_SEQUENCE_RE/);
  assert.match(orderHistorySource, /function getCompactOrderTitle/);
  assert.match(orderHistorySource, /order\.order_type === "takeaway"/);
  assert.match(orderHistorySource, /\$\{contextLabel\} #\$\{sequence\}/);
  assert.match(orderHistorySource, /messages\.pos\.orderHistory\.orderSequence/);
  assert.match(orderHistorySource, /showDineInSequence === true/);
  assert.match(orderHistorySource, /return contextLabel;/);
  assert.match(orderHistorySource, /return formatTime\(order\.created_at\);/);
  assert.match(
    orderCardSummarySource,
    /getCompactOrderTitle\(order, \{ showDineInSequence \}\)/,
  );
  assert.doesNotMatch(orderCardSummarySource, /\|/);
  assert.doesNotMatch(orderCardSummarySource, /#\{order\.order_number\}/);
  assert.doesNotMatch(orderCardSummarySource, /getOrderContextLabel\(order\)} -/);
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
