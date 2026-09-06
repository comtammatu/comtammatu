import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../../..", import.meta.url));

function read(relativePath: string): string {
  return readFileSync(`${repositoryRoot}/${relativePath}`, "utf8");
}

test("KDS board controls strictly adhere to universal 48px touch standards", () => {
  const topBar = read(
    "apps/web/app/(protected)/br/[branchId]/kds/_components/board-header.tsx",
  );
  const stationToggle = read(
    "apps/web/app/(protected)/br/[branchId]/kds/_components/station-toggle-bar.tsx",
  );
  const viewMode = read(
    "apps/web/app/(protected)/br/[branchId]/kds/_components/view-mode-toggle.tsx",
  );
  const unassigned = read(
    "apps/web/app/(protected)/br/[branchId]/kds/_components/unassigned-banner.tsx",
  );
  const orderGrid = read(
    "apps/web/app/(protected)/br/[branchId]/kds/_components/order-grid.tsx",
  );
  const focusView = read(
    "apps/web/app/(protected)/br/[branchId]/kds/_components/focus-view.tsx",
  );
  const batchActions = read(
    "apps/web/app/(protected)/br/[branchId]/kds/_components/batch-actions.tsx",
  );
  const undoBar = read(
    "apps/web/app/(protected)/br/[branchId]/kds/_components/kds-undo-bar.tsx",
  );

  // 1. Top bar action buttons and menu items
  assert.match(topBar, /size="icon-touch"/, "TopBar actions must use size icon-touch");
  assert.match(topBar, /className="min-h-12 text-sm"/, "Dropdown menu items must enforce 48px min-h-12");

  // 2. Station toggle bar buttons
  assert.match(stationToggle, /size="touch"/, "Station toggle buttons must use size touch");

  // 3. View mode toggle group
  assert.match(viewMode, /<ToggleGroup[\s\S]*?size="touch"/, "View mode toggle must use size touch");

  // 4. Unassigned banner buttons
  assert.match(unassigned, /size="touch"/, "Unassigned banner action buttons must use size touch");

  // 5. Order grid complete & recall buttons and item row height
  assert.match(orderGrid, /size="touch"/, "Order grid actions must use size touch");
  assert.match(orderGrid, /min-h-12/, "Order grid item rows must enforce 48px min-h-12");

  // 6. Focus view navigation, quantity badge, item actions, and batch action
  assert.match(focusView, /size="icon-touch"/, "Focus view prev/next buttons must use size icon-touch");
  assert.match(focusView, /min-h-12 w-14/, "Focus view item quantity badge must enforce 48px min-h-12");
  assert.match(focusView, /size="touch"/, "Focus view item actions must use size touch");
  assert.match(focusView, /size="touch-lg"/, "Focus view batch action must use size touch-lg");

  // 7. Batch actions button
  assert.match(batchActions, /size=\{layout === "title" \? "touch" : "touch-lg"\}/, "Batch actions must use touch or touch-lg");

  // 8. Undo bar actions
  assert.match(undoBar, /size="touch"/, "Undo bar recall button must use size touch");
  assert.match(undoBar, /size="icon-touch"/, "Undo bar dismiss button must use size icon-touch");
});

