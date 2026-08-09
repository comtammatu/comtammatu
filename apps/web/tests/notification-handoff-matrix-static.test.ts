import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

const migration = read(
  "supabase/migrations/20260809160855_notification_handoff_matrix_harden.sql",
);

test("YCM producer fires on pending_allocation matching live submit path", () => {
  assert.match(migration, /notify_purchase_request_submitted/);
  assert.match(migration, /NEW\.status <> 'pending_allocation'/);
  assert.match(migration, /ARRAY\['owner', 'accountant'\]/);
  assert.doesNotMatch(
    migration,
    /notify_purchase_request_submitted[\s\S]*NEW\.status <> 'submitted'/,
  );
});

test("notification_reads is published for realtime mark-read freshness", () => {
  assert.match(migration, /notification_reads REPLICA IDENTITY FULL/);
  assert.match(
    migration,
    /ALTER PUBLICATION supabase_realtime ADD TABLE public\.notification_reads/,
  );
});

test("inventory finance orders hr handoff producers are present", () => {
  assert.match(migration, /inventory\.stock_request_rejected/);
  assert.match(migration, /inventory\.waste_pending_approval/);
  assert.match(migration, /expire_po_pending_approval_notification/);
  assert.match(migration, /workflow\.transfer_in_transit:%s/);
  assert.match(migration, /'inventory\.valuation_variance'/);
  assert.match(migration, /ARRAY\['owner', 'accountant'\]/);
  assert.match(migration, /hr\.leave_approved/);
  assert.match(migration, /hr\.leave_rejected/);
  assert.match(migration, /hr\.checkout_approved/);
  assert.match(migration, /hr\.checkout_rejected/);
  assert.match(migration, /pos\.void_resolved/);
  assert.match(migration, /expire.*pos\.void_requested|kind = 'pos\.void_requested'/);
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
  assert.match(routing, /\/br\/%s\/stock\?work=receive/);
  assert.match(routing, /\/br\/%s\/stock\/waste-approvals/);
  assert.match(routing, /\/finance\/food-cost\?year=/);
  assert.doesNotMatch(
    routing,
    /action_url[\s\S]{0,80}\/finance\/cost-close\?year=/,
  );
  assert.match(
    routing,
    /replace\(action_url, '\/finance\/cost-close\?', '\/finance\/food-cost\?'\)/,
  );
});
