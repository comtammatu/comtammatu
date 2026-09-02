import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";
import { readSql, assertSqlMatch, assertSqlNotMatch } from "./_lib/active-sql.ts";

import {
  getNavNotificationCount,
  type ShellNavItem,
  type ShellNotificationTarget,
} from "../app/lib/shell-primitives";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readSql(repoRoot, path);

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
    kind: "workflow.po_sent",
    actionUrl: "/inventory/grn",
    unreadCount: 1,
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
    actionUrl: "/br/7/team/leave-approvals",
    unreadCount: 5,
  },
  {
    kind: "inventory.stocktake_completed",
    actionUrl: "/inventory/stocktake/99?branch=7",
    unreadCount: 1,
  },
  {
    kind: "inventory.stocktake_conflict",
    actionUrl: "/inventory/stocktake/98?branch=7",
    unreadCount: 2,
  },
  {
    kind: "inventory.count_slip_submitted",
    actionUrl: "/inventory/count-slips/50",
    unreadCount: 3,
  },
  {
    kind: "inventory.count_slip_recount",
    actionUrl: "/inventory/count-slips/51",
    unreadCount: 1,
  },
];

test("notification counts roll up to modules and matching work queues", () => {
  assert.equal(getNavNotificationCount(navItem("/inventory"), targets), 20);
  assert.equal(getNavNotificationCount(navItem("/finance"), targets), 0);
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
    getNavNotificationCount(navItem("/inventory/purchase-orders"), targets),
    8,
  );
  assert.equal(
    getNavNotificationCount(navItem("/inventory/purchase-requests"), targets),
    0,
  );
  assert.equal(getNavNotificationCount(navItem("/inventory/grn"), targets), 4);
  assert.equal(getNavNotificationCount(navItem("/hr/attendance"), targets), 5);
});

test("stocktake nav badges actionable count work only, not completed FYI", () => {
  const stocktakeNav = navItem("/inventory/stocktake", {
    matchPrefixes: [
      "/inventory/stocktake/",
      "/inventory/count-assignments",
      "/inventory/count-slips",
    ],
  });

  assert.equal(getNavNotificationCount(stocktakeNav, targets), 6);
  assert.equal(
    getNavNotificationCount(stocktakeNav, [
      {
        kind: "inventory.stocktake_completed",
        actionUrl: "/inventory/stocktake/99?branch=7",
        unreadCount: 9,
      },
    ]),
    0,
  );
});

test("notification shell uses one realtime summary for footer and tab badges", () => {
  const appShell = read("apps/web/app/components/app-shell.tsx");
  const hook = read("apps/web/app/_hooks/use-notification-badges.ts");
  const foreground = read(
    "apps/web/app/_hooks/use-foreground-notifications.ts",
  );

  assert.match(appShell, /useNotificationBadges\(\)/);
  assert.match(appShell, /getNavNotificationCount/);
  assert.match(appShell, /<NotificationBell/);
  assert.match(
    appShell,
    /unreadCount=\{notificationSummary\.unreadCount\}/,
  );
  assert.doesNotMatch(appShell, /href=\{notificationsHref\}/);
  assert.match(hook, /event: "\*"[\s\S]*table: "notifications"/);
  assert.match(hook, /table: "notification_reads"/);
  assert.match(hook, /status === "SUBSCRIBED"[\s\S]*refreshRef\.current/);
  assert.doesNotMatch(hook, /target_branch_id/);
  assert.match(foreground, /showInAppToast[\s\S]*toast\.info/);
  assert.match(foreground, /action:[\s\S]*openCtaLabel|options\.action/);
  assert.match(foreground, /document\.visibilityState === "visible"/);
  assert.doesNotMatch(foreground, /target_branch_id/);
  assert.match(foreground, /shouldShowInAppToast|branch_management/);
});

