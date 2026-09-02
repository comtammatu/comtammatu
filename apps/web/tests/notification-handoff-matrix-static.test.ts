import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";
import { readSql, assertSqlMatch, assertSqlNotMatch } from "./_lib/active-sql.ts";


const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readSql(repoRoot, path);

const migration = read(
  "supabase/migrations/20260809160855_notification_handoff_matrix_harden.sql",
);

test("YCM producer fires on pending_allocation matching live submit path", () => {
  assertSqlMatch(migration, /notify_purchase_request_submitted/);
  assertSqlMatch(migration, /NEW\.status <> 'pending_allocation'/);
  assertSqlMatch(migration, /ARRAY\['owner', 'accountant'\]/);
  assertSqlNotMatch(migration,
    /notify_purchase_request_submitted[\s\S]*NEW\.status <> 'submitted'/,
  );
});

test("notification_reads is published for realtime mark-read freshness", () => {
  assertSqlMatch(migration, /notification_reads REPLICA IDENTITY FULL/);
  assertSqlMatch(migration,
    /ALTER PUBLICATION supabase_realtime ADD TABLE public\.notification_reads/,
  );
});

test("inventory finance orders hr handoff producers are present", () => {
  assertSqlMatch(migration, /inventory\.stock_request_rejected/);
  assertSqlMatch(migration, /inventory\.waste_pending_approval/);
  assertSqlMatch(migration, /expire_po_pending_approval_notification/);
  assertSqlMatch(migration, /workflow\.transfer_in_transit:%s/);
  assertSqlMatch(migration, /'inventory\.valuation_variance'/);
  assertSqlMatch(migration, /ARRAY\['owner', 'accountant'\]/);
  assertSqlMatch(migration, /hr\.leave_approved/);
  assertSqlMatch(migration, /hr\.leave_rejected/);
  assertSqlMatch(migration, /hr\.checkout_approved/);
  assertSqlMatch(migration, /hr\.checkout_rejected/);
  assertSqlMatch(migration, /pos\.void_resolved/);
  assertSqlMatch(migration, /expire.*pos\.void_requested|kind = 'pos\.void_requested'/);
});

