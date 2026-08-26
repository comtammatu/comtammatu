import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

test("operator queue views are URL-synced via searchParams, not local useState view", () => {
  for (const file of [
    "apps/web/app/(protected)/br/[branchId]/(operator)/team/leave-approvals/branch-leave-approvals-client.tsx",
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/count-slips/branch-count-slips-client.tsx",
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/consumption/branch-consumption-list-client.tsx",
  ]) {
    const source = read(file);
    assert.doesNotMatch(
      source,
      /useState<QueueView>\("pending"\)|useState<ConsumptionView>\("recorded"\)/,
      `${file}: queue view must not be local useState`,
    );
    assert.match(
      source,
      /useSearchParams\(\)/,
      `${file}: must read view from searchParams`,
    );
    assert.match(
      source,
      /router\.replace\(q \? `\$\{pathname\}\?\$\{q\}` : pathname/,
      `${file}: must URL-sync view via router.replace`,
    );
  }
});

test("operator orders uses a URL-synced standard Pattern A Tabs with size touch", () => {
  const source = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/orders/operator-orders-client.tsx",
  );
  assert.match(source, /TabsList[\s\S]*?size="touch"/);
  assert.match(source, /useSearchParams\(\)/);
  assert.match(source, /from "@comtammatu\/ui\/components\/tabs"/);
  assert.match(source, /aria-label=\{ORDERS_COPY\.operatorTabsAriaLabel\}/);
});

test("operator consumption and count-slip queues use standard Pattern A Tabs with size touch", () => {
  for (const file of [
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/consumption/branch-consumption-list-client.tsx",
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/count-slips/branch-count-slips-client.tsx",
  ]) {
    const source = read(file);
    assert.match(source, /TabsList[\s\S]*?size="touch"/, `${file}: queue filter must use TabsList size="touch"`);
    assert.match(source, /useSearchParams\(\)/, `${file}: must read view from searchParams`);
    assert.match(
      source,
      /from "@comtammatu\/ui\/components\/tabs"/,
      `${file}: must use standard Tabs component`,
    );
  }
});

test("operator stock hub groups tiles into ordered workflow sections", () => {
  const source = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/page.tsx",
  );
  assert.match(source, /StockWorkflowSections/);
  // Store stock landing uses BranchStockDoors — not BRANCH_STOCK_TAB_SUFFIXES.
  assert.doesNotMatch(source, /BRANCH_STOCK_TAB_SUFFIXES/);
  assert.match(source, /BranchStockDoors/);
  assert.match(source, /CENTRAL_STOCK_TAB_SUFFIXES/);
  assert.match(source, /CENTRAL_BOTTOM_NAV_SUFFIXES/);
  assert.match(source, /stockFlowLookupTitle/);
  assert.match(source, /stockJobOnHand/);
  assert.match(source, /mobileColumns=\{2\}/);
  assert.match(source, /presentation=\{section\.primary \? "stations" : "plain"\}/);
  assert.doesNotMatch(source, /AppPageTabs/);
  assert.doesNotMatch(source, /paramKey="group"/);
  assert.doesNotMatch(source, /STOCK_PRIMARY_SUFFIXES/);
  assert.doesNotMatch(source, /STOCK_SECONDARY_SUFFIXES/);
});

test("operator home keeps manager tiles job-first without shift phases", () => {
  const page = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/page.tsx",
  );
  const contract = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/_lib/operator-home-contract.ts",
  );
  assert.match(contract, /BRANCH_MANAGER_HOME_TILE_SUFFIXES/);
  assert.match(contract, /getOperatorHomeTileHrefs/);
  assert.doesNotMatch(contract, /getBranchManagerHomePhaseGroups/);
  assert.doesNotMatch(contract, /BranchManagerHomePhase/);
  assert.doesNotMatch(page, /getBranchManagerHomePhaseGroups/);
  assert.doesNotMatch(page, /phaseSections/);
  assert.doesNotMatch(page, /phaseOpenTitle|phaseRunTitle|phaseCloseTitle/);
  assert.match(page, /homeCopy\.stationsTitle/);
  // Stations + limits/orders share one BranchOperatorPanel job-tiles block.
  assert.match(page, /BranchOperatorPanel[\s\S]*presentation="stations"/);
  assert.match(
    page,
    /presentation="stations"[\s\S]*BranchQuickMenuLimitTrigger/,
  );
  assert.doesNotMatch(
    contract,
    /BRANCH_MANAGER_HOME_TILE_SUFFIXES[\s\S]*?"\/team"/,
  );
});

