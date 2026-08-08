import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

const desktop = read("app/(protected)/br/[branchId]/pos/pos-desktop-inner.tsx");
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

test("POS touch actions share one safe-area-aware fixed dock", () => {
  assert.match(
    mobileDock,
    /TOUCH_DOCK_CLASS\s*=\s*\n?\s*"[^"]*fixed inset-x-3 bottom-0[^"]*pos-safe-bottom[^"]*xl:hidden"/,
  );
  assert.match(
    mobileDock,
    /const showSelfOrderAction\s*=\s*\n?\s*selfOrderSyncFailed \|\| selfOrderRequestCount > 0/,
  );
  assert.match(mobileDock, /\{showSelfOrderAction \? \(/);
  assert.match(mobileDock, /onClick=\{onOpenSelfOrderApproval\}/);
  assert.doesNotMatch(mobileDock, /fixed right-3 bottom-20/);
  assert.doesNotMatch(desktop, /fixed right-3 bottom-20/);
});

test("POS desktop approval action stays in the sidebar flow", () => {
  assert.match(desktop, /sessionAction=\{desktopSelfOrderAction\}/);
  assert.match(sidebar, /sessionAction \? \(/);
  assert.match(sidebar, /\{sessionAction \? \([\s\S]*\{orderList\}/);
  assert.doesNotMatch(sidebar, /sessionAction=\{sessionAction\}/);
  // Dual-pane: session chrome lives only above the order-list column.
  assert.match(
    sidebar,
    /border-l border-border\/60 2xl:w-80">\s*\{sessionTopBar\}/,
  );
  assert.doesNotMatch(
    sidebar,
    /hidden h-full min-h-0 shrink-0 flex-col border-l[\s\S]*\{sessionTopBar\}[\s\S]*flex min-h-0 flex-1/,
  );
});

test("POS context gates preserve clearance for the complete touch dock", () => {
  for (const source of [tableGate, takeawayGate]) {
    assert.match(source, /hasStackedTouchActions\?: boolean/);
    assert.match(source, /hasStackedTouchActions \? "pb-40 xl:pb-4"/);
    assert.match(source, /"pb-28 xl:pb-4"/);
    assert.doesNotMatch(source, /md:py-4/);
  }

  assert.equal(
    (desktop.match(/hasStackedTouchActions=\{selfOrderActionVisible\}/g) ?? [])
      .length,
    3,
  );
});
