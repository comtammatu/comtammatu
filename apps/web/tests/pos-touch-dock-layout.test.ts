import { readSql } from "./_lib/active-sql.ts";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = process.cwd();
const read = (path: string) =>
  String(path).includes("supabase/migrations/")
    ? readSql(root, String(path).replace(/^.*?(supabase\/)/, "supabase/"))
    : readFileSync(join(root, path), "utf8");

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
  assert.doesNotMatch(mobileDock, /onOpenSelfOrderApproval/);
  assert.doesNotMatch(mobileDock, /fixed right-3 bottom-20/);
  assert.doesNotMatch(desktop, /fixed right-3 bottom-20/);
});

test("POS desktop approval action stays in session chrome, not a sidebar row", () => {
  assert.match(desktop, /selfOrderInterrupt=\{selfOrderInterrupt\}/);
  assert.match(sidebar, /selfOrderInterrupt=\{selfOrderInterrupt\}/);
  assert.doesNotMatch(desktop, /sessionAction=/);
  assert.doesNotMatch(sidebar, /sessionAction/);
  assert.match(
    sidebar,
    /border-l border-border\/60 2xl:w-88">\s*\{sessionTopBar\}/,
  );
  assert.doesNotMatch(
    sidebar,
    /hidden h-full min-h-0 shrink-0 flex-col border-l[\s\S]*\{sessionTopBar\}[\s\S]*flex min-h-0 flex-1/,
  );
});

test("POS context gates preserve clearance for the one-row touch dock", () => {
  for (const source of [tableGate, takeawayGate]) {
    assert.doesNotMatch(source, /hasStackedTouchActions/);
    assert.match(source, /pb-28/);
    assert.doesNotMatch(source, /md:py-4/);
  }
});
