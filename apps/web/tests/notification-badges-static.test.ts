import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import {
  getNavNotificationCount,
  type ShellNavItem,
  type ShellNotificationTarget,
} from "../app/lib/shell-primitives";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

const navItem = (
  href: string,
  extra: Partial<ShellNavItem> = {},
): ShellNavItem => ({
  href,
  label: href,
  icon: (() => null) as unknown as ShellNavItem["icon"],
  ...extra,
});

const targets: ShellNotificationTarget[] = [
  {
    kind: "inventory.stock_request_submitted",
    actionUrl: "/inventory/stock-requests/10",
    unreadCount: 2,
  },
  {
    kind: "procurement.purchase_request_submitted",
    actionUrl: "/inventory/purchase-requests?requestId=20&mode=view",
    unreadCount: 3,
  },
  {
    kind: "procurement.po_pending_approval",
    actionUrl: "/inventory/purchase-orders?poId=21&mode=view",
    unreadCount: 2,
  },
  {
    kind: "workflow.po_approved",
    actionUrl: "/inventory/grn",
    unreadCount: 2,
  },
  {
    kind: "pos.shift_variance",
    actionUrl: "/br/7/pos-sessions?session=30",
    unreadCount: 1,
  },
  {
    kind: "workflow.grn_pending",
    actionUrl: "/br/7/stock/grn/40",
    unreadCount: 4,
  },
  {
    kind: "hr.leave_requested",
    actionUrl: "/br/7/shift/leave-approvals",
    unreadCount: 5,
  },
];

test("notification counts roll up to modules and matching deep tabs", () => {
  assert.equal(getNavNotificationCount(navItem("/inventory"), targets), 13);
  assert.equal(getNavNotificationCount(navItem("/finance"), targets), 1);
  assert.equal(getNavNotificationCount(navItem("/hr"), targets), 5);
  assert.equal(
    getNavNotificationCount(
      navItem("/inventory/transfers", {
        matchPrefixes: ["/inventory/stock-requests"],
      }),
      targets,
    ),
    2,
  );
  assert.equal(
    getNavNotificationCount(navItem("/inventory/purchase-requests"), targets),
    3,
  );
  assert.equal(
    getNavNotificationCount(navItem("/inventory/purchase-orders"), targets),
    2,
  );
  assert.equal(getNavNotificationCount(navItem("/inventory/grn"), targets), 6);
  assert.equal(getNavNotificationCount(navItem("/hr/attendance"), targets), 5);
});

test("notification shell uses one realtime summary for footer and tab badges", () => {
  const appShell = read("apps/web/app/components/app-shell.tsx");
  const hook = read("apps/web/app/_hooks/use-notification-badges.ts");
  const foreground = read(
    "apps/web/app/_hooks/use-foreground-notifications.ts",
  );

  assert.match(appShell, /useNotificationBadges\(\)/);
  assert.match(appShell, /getNavNotificationCount/);
  assert.match(appShell, /href=\{notificationsHref\}/);
  assert.match(
    appShell,
    /<UnreadBadge count=\{notificationSummary\.unreadCount\}/,
  );
  assert.match(hook, /event: "\*"[\s\S]*table: "notifications"/);
  assert.match(hook, /status === "SUBSCRIBED"[\s\S]*refreshRef\.current/);
  assert.doesNotMatch(hook, /target_branch_id/);
  assert.match(foreground, /showInAppToast[\s\S]*toast\.info/);
  assert.match(foreground, /document\.visibilityState === "visible"/);
  assert.doesNotMatch(foreground, /target_branch_id/);
});

test("migration targets each handoff role and exposes exact grouped counts", () => {
  const migration = read(
    "supabase/migrations/20260730180000_ops_notification_badges.sql",
  );
  const notificationItem = read(
    "apps/web/app/_components/notification-item.tsx",
  );
  const notificationMessages = read(
    "apps/web/lib/messages/notifications.ts",
  );

  assert.match(migration, /ARRAY\['owner', 'central_supply_ops'\]::text\[\]/);
  assert.match(migration, /ARRAY\['owner', 'central_kitchen_lead'\]::text\[\]/);
  assert.match(migration, /ARRAY\['owner', 'accountant'\]::text\[\]/);
  assert.match(
    migration,
    /FUNCTION public\.trg_notify_po_sent\(\)[\s\S]*WHEN 'central_supply'[\s\S]*central_supply_ops[\s\S]*WHEN 'central_kitchen'[\s\S]*central_kitchen_lead/,
  );
  assert.match(migration, /'inventory\.stock_request_submitted'/);
  assert.match(migration, /'procurement\.purchase_request_submitted'/);
  assert.match(migration, /'procurement\.po_pending_approval'/);
  assert.match(migration, /'workflow\.po_approved'/);
  assert.match(notificationItem, /case "procurement\.po_pending_approval"/);
  assert.match(notificationItem, /case "workflow\.po_approved"/);
  assert.match(notificationMessages, /"procurement\.po_pending_approval"/);
  assert.match(notificationMessages, /"workflow\.po_approved"/);
  assert.match(
    migration,
    /NEW\.status NOT IN \('sent', 'pending_approval', 'approved'\)/,
  );
  assert.match(
    migration,
    /ON CONFLICT \(tenant_id, dedup_key\)[\s\S]*DO NOTHING/,
  );
  assert.match(
    migration,
    /FUNCTION public\.count_unread_notifications_by_target\(\)[\s\S]*GROUP BY notification\.kind, notification\.action_url/,
  );
  assert.match(
    migration,
    /REVOKE ALL[\s\S]*count_unread_notifications_by_target\(\)[\s\S]*FROM PUBLIC, anon/,
  );
});

test("resolved or deleted GRNs expire receiving notifications in realtime", () => {
  const migration = read(
    "supabase/migrations/20260730193000_expire_stale_grn_notifications.sql",
  );
  const hook = read("apps/web/app/_hooks/use-notification-badges.ts");

  assert.match(
    migration,
    /FUNCTION private\.expire_grn_pending_notification\(\)[\s\S]*SECURITY DEFINER[\s\S]*SET search_path TO ''/,
  );
  assert.match(
    migration,
    /UPDATE public\.notifications[\s\S]*SET expires_at = now\(\)[\s\S]*kind = 'workflow\.grn_pending'[\s\S]*entity_type = 'grn'/,
  );
  assert.match(
    migration,
    /kind IN \('workflow\.po_approved', 'workflow\.po_sent'\)[\s\S]*entity_type = 'purchase_order'[\s\S]*entity_id = v_po_id/,
  );
  assert.match(migration, /v_po_id bigint := OLD\.po_id/);
  assert.match(
    migration,
    /NOT EXISTS[\s\S]*FROM public\.goods_received_notes[\s\S]*status = 'draft'/,
  );
  assert.match(
    migration,
    /AFTER UPDATE OF status OR DELETE[\s\S]*ON public\.goods_received_notes/,
  );
  assert.match(hook, /event: "\*"/);
});
