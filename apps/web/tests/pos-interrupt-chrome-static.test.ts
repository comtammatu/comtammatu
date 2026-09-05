import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

const desktop = read("app/(protected)/br/[branchId]/pos/pos-desktop-inner.tsx");
const header = read("app/(protected)/br/[branchId]/pos/pos-session-header.tsx");
const mobileDock = read(
  "app/(protected)/br/[branchId]/pos/_components/pos-mobile-action-bar.tsx",
);
const sidebar = read(
  "app/(protected)/br/[branchId]/pos/_components/pos-sidebar-variants.tsx",
);
const tableGate = read("app/(protected)/br/[branchId]/pos/pos-table-gate.tsx");
const takeawayGate = read(
  "app/(protected)/br/[branchId]/pos/pos-takeaway-gate.tsx",
);
const menuGrid = read("app/(protected)/br/[branchId]/pos/pos-menu-grid.tsx");
const menuPane = read(
  "app/(protected)/br/[branchId]/pos/_components/menu-pane.tsx",
);
const picker = read(
  "app/(protected)/br/[branchId]/pos/_components/multi-order-table-picker.tsx",
);
const selfOrderHook = read(
  "app/(protected)/br/[branchId]/pos/_hooks/use-self-order-pos-state.ts",
);
const voidHook = read(
  "app/(protected)/br/[branchId]/pos/_hooks/use-pos-void-request-queue.ts",
);
const orderSync = read(
  "app/(protected)/br/[branchId]/pos/_hooks/use-order-sync.ts",
);
const voidQueue = read(
  "app/(protected)/br/[branchId]/pos/_components/void-request-queue.tsx",
);

test("POS touch actions share one safe-area-aware fixed dock", () => {
  assert.match(
    mobileDock,
    /TOUCH_DOCK_CLASS\s*=\s*\n?\s*"[^"]*fixed inset-x-3 bottom-0[^"]*pos-safe-bottom[^"]*xl:hidden"/,
  );
  assert.doesNotMatch(mobileDock, /onOpenSelfOrderApproval/);
  assert.doesNotMatch(mobileDock, /showSelfOrderAction/);
  assert.doesNotMatch(mobileDock, /fixed right-3 bottom-20/);
  assert.doesNotMatch(desktop, /fixed right-3 bottom-20/);
});

test("POS QR duyệt lives on session chrome, not a stacked dock or sidebar row", () => {
  assert.match(header, /selfOrderInterrupt\?:/);
  assert.match(header, /ClipboardCheck as IconClipboardCheck/);
  assert.match(header, /messages\.pos\.sessionHeader\.selfOrderApproveAria/);
  assert.match(desktop, /selfOrderInterrupt=\{selfOrderInterrupt\}/);
  assert.match(sidebar, /selfOrderInterrupt=\{selfOrderInterrupt\}/);
  assert.doesNotMatch(desktop, /sessionAction=/);
  assert.doesNotMatch(sidebar, /sessionAction/);
  assert.doesNotMatch(desktop, /desktopSelfOrderAction/);
});

test("POS desktop dual-pane keeps session chrome only above the order list", () => {
  assert.match(
    sidebar,
    /border-l border-border\/60 2xl:w-88">\s*\{sessionTopBar\}/,
  );
  assert.doesNotMatch(
    sidebar,
    /hidden h-full min-h-0 shrink-0 flex-col border-l[\s\S]*\{sessionTopBar\}[\s\S]*flex min-h-0 flex-1/,
  );
  assert.match(sidebar, /paymentCallByOrderId=\{paymentCallByOrderId\}/);
});

test("POS context gates and menu keep one-row dock clearance", () => {
  for (const source of [tableGate, takeawayGate]) {
    assert.doesNotMatch(source, /hasStackedTouchActions/);
    assert.match(source, /pb-28 xl:pb-4|pb-28 md:px-4 md:pt-4 xl:pb-4/);
    assert.doesNotMatch(source, /md:py-4/);
  }
  assert.doesNotMatch(menuPane, /hasStackedTouchActions/);
  assert.doesNotMatch(menuGrid, /hasStackedTouchActions/);
  assert.match(menuGrid, /pb-32/);
  assert.doesNotMatch(desktop, /hasStackedTouchActions/);
});

test("POS self-order poll stays in a dedicated hook; session close rides pos-branch", () => {
  assert.match(selfOrderHook, /fetchSelfOrderPosState/);
  assert.match(selfOrderHook, /30_000/);
  assert.match(selfOrderHook, /selfOrderSignalRef\.current = refresh;/);
  assert.match(selfOrderHook, /kind: "pos\.self_order"/);
  assert.match(selfOrderHook, /kind: "pos\.payment_call"/);
  assert.match(selfOrderHook, /kind: "pos\.staff_call"/);
  assert.match(selfOrderHook, /setSyncFailed\(true\)/);
  assert.match(orderSync, /table: "pos_sessions"/);
  assert.match(orderSync, /isClosedPosSessionUpdate/);
  assert.match(desktop, /useSelfOrderPosState/);
  assert.match(desktop, /usePosFloorSelect/);
  assert.doesNotMatch(desktop, /usePosSessionCloseSync/);
});

test("POS paid-void duyệt lives on session chrome StationSheet, not a body banner", () => {
  assert.match(header, /voidInterrupt\?:/);
  assert.match(header, /Ban as IconBan/);
  assert.match(header, /messages\.pos\.sessionHeader\.voidRequestAria/);
  assert.match(desktop, /voidInterrupt=\{voidInterrupt\}/);
  assert.match(sidebar, /voidInterrupt=\{voidInterrupt\}/);
  assert.doesNotMatch(desktop, /<VoidRequestQueue/);
  assert.doesNotMatch(desktop, /px-3 pt-2 sm:px-4/);
  assert.match(voidQueue, /<StationSheet/);
  assert.match(voidQueue, /export function VoidRequestSheet/);
  assert.match(voidHook, /listPendingPosVoidRequests/);
  assert.match(voidHook, /30_000/);
  assert.match(voidHook, /subscribeBranchOps/);
  assert.match(voidHook, /pos_void_requests/);
  assert.doesNotMatch(voidHook, /useRealtimeChannel/);
  assert.match(desktop, /usePosVoidRequestQueue/);
  assert.match(desktop, /<VoidRequestSheet/);
});

test("POS multi-order picker stays on StationSheet", () => {
  assert.match(picker, /<StationSheet/);
  assert.doesNotMatch(picker, /AppDrawer/);
  assert.match(
    picker,
    /contentClassName="mx-auto flex max-h-dvh-80 w-full max-w-md flex-col overflow-hidden sm:max-w-lg"/,
  );
  assert.match(picker, /footerClassName="pos-safe-bottom shrink-0"/);
});
