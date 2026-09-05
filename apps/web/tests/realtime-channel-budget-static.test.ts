import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(rel: string): string {
  return readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");
}

const posMenu = read(
  "app/(protected)/br/[branchId]/pos/_hooks/use-pos-menu-sync.ts",
);
const posLayout = read("app/(protected)/br/[branchId]/pos/layout.tsx");
const posDesktop = read(
  "app/(protected)/br/[branchId]/pos/pos-desktop-inner.tsx",
);
const posProvider = read(
  "app/(protected)/br/[branchId]/pos/_providers/pos-desktop-provider.tsx",
);
const posOrderSync = read(
  "app/(protected)/br/[branchId]/pos/_hooks/use-order-sync.ts",
);
const posPrintJobs = read(
  "app/(protected)/br/[branchId]/pos/_hooks/use-print-job-alerts.ts",
);
const badges = read("app/_hooks/use-notification-badges.ts");
const feed = read("app/_hooks/use-notifications.ts");
const popups = read("app/_hooks/use-foreground-notifications.ts");
const notificationRuntime = read("app/_hooks/notification-runtime.ts");
const sessionActions = read(
  "app/(protected)/br/[branchId]/pos/session-actions.ts",
);

test("POS menu and self-order share BranchOpsRuntime instead of a second JOIN", () => {
  assert.match(posMenu, /subscribeBranchOps/);
  assert.doesNotMatch(posMenu, /useRealtimeChannel/);
  assert.doesNotMatch(posLayout, /BranchOpsRefresh/);
});

test("idle POS folds session, limits, and print jobs onto pos-branch postgres_changes", () => {
  assert.match(posOrderSync, /useRealtimeChannel/);
  assert.match(posOrderSync, /channel\(`pos-branch-\$\{String\(branchId\)\}`\)/);
  assert.match(posOrderSync, /table: "orders"/);
  assert.match(posOrderSync, /table: "tables"/);
  assert.match(posOrderSync, /table: "notifications"/);
  assert.match(posOrderSync, /table: "branch_menu_item_daily_limits"/);
  assert.match(posOrderSync, /table: "pos_sessions"/);
  assert.match(posOrderSync, /table: "print_jobs"/);
  assert.match(posOrderSync, /isClosedPosSessionUpdate/);
  assert.match(posOrderSync, /isCurrentDailyLimitRealtimeEvent/);
  assert.match(posProvider, /refreshLimits: refreshDailyLimitsDeduped/);
  assert.match(posProvider, /onSessionClosed: handleSessionClosed/);
  assert.match(posProvider, /onPrintJobUpdate: printJobAlerts\.handlePrintJobUpdate/);
  assert.doesNotMatch(posDesktop, /usePosSessionCloseSync/);
  assert.doesNotMatch(posDesktop, /useRealtimeChannel/);
  assert.doesNotMatch(posPrintJobs, /useRealtimeChannel/);
  assert.doesNotMatch(posOrderSync, /\.channel\(`pos-session-branch-/);
  assert.doesNotMatch(posOrderSync, /\.channel\(`pos-daily-limits-branch-/);
  assert.doesNotMatch(posOrderSync, /\.channel\(`pos-print-jobs-/);
  assert.doesNotMatch(posOrderSync, /from "next\/navigation"/);
  assert.match(posProvider, /router\.refresh\(\)/);
});

test("notification badges, feed, and popups share one tenant JOIN owner", () => {
  assert.match(notificationRuntime, /`notifications-\$\{String\(tenantId\)\}`/);
  assert.match(badges, /useNotificationEvents/);
  assert.match(feed, /useNotificationEvents/);
  assert.match(popups, /useNotificationEvents/);
  assert.doesNotMatch(badges, /notification-badges-/);
  assert.doesNotMatch(popups, /notification-popups-/);
  assert.doesNotMatch(feed, /notifications-\$\{channelSuffix\}/);
  assert.match(popups, /insertOnly:\s*true/);
});

test("POS permission flags probe through the request-scoped permission cache", () => {
  assert.match(sessionActions, /probePermission\(/);
  assert.doesNotMatch(
    sessionActions,
    /ctx\.supabase\.rpc\("has_permission"/,
  );
});
