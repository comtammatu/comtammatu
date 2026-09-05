import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

test("POS menu reserves space for a one-row touch dock", () => {
  const inner = read("app/(protected)/br/[branchId]/pos/pos-desktop-inner.tsx");
  const pane = read(
    "app/(protected)/br/[branchId]/pos/_components/menu-pane.tsx",
  );
  const menu = read("app/(protected)/br/[branchId]/pos/pos-menu-grid.tsx");

  assert.match(inner, /<MenuPane[\s\S]*orderType=\{listPriceOrderType\}/);
  assert.doesNotMatch(pane, /hasStackedTouchActions/);
  assert.doesNotMatch(menu, /hasStackedTouchActions/);
  assert.match(menu, /pb-32/);
});

test("POS stale self-order requests remain openable after a sync failure", () => {
  const inner = read("app/(protected)/br/[branchId]/pos/pos-desktop-inner.tsx");
  const hook = read(
    "app/(protected)/br/[branchId]/pos/_hooks/use-self-order-pos-state.ts",
  );
  const header = read("app/(protected)/br/[branchId]/pos/pos-session-header.tsx");
  const dock = read(
    "app/(protected)/br/[branchId]/pos/_components/pos-mobile-action-bar.tsx",
  );

  assert.match(hook, /syncFailed && state\.requests\.length === 0/);
  assert.match(hook, /setApprovalOpen\(true\)/);
  assert.match(inner, /handleOpenApproval: handleOpenSelfOrderApproval/);
  assert.match(header, /selfOrderInterrupt\.failed &&/);
  assert.match(header, /voidInterrupt\.failed &&/);
  assert.match(dock, /h-\[env\(safe-area-inset-bottom\)\] bg-card\/95/);
  assert.match(dock, /APPEND_ACTION_BAR_CLASS/);
  assert.match(dock, /grid-cols-\[auto_minmax\(0,1fr\)_minmax\(0,1fr\)\]/);
});

test("POS session history actions are real and keyboard reachable", () => {
  const sessions = read(
    "app/(protected)/br/[branchId]/(operator)/pos-sessions/pos-sessions-client.tsx",
  );

  assert.match(sessions, /setCloseSessionId\(selectedSession\.id\)/);
  assert.match(
    sessions,
    /<CloseSessionSheet[\s\S]*sessionId=\{closeSessionId\}/,
  );
  assert.doesNotMatch(sessions, /onCloseShift=\{\(\) => \{\}\}/);
  assert.match(sessions, /render=\{<button type="button" \/>\}/);
  assert.match(
    sessions,
    /messages\.finance\.invoiceList\.methodFix[\s\S]{0,220}size="touch"|size="touch"[\s\S]{0,220}messages\.finance\.invoiceList\.methodFix/,
  );
});
