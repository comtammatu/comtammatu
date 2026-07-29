import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

test("operator queue views are URL-synced via searchParams, not local useState view", () => {
  for (const file of [
    "apps/web/app/(protected)/br/[branchId]/(operator)/shift/leave-approvals/branch-leave-approvals-client.tsx",
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/count-slips/branch-count-slips-client.tsx",
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/consumption/branch-consumption-list-client.tsx",
  ]) {
    const source = read(file);
    assert.doesNotMatch(
      source,
      /useState<QueueView>\("pending"\)|useState<ConsumptionView>\("recorded"\)/,
      `${file}: queue view must not be local useState`,
    );
    assert.match(source, /useSearchParams\(\)/, `${file}: must read view from searchParams`);
    assert.match(
      source,
      /router\.replace\(q \? `\$\{pathname\}\?\$\{q\}` : pathname/,
      `${file}: must URL-sync view via router.replace`,
    );
  }
});

test("operator orders uses a URL-synced ToggleGroup segmented control, not raw Tabs as a filter", () => {
  const source = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/orders/operator-orders-client.tsx",
  );
  assert.match(source, /ToggleGroup/);
  assert.match(source, /useSearchParams\(\)/);
  assert.doesNotMatch(source, /from "@comtammatu\/ui\/components\/tabs"/);
  assert.match(source, /aria-label=\{ORDERS_COPY\.operatorTabsAriaLabel\}/);
});

test("operator stock hub groups tiles into URL-synced tabs instead of a long tile scroll", () => {
  const source = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/page.tsx",
  );
  assert.match(source, /AppPageTabs/);
  assert.match(source, /paramKey="group"/);
  assert.match(source, /stockTabOnhand[\s\S]*stockTabCount[\s\S]*stockTabWaste[\s\S]*stockTabCatalog/);
  assert.match(source, /STOCK_TAB_SUFFIXES/);
  assert.doesNotMatch(source, /STOCK_PRIMARY_SUFFIXES/);
  assert.doesNotMatch(source, /STOCK_SECONDARY_SUFFIXES/);
});

test("operator home surfaces manager shift phases (open/run/close)", () => {
  const page = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/page.tsx",
  );
  const contract = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/_lib/operator-home-contract.ts",
  );
  assert.match(contract, /getBranchManagerHomePhaseGroups/);
  assert.match(contract, /BranchManagerHomePhase/);
  assert.match(page, /getBranchManagerHomePhaseGroups/);
  assert.match(page, /phaseSections/);
  assert.match(page, /phaseOpenTitle[\s\S]*phaseRunTitle[\s\S]*phaseCloseTitle/);
  // Phase config keeps the route-boundary guard satisfied: no literal /team or /stock* in the contract.
  assert.doesNotMatch(contract, /"\/team"|"\/stock(?:\/|")/);
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

  const layout = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/layout.tsx",
  );
  // Unread count is merged into the bell's accessible name, not left as a stray digit.
  assert.match(layout, /const notificationsAria =/);
  assert.match(layout, /\$\{unread\} chưa đọc/);

  const tile = read(
    "apps/web/lib/branch-operator/components/branch-operator-page.tsx",
  );
  // Panels can opt into the heading hierarchy; locked tiles surface a reason.
  assert.match(tile, /headingLevel\?: "h2" \| "h3" \| "h4"/);
  assert.match(tile, /disabledReason\?: string/);
  assert.match(tile, /headingLevel=\{headingLevel\}/);
});

test("operator dashboard streams readiness behind Suspense while tiles render immediately", () => {
  const source = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/dashboard/page.tsx",
  );
  assert.match(source, /<Suspense/);
  assert.match(source, /BranchReadinessSection/);
  assert.match(source, /BranchOperatorPanelSkeleton/);
  assert.match(source, /await fetchBranchDayStatus/);
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

test("Runner board halves its poll cadence to 6s while keeping deterministic staleness", () => {
  const source = read(
    "apps/web/app/(protected)/br/[branchId]/runner/runner-realtime-refresh.tsx",
  );
  // Still polling (derived "now serving" view needs a full rebuild per change and
  // must stay fresh on an always-visible kiosk even if the socket drops).
  assert.match(source, /const POLL_INTERVAL_MS = 6_000;/);
  assert.match(source, /window\.setInterval/);
  assert.match(source, /router\.refresh\(\)/);
});

test("POS self-order uses a realtime channel plus the 5s poll as a safety net", () => {
  const source = read(
    "apps/web/app/(protected)/br/[branchId]/pos/pos-desktop-inner.tsx",
  );
  // The poll stays (safety net for a silently dropped socket); a realtime channel
  // surfaces guest QR requests instantly through the same idempotent loader.
  assert.match(source, /pos-self-order-branch-/);
  assert.match(source, /table: "self_order_requests"/);
  assert.match(source, /table: "self_order_payment_requests"/);
  assert.match(source, /refreshSelfOrderPosStateRef\.current\(\)/);
  // 5s poll safety net is still present.
  assert.match(source, /5_000/);
});

test("floor clock-in returns cashier/chef to branch home (unlocked tiles)", () => {
  const clockPage = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/shift/clock/page.tsx",
  );
  const actions = read("apps/web/lib/staff-runtime/clock/actions.ts");
  // Branch home is where POS/KDS tiles unlock after clock-in.
  assert.match(clockPage, /home: `\/br\/\$\{branchId\}`/);
  // The RPC clock-in path is reached only by floor roles (manager-simple
  // returns earlier), so it lands them on branch home.
  const rpcBlock = actions.slice(
    actions.indexOf("employee_clock_in_with_checklist"),
  );
  assert.match(rpcBlock, /nextPath: "home"/);
});

test("KDS streams the station shell immediately and fetches the ticket snapshot on the client", () => {
  const page = read("apps/web/app/(protected)/br/[branchId]/kds/page.tsx");
  const realtime = read(
    "apps/web/app/(protected)/br/[branchId]/kds/_hooks/use-kds-realtime.ts",
  );
  const board = read("apps/web/app/(protected)/br/[branchId]/kds/kds-board.tsx");
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
  assert.match(source, /FormattedNumberInput/);
  assert.match(source, /aria-pressed=\{countMode === "total"\}/);
});
