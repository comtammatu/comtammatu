import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  getNavNotificationCount,
  type ShellNavItem,
  type ShellNotificationTarget,
} from "../app/lib/shell-primitives";

const repoRoot = path.resolve(process.cwd(), "../..");
const read = (relPath: string) =>
  readFileSync(path.join(repoRoot, relPath), "utf8");

const navItem = (
  href: string,
  extra: Partial<ShellNavItem> = {},
): ShellNavItem => ({
  href,
  label: href,
  icon: (() => null) as unknown as ShellNavItem["icon"],
  ...extra,
});

test("migration 20260905150000 defines target_branch_id and target_user_id filtering", () => {
  const sql = read(
    "supabase/migrations/20260905150000_notification_targeting_and_badge_alignment.sql",
  );
  // Returns target_branch_id in count_unread_notifications_by_target
  assert.match(
    sql,
    /CREATE FUNCTION public\.count_unread_notifications_by_target\(\)[\s\S]*RETURNS TABLE\(kind text, action_url text, target_branch_id bigint, unread_count bigint\)/,
  );
  // Enforces target_user_id filtering in count_unread_notifications_by_target
  assert.match(
    sql,
    /NOT \(notification\.meta \? 'target_user_id'\)/,
  );
  assert.match(
    sql,
    /\(notification\.meta ->> 'target_user_id'\) = \(SELECT auth\.uid\(\)\)::text/,
  );
  // Enforces target_user_id in count_unread_notifications
  assert.match(
    sql,
    /NOT \(n\.meta \? 'target_user_id'\)/,
  );
  assert.match(
    sql,
    /\(n\.meta ->> 'target_user_id'\) = ctx\.user_id::text/,
  );
  // Enforces target_user_id in notifications_select RLS policy
  assert.match(
    sql,
    /CREATE POLICY notifications_select ON public\.notifications/,
  );
  assert.match(
    sql,
    /NOT \(meta \? 'target_user_id'\)/,
  );
  // Defines mark_entity_notifications_read RPC
  assert.match(
    sql,
    /CREATE OR REPLACE FUNCTION public\.mark_entity_notifications_read/,
  );
});

test("actions.ts passes target_branch_id and defines markEntityNotificationsRead", () => {
  const actions = read("apps/web/app/(protected)/notifications/actions.ts");
  assert.match(actions, /target_branch_id:\s*z\.coerce\.number\(\)/);
  assert.match(
    actions,
    /targetBranchId:\s*row\.target_branch_id \?\? null/,
  );
  assert.match(actions, /export async function markEntityNotificationsRead/);
  assert.match(actions, /supabase\.rpc\(\s*"mark_entity_notifications_read"/);
});

test("changed-event.ts supports BroadcastChannel cross-tab synchronization", () => {
  const changedEvent = read("apps/web/lib/notifications/changed-event.ts");
  assert.match(changedEvent, /BroadcastChannel\("ctmt:notifications"\)/);
  assert.match(changedEvent, /export function initNotificationSync/);
  assert.match(changedEvent, /postMessage\(\{\s*type:\s*NOTIFICATIONS_CHANGED_EVENT\s*\}\)/);
});

test("use-foreground-notifications silences non-actionable info toasts", () => {
  const foreground = read(
    "apps/web/app/_hooks/use-foreground-notifications.ts",
  );
  assert.match(
    foreground,
    /item\.severity === "info" && !item\.action_url/,
  );
});

test("getNavNotificationCount supports branch-scoped targets for branch navigation", () => {
  const branchTargets: ShellNotificationTarget[] = [
    {
      kind: "hr.leave_requested",
      actionUrl: "/br/7/team/leave-approvals?leaveRequestId=10",
      unreadCount: 3,
    },
    {
      kind: "attendance.checkout_requested",
      actionUrl: "/br/7/team/checkout-approvals?attendanceId=20",
      unreadCount: 2,
    },
    {
      kind: "pos.void_requested",
      actionUrl: "/br/7/orders?voidRequest=30",
      unreadCount: 1,
    },
  ];

  // Branch operator navigation items correctly receive counts
  assert.equal(
    getNavNotificationCount(
      navItem("/br/7/team/leave-approvals"),
      branchTargets,
    ),
    3,
  );
  assert.equal(
    getNavNotificationCount(
      navItem("/br/7/team/checkout-approvals"),
      branchTargets,
    ),
    2,
  );
  assert.equal(
    getNavNotificationCount(navItem("/br/7/orders"), branchTargets),
    1,
  );

  // Different branch should not receive count
  assert.equal(
    getNavNotificationCount(
      navItem("/br/9/team/leave-approvals"),
      branchTargets,
    ),
    0,
  );
});

test("notifications-client renders AppSegmentedControl with domain categories", () => {
  const client = read(
    "apps/web/app/(protected)/notifications/notifications-client.tsx",
  );
  assert.match(client, /AppSegmentedControl/);
  assert.match(client, /value:\s*"all"/);
  assert.match(client, /value:\s*"actionable"/);
  assert.match(client, /value:\s*"pos"/);
  assert.match(client, /value:\s*"inventory"/);
  assert.match(client, /value:\s*"hr"/);
  assert.match(client, /value:\s*"finance"/);
  assert.match(client, /categoryOptions/);
  assert.match(client, /filteredItems/);
});

test("notification-item includes 1-click mark read action", () => {
  const item = read("apps/web/app/_components/notification-item.tsx");
  assert.match(item, /IconCircleCheck/);
  assert.match(item, /onRead\(item\.id\)/);
  assert.match(item, /ItemActions/);
});

test("notification-bell uses widened popover and supports feedMode toggle", () => {
  const bell = read("apps/web/app/_components/notification-bell.tsx");
  assert.match(bell, /sm:w-96/);
  assert.match(bell, /feedMode=\{feedMode\}/);
  assert.match(bell, /onFeedModeChange=\{setFeedMode\}/);
});