test("operator a11y: realtime regions announce, panels use headings, locked tiles explain why", () => {
  const queue = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/_components/home/branch-queue-section.tsx",
  );
  assert.match(queue, /role="status"/);
  assert.match(queue, /aria-live="polite"/);
  assert.match(queue, /aria-atomic="true"/);
  assert.match(queue, /queueAriaLabel/);

  const today = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/_components/home/branch-today-status.tsx",
  );
  assert.match(today, /role="status"/);
  assert.match(today, /aria-live="polite"/);

  const bell = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/operator-notification-bell.tsx",
  );
  const sharedBell = read("apps/web/app/_components/notification-bell.tsx");
  // Unread count is merged into the bell's accessible name, not left as a stray digit.
  assert.match(bell, /<NotificationBell/);
  assert.match(sharedBell, /messages\.notifications\.bellAriaLabel/);
  assert.match(sharedBell, /messages\.notifications\.unreadBadge/);

  const tile = read(
    "apps/web/lib/branch-operator/components/branch-operator-page.tsx",
  );
  // Panels can opt into the heading hierarchy; locked tiles surface a reason.
  assert.match(tile, /headingLevel\?: "h2" \| "h3" \| "h4"/);
  assert.match(tile, /disabledReason\?: string/);
  assert.match(tile, /headingLevel=\{headingLevel\}/);
});

test("operator dashboard is a redirect shim into Hôm nay", () => {
  const source = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/dashboard/page.tsx",
  );
  assert.match(source, /redirect\(`\/br\/\$\{branchId\}`\)/);
  assert.doesNotMatch(source, /Suspense|BranchCockpitSection|fetchBranchDayStatus/);
});

test("POS menu sync coalesces event bursts before refetching the full menu", () => {
  const source = read(
    "apps/web/app/(protected)/br/[branchId]/pos/_hooks/use-pos-menu-sync.ts",
  );
  assert.match(source, /makeRealtimeCoalescer/);
  assert.match(source, /metricName: "pos.menu.refresh"/);
});

test("AppPageTabs exposes an accessible name for the tablist", () => {
  const source = read("apps/web/app/components/app-page-tabs.tsx");
  assert.match(source, /ariaLabel\?: string/);
  assert.match(source, /aria-label=\{ariaLabel\}/);
});

test("Pickup board halves its poll cadence to 6s while keeping deterministic staleness", () => {
  const source = read(
    "apps/web/app/(protected)/br/[branchId]/pickup/pickup-realtime-refresh.tsx",
  );
  // Still polling (derived "now serving" view needs a full rebuild per change and
  // must stay fresh on an always-visible kiosk even if the socket drops).
  assert.match(source, /const POLL_INTERVAL_MS = 6_000;/);
  assert.match(source, /window\.setInterval/);
  assert.match(source, /router\.refresh\(\)/);
});

test("POS self-order uses the private branch-ops bus plus the 30s poll as a safety net", () => {
  const inner = read(
    "apps/web/app/(protected)/br/[branchId]/pos/pos-desktop-inner.tsx",
  );
  const menuSync = read(
    "apps/web/app/(protected)/br/[branchId]/pos/_hooks/use-pos-menu-sync.ts",
  );
  const shell = read(
    "apps/web/app/(protected)/br/[branchId]/pos/pos-desktop-shell.tsx",
  );
  const migration = read(
    "supabase/migrations/20260808170144_self_order_branch_ops_realtime.sql",
  );
  // Instant alerts ride the hardened private branch:{id}:ops bus (not a
  // separate private topic without a realtime.messages policy).
  assert.doesNotMatch(inner, /pos-self-order-branch-/);
  assert.match(inner, /selfOrderSignalRef\.current = refreshSelfOrderPosState/);
  assert.match(shell, /onSelfOrderSignal/);
  assert.match(menuSync, /branch:\$\{String\(branchId\)\}:ops/);
  assert.match(menuSync, /private:\s*true/);
  assert.match(menuSync, /self_order_requests/);
  assert.match(menuSync, /self_order_payment_requests/);
  assert.match(menuSync, /stopRealtimeAuthorizationRejoin/);
  assert.match(
    migration,
    /ON public\.self_order_requests[\s\S]*broadcast_branch_ops/,
  );
  assert.match(
    migration,
    /ON public\.self_order_payment_requests[\s\S]*broadcast_branch_ops/,
  );
  assert.doesNotMatch(migration, /ALTER PUBLICATION supabase_realtime/);
  // 30s poll safety net is still present.
  assert.match(inner, /30_000/);
});

test("floor clock-in stays in the Branch personal flow", () => {
  const clockPage = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/shift/clock/page.tsx",
  );
  const actions = read("apps/web/lib/staff-runtime/clock/actions.ts");
  assert.match(clockPage, /<StaffClockPageContent/);
  assert.match(clockPage, /tasks: `\/br\/\$\{branchId\}\/shift`/);
  const rpcBlock = actions.slice(actions.indexOf("self_service_clock_in"));
  assert.match(rpcBlock, /nextPath: "home"/);
});