test("KDS Completion History layout is redesigned for focused understanding, multi-column cards, and 48px touch controls", () => {
  const historySheet = read(
    "apps/web/app/(protected)/br/[branchId]/kds/_components/completion-history-sheet.tsx",
  );
  const dateField = read("apps/web/app/components/form/business-date-field.tsx");

  // 1. BusinessDatePicker size prop
  assert.match(dateField, /size\?: "field" \| "touch"/, "BusinessDatePickerProps must declare size prop");
  assert.match(dateField, /size = "field"/, "BusinessDatePicker must default size to field");

  // 2. Completion history sheet standard overlay contract
  assert.match(historySheet, /size="lg"/, "StationSheet must use size lg");
  assert.match(historySheet, /fullscreen=\{isCompactLayout\}/, "StationSheet must use fullscreen on compact layout");

  // 3. Top filter controls use size touch
  assert.match(historySheet, /<BusinessDatePicker[\s\S]*?size="touch"/, "Date picker must use size touch");
  assert.match(historySheet, /<SelectTrigger[\s\S]*?size="touch"/, "Event type trigger must use size touch");
  assert.match(historySheet, /<Button[\s\S]*?size="touch"[\s\S]*?onClick=\{loadHistory\}/, "Reload button must use size touch");

  // 4. Quick filter chips with 48px touch and counts
  assert.match(historySheet, /QUICK_FILTER_ITEMS/, "Must define quick filter items");
  assert.match(historySheet, /size="touch"[\s\S]*?onClick=\{\(\) => setEventType\(item\.type\)\}/, "Quick filter chips must use size touch");

  // 5. Responsive multi-column event card grid
  assert.match(historySheet, /grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3/, "History cards must display in responsive multi-column grid");

  // 6. Card focuses on clear understanding without printer debug or redundant badges
  assert.match(historySheet, /formatVNTimeSeconds\(entry\.occurredAt\)/, "History card must display clean time with seconds");
  assert.match(historySheet, /entry\.quantity\}×/, "History card must display large bold item quantity");
  assert.match(historySheet, /isProblemEvent && entry\.reason/, "History card must display dedicated issue reason box for recalled/cancelled");
  assert.doesNotMatch(historySheet, /printJobs/, "History card must not contain printer spool debug noise");
  assert.doesNotMatch(historySheet, /legacySnapshot/, "History card must not display legacy snapshot warning");
  assert.doesNotMatch(historySheet, /KDS_COMPLETION_HISTORY_COPY\.ticket/, "History card must not display redundant kitchen ticket badge");
});

test("KDS comprehensive order grid enforces multi-column lane layout with tablet scroll isolation", () => {
  const orderGrid = read(
    "apps/web/app/(protected)/br/[branchId]/kds/_components/order-grid.tsx",
  );

  // 1. Multi-column grid on md and xl
  assert.match(
    orderGrid,
    /grid min-h-full grid-cols-1 gap-3 p-2\.5 md:grid-cols-3 md:gap-3\.5 md:p-3 xl:h-full xl:min-h-0 xl:grid-cols-3 xl:gap-4 xl:overflow-hidden xl:p-3\.5/,
    "OrderGrid must declare 1 column on mobile and 3 columns on tablet and desktop",
  );

  // 2. OrderColumn has independent scroll
  assert.match(orderGrid, /className="flex min-h-0 min-w-0 flex-col xl:h-full"/, "OrderColumn must declare xl:h-full");
  assert.match(orderGrid, /className="min-h-0 flex-1 overflow-y-auto xl:overflow-hidden"/, "OrderGrid must declare xl:overflow-hidden for lane isolation");
});

test("Pickup Station enforces 12-column responsive layout and operational PWA touch controls", () => {
  const pickupBoard = read(
    "apps/web/app/(protected)/br/[branchId]/pickup/pickup-order-board-client.tsx",
  );
  const pwaToolbar = read("apps/web/app/components/pwa-toolbar.tsx");

  // 1. Column headings: 2 columns on mobile, 12 columns on desktop
  assert.match(
    pickupBoard,
    /grid grid-cols-2 border-b border-border bg-muted\/50 sm:grid-cols-12/,
    "Pickup headings must use 2-col mobile and 12-col desktop grid",
  );

  // 2. Row limits: 4 on mobile/tablet via useIsMobile(1280), 6 on xl
  assert.match(pickupBoard, /useIsMobile\(1280\)/, "Pickup board must detect mobile/tablet breakpoint at 1280px");
  assert.match(pickupBoard, /PICKUP_ROW_LIMIT_BASE = 4/, "Base row limit must be 4");
  assert.match(pickupBoard, /PICKUP_ROW_LIMIT_XL = 6/, "XL row limit must be 6");

  // 3. Overflow rail preview
  assert.match(pickupBoard, /PickupOverflowRail/, "Must provide overflow rail preview");
  assert.match(pickupBoard, /grid grid-flow-col auto-cols-fr gap-2/, "Overflow rail must auto-flow preview tiles");

  // 4. Operational PWA toolbar buttons use touch standard
  assert.match(pwaToolbar, /size="touch"[\s\S]*?copy\.updateButton/, "Update button must use size touch");
  assert.match(pwaToolbar, /size="touch"[\s\S]*?handleInstallContained/, "Install button must use size touch");
  assert.match(pwaToolbar, /size="touch"[\s\S]*?handleDismiss/, "Dismiss button must use size touch");
  assert.match(pwaToolbar, /size="icon-touch"/, "Entry link must use size icon-touch");
});