test("notification feed uses RowActionsMenu and ContextMenu from one RowActionItem array", () => {
  const item = read("apps/web/app/_components/notification-item.tsx");
  assert.match(item, /getNotificationRowActions/);
  assert.match(item, /RowActionsMenu/);
  assert.match(item, /RowActionsContextMenuItems/);
  assert.match(item, /ContextMenuTrigger/);
});

test("migration expires leave checkout count-slip and adds payroll ready", () => {
  const migration = read(
    "supabase/migrations/20260806141945_notification_work_queue_expire_and_payroll.sql",
  );
  assertSqlMatch(migration, /expire_leave_request_notification/);
  assertSqlMatch(migration, /expire_checkout_request_notification/);
  assertSqlMatch(migration, /expire_count_slip_submitted_notification/);
  assertSqlMatch(migration, /hr\.payroll_period_ready/);
  assertSqlMatch(migration, /team\?tab=leaves/);
  assertSqlMatch(migration, /team\?tab=checkouts/);
  assertSqlMatch(migration, /p_include_expired/);
  assertSqlMatch(migration, /WHEN 'critical' THEN 0/);
});

test("migration retires cron health from the Owner notification feed", () => {
  const migration = read(
    "supabase/migrations/20260806145335_remove_cron_health_owner_notifications.sql",
  );
  assertSqlMatch(migration, /CREATE OR REPLACE FUNCTION public\.check_cron_jobs_health/);
  assertSqlMatch(migration, /jobname = 'check_cron_jobs_health_job'/);
  assertSqlMatch(migration, /cron\.unschedule/);
  assertSqlMatch(migration, /DELETE FROM public\.notifications[\s\S]*kind = 'system\.cron_failed'/);
  assertSqlNotMatch(migration, /INSERT INTO public\.notifications/);
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

  assertSqlMatch(migration, /ARRAY\['owner', 'central_supply_ops'\]::text\[\]/);
  assertSqlMatch(migration, /ARRAY\['owner', 'central_kitchen_lead'\]::text\[\]/);
  assertSqlMatch(migration, /ARRAY\['owner', 'accountant'\]::text\[\]/);
  assertSqlMatch(migration,
    /FUNCTION public\.trg_notify_po_sent\(\)[\s\S]*WHEN 'central_supply'[\s\S]*central_supply_ops[\s\S]*WHEN 'central_kitchen'[\s\S]*central_kitchen_lead/,
  );
  assertSqlMatch(migration, /'inventory\.stock_request_submitted'/);
  assertSqlMatch(migration, /'procurement\.purchase_request_submitted'/);
  assertSqlMatch(migration, /'procurement\.po_pending_approval'/);
  assertSqlMatch(migration, /'workflow\.po_approved'/);
  assert.match(notificationItem, /case "procurement\.po_pending_approval"/);
  assert.match(notificationItem, /case "workflow\.po_approved"/);
  assert.match(notificationMessages, /"procurement\.po_pending_approval"/);
  assert.match(notificationMessages, /"workflow\.po_approved"/);
  assertSqlMatch(migration,
    /NEW\.status NOT IN \('sent', 'pending_approval', 'approved'\)/,
  );
  assertSqlMatch(migration,
    /ON CONFLICT \(tenant_id, dedup_key\)[\s\S]*DO NOTHING/,
  );
  assertSqlMatch(migration,
    /FUNCTION public\.count_unread_notifications_by_target\(\)[\s\S]*GROUP BY notification\.kind, notification\.action_url/,
  );
  assertSqlMatch(migration,
    /REVOKE ALL[\s\S]*count_unread_notifications_by_target\(\)[\s\S]*FROM PUBLIC, anon/,
  );
});