test("KDS streams the station shell immediately and fetches the ticket snapshot on the client", () => {
  const page = read("apps/web/app/(protected)/br/[branchId]/kds/page.tsx");
  const realtime = read(
    "apps/web/app/(protected)/br/[branchId]/kds/_hooks/use-kds-realtime.ts",
  );
  const board = read(
    "apps/web/app/(protected)/br/[branchId]/kds/kds-board.tsx",
  );
  // Page renders the board with an empty seed; stations/permissions resolve fast.
  assert.match(page, /initialTickets=\{\[\]\}/);
  assert.match(page, /seeded=\{false\}/);
  assert.match(page, /\.from\("kds_stations"\)/);
  // The page no longer fetches the ticket chain (it lives in the realtime hook).
  assert.doesNotMatch(page, /fetchVisibleKdsTickets|fetchKdsOrdersByIds/);
  // Realtime hook honors seeded=false: the first SUBSCRIBED fetches the snapshot.
  assert.match(realtime, /seeded\?: boolean/);
  assert.match(realtime, /seededRef\.current/);
  assert.match(board, /seeded = true/);
});

test("POS streams the shell immediately and only the error state gates it", () => {
  const source = read(
    "apps/web/app/(protected)/br/[branchId]/pos/_providers/pos-desktop-provider.tsx",
  );
  assert.match(source, /ordersBootstrapState === "error" \? \(/);
  // No full-shell skeleton gate on the loading state.
  assert.doesNotMatch(
    source,
    /ordersBootstrapState === "loading" \? \(\s*<PosPageSkeleton/,
  );
});

test("close-session supports a quick single-total count mode alongside denominations", () => {
  const source = read(
    "apps/web/app/(protected)/br/[branchId]/pos/close-session-sheet.tsx",
  );
  assert.match(source, /countMode.*"total" \| "denomination"/);
  assert.match(source, /Nhập tổng/);
  assert.match(source, /Theo mệnh giá/);
  assert.match(source, /WholeVndInput/);
  assert.match(source, /aria-pressed=\{countMode === "total"\}/);
});

test("KDS comprehensive board memoizes item rows with a per-row isMutating flag", () => {
  const source = read(
    "apps/web/app/(protected)/br/[branchId]/kds/_components/order-grid.tsx",
  );
  // Item/orphan rows are memoized so they skip the 15s board-tick re-render
  // (the tick only needs to update the card background age color).
  assert.match(source, /const CompactItemRow = memo\(function CompactItemRow/);
  assert.match(
    source,
    /const CompactOrphanRow = memo\(function CompactOrphanRow/,
  );
  // Each memoized row takes a per-row boolean, not the recreated
  // pendingTicketIds Set (which would defeat memo on every mutation).
  const itemRowBlock = source.slice(
    source.indexOf("memo(function CompactItemRow"),
    source.indexOf("memo(function CompactOrphanRow"),
  );
  assert.match(itemRowBlock, /isMutating: boolean;/);
  assert.doesNotMatch(itemRowBlock, /pendingTicketIds/);
  // HeatmapCard still holds the Set but computes the flag for each row.
  assert.match(
    source,
    /isMutating=\{ticket \? pendingTicketIds\.has\(ticket\.id\) : false\}/,
  );
});

test("POS self-order ref is synced in the render body, not a one-frame-stale effect", () => {
  const source = read(
    "apps/web/app/(protected)/br/[branchId]/pos/pos-desktop-inner.tsx",
  );
  // Assigning in the render body keeps the shell bus ref current on every
  // render, so a realtime event always invokes the latest closure (audioMode).
  assert.match(
    source,
    /selfOrderSignalRef\.current = refreshSelfOrderPosState;/,
  );
  assert.doesNotMatch(
    source,
    /useEffect\(\(\) => \{\s*selfOrderSignalRef\.current = refreshSelfOrderPosState;/,
  );
});

// Stock LIST touch contract: lists stay single-column until the lg(1024px)
// landscape breakpoint so cards never go narrow on a portrait tablet (768px),
// and filter toolbars stack on phone instead of forcing a cramped two-column
// grid. See docs/ref/screen-context-map.md §2.5 on-hand exemplar.
const STOCK_LIST_CLIENTS = [
  "apps/web/app/(protected)/br/[branchId]/(operator)/stock/consumption/branch-consumption-list-client.tsx",
  "apps/web/app/(protected)/br/[branchId]/(operator)/stock/count-assignments/branch-count-assignments-client.tsx",
  "apps/web/app/(protected)/br/[branchId]/(operator)/stock/count-slips/branch-count-slips-client.tsx",
  "apps/web/app/(protected)/br/[branchId]/(operator)/stock/grn/branch-grn-list-client.tsx",
  "apps/web/app/(protected)/br/[branchId]/(operator)/stock/issues/branch-stock-issues-list-client.tsx",
  "apps/web/app/(protected)/br/[branchId]/(operator)/stock/stocktake/branch-stocktake-list-client.tsx",
];

// Branch Ops (team/shift) card queues share the same lg(1024px) breakpoint
// contract as stock LISTs — portrait tablets must stay single-column.
const BRANCH_OPS_CARD_CLIENTS = [
  "apps/web/app/(protected)/br/[branchId]/(operator)/team/team-board-client.tsx",
  "apps/web/app/(protected)/br/[branchId]/(operator)/team/leave-approvals/branch-leave-approvals-client.tsx",
  "apps/web/app/(protected)/br/[branchId]/(operator)/team/members/members-client.tsx",
];

test("stock LIST card grids switch to two columns only at the lg landscape breakpoint", () => {
  for (const file of STOCK_LIST_CLIENTS) {
    const source = read(file);
    // A two-column card grid must not cut over at md(768px) — that crushes
    // cards on a portrait tablet. lg(1024px) landscape is the contract.
    assert.doesNotMatch(
      source,
      /(?:^|[^l])md:grid-cols-2/,
      `${file}: card list must not switch to two columns before the lg breakpoint`,
    );
  }
});

test("branch ops (team/shift) card queues switch to two columns only at the lg breakpoint", () => {
  for (const file of BRANCH_OPS_CARD_CLIENTS) {
    const source = read(file);
    assert.doesNotMatch(
      source,
      /(?:^|[^l])md:grid-cols-2/,
      `${file}: card queue must not switch to two columns before the lg breakpoint`,
    );
  }
});

test("stock LIST filter toolbars stack on phone via flex-col sm:flex-row, not a cramped fixed grid", () => {
  for (const file of [
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/consumption/branch-consumption-list-client.tsx",
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/grn/branch-grn-list-client.tsx",
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/issues/branch-stock-issues-list-client.tsx",
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/stocktake/branch-stocktake-list-client.tsx",
  ]) {
    const source = read(file);
    assert.match(
      source,
      /flex min-w-0 flex-col gap-2 sm:flex-row/,
      `${file}: filter toolbar must stack with flex-col sm:flex-row`,
    );
    // No fixed-width two-column grid forcing the search box narrow on tablet.
    assert.doesNotMatch(
      source,
      /grid(?:\s+\S+)*\s+sm:grid-cols-\[minmax\(0,1fr\)_(?:11|12)rem\]|grid(?:\s+\S+)*\s+lg:grid-cols-\[minmax\(0,1fr\)_(?:11|12)rem\]/,
      `${file}: filter toolbar must not use a fixed two-column search+select grid`,
    );
  }
});

test("stock detail screens use the shared BRANCH_OPERATOR_DETAIL_GRID_CLASSNAME, not a hand-rolled md: grid", () => {
  const source = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/issues/[id]/branch-stock-issue-detail-client.tsx",
  );
  assert.match(
    source,
    /BRANCH_OPERATOR_DETAIL_GRID_CLASSNAME/,
    "issues detail must use the shared detail grid constant",
  );
  assert.doesNotMatch(
    source,
    /md:grid-cols-\[minmax\(0,1\.35fr\)_minmax\(17rem,0\.65fr\)\]/,
    "issues detail must not hand-roll the detail grid at the md breakpoint",
  );
});

const OPERATOR_LIST_ITEM_CLIENTS = [
  "apps/web/app/(protected)/br/[branchId]/(operator)/stock/consumption/branch-consumption-list-client.tsx",
  "apps/web/app/(protected)/br/[branchId]/(operator)/stock/issues/branch-stock-issues-list-client.tsx",
  "apps/web/app/(protected)/br/[branchId]/(operator)/stock/stocktake/branch-stocktake-list-client.tsx",
  "apps/web/app/(protected)/br/[branchId]/(operator)/stock/waste-approvals/branch-waste-approvals-client.tsx",
  "apps/web/app/(protected)/br/[branchId]/(operator)/stock/purchase-requests/branch-purchase-requests-client.tsx",
  "apps/web/app/(protected)/br/[branchId]/(operator)/team/leave-approvals/branch-leave-approvals-client.tsx",
  "apps/web/app/(protected)/br/[branchId]/(operator)/team/attendance/branch-attendance-client.tsx",
  "apps/web/app/(protected)/br/[branchId]/(operator)/feedback/_components/branch-feedback-inbox-list.tsx",
];

test("operator LIST Item rows nowrap title and actions instead of wrapping", () => {
  for (const file of OPERATOR_LIST_ITEM_CLIENTS) {
    const source = read(file);
    assert.match(
      source,
      /flex-nowrap/,
      `${file}: list Item rows must override Item flex-wrap`,
    );
  }
});