test("client hooks subscribe to notification_reads and resolve badge URLs", () => {
  const feed = read("apps/web/app/_hooks/use-notifications.ts");
  const badges = read("apps/web/app/_hooks/use-notification-badges.ts");
  const actions = read("apps/web/app/(protected)/notifications/actions.ts");
  const foreground = read("apps/web/app/_hooks/use-foreground-notifications.ts");

  assert.match(feed, /table: "notification_reads"/);
  assert.match(badges, /table: "notification_reads"/);
  assert.match(
    actions,
    /getNotificationBadgeSummary[\s\S]*resolveNotificationActionUrl\(claims,/,
  );
  assert.match(foreground, /shouldShowInAppToast/);
  assert.match(foreground, /branch_management/);
  assert.doesNotMatch(
    foreground,
    /surface === "owner";\s*$/m,
  );
});

test("dead kinds are retired from copy and shell maps", () => {
  const messages = read("apps/web/lib/messages/notifications.ts");
  const shell = read("apps/web/app/lib/shell-primitives.ts");
  assert.doesNotMatch(messages, /pos\.payment_stock_failed/);
  assert.doesNotMatch(messages, /workflow\.stocktake_submitted/);
  assert.doesNotMatch(shell, /workflow\.stocktake_submitted/);
  assert.match(shell, /inventory\.waste_pending_approval/);
  assert.match(shell, /inventory\.stock_request_rejected/);
  assert.match(
    shell,
    /inventory\.valuation_reconciliation_failed": "\/finance\/food-cost"/,
  );
  assert.doesNotMatch(shell, /\/finance\/cost-close/);
});

test("branch inventory notification routing migration is present", () => {
  const routing = read(
    "supabase/migrations/20260810011047_inventory_notification_branch_routing.sql",
  );
  assertSqlMatch(routing, /\/br\/%s\/stock\?work=receive/);
  assertSqlMatch(routing, /\/br\/%s\/stock\/waste-approvals/);
  assertSqlMatch(routing, /\/finance\/food-cost\?year=/);
  assertSqlNotMatch(routing,
    /action_url[\s\S]{0,80}\/finance\/cost-close\?year=/,
  );
  assertSqlMatch(routing,
    /replace\(action_url, '\/finance\/cost-close\?', '\/finance\/food-cost\?'\)/,
  );
});

test("gold handoff kinds keep deep-link CTA copy and labels", () => {
  const messages = read("apps/web/lib/messages/notifications.ts");
  for (const kind of [
    "workflow.grn_pending",
    "inventory.stock_request_submitted",
    "workflow.transfer_in_transit",
    "work.task_assigned",
  ]) {
    assert.match(
      messages,
      new RegExp(`"${kind.replace(/\./g, "\\.")}":\\s*"`),
    );
    assert.match(
      messages,
      new RegExp(
        `ctaByKind:[\\s\\S]*"${kind.replace(/\./g, "\\.")}":\\s*"`,
      ),
    );
  }
  assert.match(messages, /viewDocumentHistory:\s*"Xem lịch sử chứng từ"/);
});

test("gold handoff producers bind entity_type entity_id and dedup keys", () => {
  const baseline = read("supabase/migrations/20260902162918_baseline.sql");
  assertSqlMatch(baseline,
    /trg_notify_grn_created[\s\S]*'workflow\.grn_pending'[\s\S]*NEW\.id[\s\S]*workflow\.grn_pending:%s/,
  );
  assertSqlMatch(baseline,
    /notify_stock_request_submitted[\s\S]*'inventory\.stock_request_submitted'[\s\S]*'stock_request'[\s\S]*inventory\.stock_request_submitted:%s/,
  );
  assertSqlMatch(migration,
    /'workflow\.transfer_in_transit'[\s\S]*'stock_transfer'[\s\S]*NEW\.id[\s\S]*workflow\.transfer_in_transit:%s/,
  );
});

test("ops tracking correlation migration normalizes GRN entity_type", () => {
  const correlation = read(
    "supabase/migrations/20260810120000_ops_tracking_entity_correlation.sql",
  );
  assertSqlMatch(correlation, /'goods_received_note'/);
  assertSqlMatch(correlation,
    /entity_type IN \('grn', 'goods_received_note'\)/,
  );
  assertSqlMatch(correlation,
    /SET entity_type = 'goods_received_note'[\s\S]*kind = 'workflow\.grn_pending'/,
  );
});

test("attention hygiene: control toast; visible POS KDS mute durable attention", () => {
  const foreground = read("apps/web/app/_hooks/use-foreground-notifications.ts");
  const shell = read("apps/web/app/components/control-surface-shell.tsx");
  const pwa = read("apps/web/app/components/pwa-runtime.tsx");
  const runtime = read(
    "apps/web/app/_components/notification-attention-runtime.tsx",
  );
  assert.match(foreground, /shouldShowInAppToast/);
  assert.match(foreground, /muteVisibleFloorAttention/);
  assert.match(foreground, /surface === "owner"/);
  assert.match(foreground, /surface === "branch_management"/);
  assert.match(foreground, /pos\|kds\|pickup/);
  assert.match(
    foreground,
    /Visible POS\/KDS\/pickup mute durable attention/,
  );
  assert.match(
    foreground,
    /muteVisibleFloorAttention &&\s*document\.visibilityState === "visible"/,
  );
  assert.match(
    foreground,
    /showInAppToast && document\.visibilityState === "visible"/,
  );
  assert.match(foreground, /registration\.showNotification/);
  assert.match(runtime, /useForegroundNotifications\(\)/);
  assert.match(shell, /<NotificationAttentionRuntime/);
  assert.doesNotMatch(pwa, /useForegroundNotifications/);
});

test("feed remediation stops order spam, dedups PO, skips outbox, and routes follow-up", () => {
  const remediation = read(
    "supabase/migrations/20260820003251_notification_feed_remediation.sql",
  );
  const sqlTest = read("supabase/tests/notification_feed_remediation_test.sql");
  const mePage = read("apps/web/app/(protected)/me/page.tsx");
  const ordersClient = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/orders/operator-orders-client.tsx",
  );
  const posLayout = read(
    "apps/web/app/(protected)/br/[branchId]/pos/layout.tsx",
  );
  const kdsLayout = read(
    "apps/web/app/(protected)/br/[branchId]/kds/layout.tsx",
  );
  const queue = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/_components/home/branch-queue-section.tsx",
  );

  assertSqlMatch(remediation, /DROP TRIGGER IF EXISTS notify_order_new_after_insert/);
  assertSqlNotMatch(remediation,
    /CREATE TRIGGER notify_order_new_after_insert/,
  );
  assertSqlMatch(remediation, /kind = 'pos\.order_new'/);
  assertSqlMatch(remediation, /v_dedup_key := format\('%s:%s', v_kind, NEW\.id\)/);
  assertSqlMatch(remediation, /'workflow\.po_sent'/);
  assertSqlMatch(remediation, /'workflow\.po_approved'/);
  assertSqlMatch(remediation, /ON CONFLICT \(tenant_id, dedup_key\)/);
  assertSqlMatch(remediation, /expires_at = NULL/);
  assertSqlNotMatch(remediation,
    /DO UPDATE SET[\s\S]*created_at = now\(\)/,
  );
  assertSqlMatch(remediation, /DROP TRIGGER IF EXISTS trg_supplier_returns_outbox/);
  assertSqlMatch(remediation, /SET status = 'skipped'/);
  assertSqlMatch(remediation, /'\/me\/schedule\/leave'/);
  assertSqlMatch(remediation, /'\/me\/clock'/);
  assertSqlMatch(remediation, /\/br\/%s\/orders\?voidRequest=%s/);
  assertSqlNotMatch(remediation, /\/br\/%s\/pos\?voidRequest=%s/);
  assert.match(sqlTest, /pos\.order_new trigger must stay dropped/);
  assert.match(mePage, /href: "\/notifications"/);
  assert.match(ordersClient, /<VoidRequestQueue branchId=\{branchId\} \/>/);
  assert.doesNotMatch(posLayout, /NotificationBell/);
  assert.doesNotMatch(kdsLayout, /NotificationBell/);
  assert.match(queue, /row\.key === "void-approvals"/);
  assert.match(queue, /row\.key === "out-of-stock"/);
});