test("resolved or deleted GRNs expire receiving notifications in realtime", () => {
  const migration = read(
    "supabase/migrations/20260730193000_expire_stale_grn_notifications.sql",
  );
  const hook = read("apps/web/app/_hooks/use-notification-badges.ts");

  assertSqlMatch(migration,
    /FUNCTION private\.expire_grn_pending_notification\(\)[\s\S]*SECURITY DEFINER[\s\S]*SET search_path TO ''/,
  );
  assertSqlMatch(migration,
    /UPDATE public\.notifications[\s\S]*SET expires_at = now\(\)[\s\S]*kind = 'workflow\.grn_pending'[\s\S]*entity_type = 'grn'/,
  );
  assertSqlMatch(migration,
    /kind IN \('workflow\.po_approved', 'workflow\.po_sent'\)[\s\S]*entity_type = 'purchase_order'[\s\S]*entity_id = v_po_id/,
  );
  assertSqlMatch(migration, /v_po_id bigint := OLD\.po_id/);
  assertSqlMatch(migration,
    /NOT EXISTS[\s\S]*FROM public\.goods_received_notes[\s\S]*status = 'draft'/,
  );
  assertSqlMatch(migration,
    /AFTER UPDATE OF status OR DELETE[\s\S]*ON public\.goods_received_notes/,
  );
  assert.match(hook, /event: "\*"/);
});

test("procurement notifications route to Mua hàng and GRNs route to Nhập kho", () => {
  const shell = read("apps/web/app/lib/shell-primitives.ts");
  const migration = read(
    "supabase/migrations/20260730195000_route_procurement_notifications.sql",
  );

  for (const kind of [
    "procurement.purchase_request_submitted",
    "procurement.po_pending_approval",
    "workflow.po_approved",
    "workflow.po_sent",
  ]) {
    assert.match(
      shell,
      new RegExp(
        `"${kind.replaceAll(".", "\\.")}": "/inventory/purchase-orders"`,
      ),
    );
  }
  assert.match(shell, /"workflow\.grn_pending": "\/inventory\/grn"/);
  assert.match(
    shell,
    /const targetPath = notificationKindTargetPath\(target\.kind\) \?\? actionPath/,
  );
  assertSqlMatch(migration,
    /WHEN 'procurement\.purchase_request_submitted'[\s\S]*tab=needs&demandId=%s&mode=view/,
  );
  assertSqlMatch(migration,
    /WHEN 'workflow\.po_approved'[\s\S]*WHEN 'workflow\.po_sent'[\s\S]*tab=orders&poId=%s&mode=view/,
  );
  assertSqlMatch(migration,
    /UPDATE public\.notifications[\s\S]*procurement\.purchase_request_submitted[\s\S]*workflow\.po_approved[\s\S]*workflow\.po_sent/,
  );
});

test("stocktake completed is excluded from nav badges; conflict expires on resolve", () => {
  const shell = read("apps/web/app/lib/shell-primitives.ts");
  const migration = read(
    "supabase/migrations/20260811142314_expire_stocktake_conflict_notification.sql",
  );

  assert.match(shell, /NAV_BADGE_EXCLUDED_KINDS/);
  assert.match(shell, /"inventory\.stocktake_completed"/);
  assert.doesNotMatch(
    shell,
    /"inventory\.stocktake_completed": "\/inventory\/stocktake"/,
  );
  assert.match(shell, /"inventory\.stocktake_conflict": "\/inventory\/stocktake"/);
  assert.match(shell, /"inventory\.count_slip_recount": "\/inventory\/count-slips"/);
  assertSqlMatch(migration,
    /FUNCTION private\.expire_stocktake_conflict_notification\(\)/,
  );
  assertSqlMatch(migration,
    /kind = 'inventory\.stocktake_conflict'[\s\S]*dedup_key = format\(\s*'stocktake\.conflict:%s:%s'/,
  );
  assertSqlMatch(migration,
    /AFTER UPDATE OF resolved_at OR DELETE[\s\S]*ON public\.stocktake_conflicts/,
  );
  assertSqlMatch(migration,
    /UPDATE public\.notifications AS notification[\s\S]*conflict\.resolved_at IS NOT NULL/,
  );
});
