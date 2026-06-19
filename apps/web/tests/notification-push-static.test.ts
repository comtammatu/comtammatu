import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

test("service worker handles Web Push display and notification click routing", () => {
  const source = read("../app/sw.ts");

  assert.match(source, /addEventListener\("push"/);
  assert.match(source, /registration\.showNotification/);
  assert.match(source, /addEventListener\("notificationclick"/);
  assert.match(source, /clients\.openWindow/);
});

test("development layout unregisters stale service workers", () => {
  const layout = read("../app/layout.tsx");
  const reset = read("../app/dev-service-worker-reset.tsx");

  assert.match(layout, /disable=\{process\.env\.NODE_ENV === "development"\}/);
  assert.match(layout, /<DevServiceWorkerReset \/>/);
  assert.match(reset, /getRegistrations/);
  assert.match(reset, /registration\.unregister/);
  assert.match(reset, /window\.caches\.delete/);
  assert.match(reset, /window\.location\.reload/);
});

test("notification actions expose push subscription lifecycle", () => {
  const source = read("../app/_actions/notifications.ts");

  assert.match(source, /getPushRegistrationState/);
  assert.match(source, /savePushSubscription/);
  assert.match(source, /removePushSubscription/);
  assert.match(source, /sendTestPushNotification/);
  assert.match(source, /notification_push_subscriptions/);
  assert.match(source, /pushSubscriptionSchema/);
});

test("push dispatcher cron is configured and idempotent", () => {
  const route = read("../app/api/cron/notifications-push/route.ts");
  const vercel = read("../vercel.json");
  const claimIndex = route.indexOf("claim_notification_push_delivery");
  const sendIndex = route.indexOf(
    "const result = await sendWebPushNotification(subscription, payload)",
  );

  assert.match(route, /notification_push_deliveries/);
  assert.match(route, /claim_notification_push_delivery/);
  assert.match(route, /sendWebPushNotification/);
  assert.match(route, /canReceiveNotification/);
  assert.match(route, /timingSafeEquals/);
  assert.ok(claimIndex >= 0, "route must claim a delivery before sending");
  assert.ok(sendIndex >= 0, "route must send web push from the cron loop");
  assert.ok(claimIndex < sendIndex, "claim must happen before send");
  assert.match(route, /if \(claimError\) \{[\s\S]*?continue;/);
  assert.match(route, /if \(claim\?\.status !== "claimed"\) \{[\s\S]*?continue;/);
  assert.doesNotMatch(route, /\.from\("notification_push_deliveries"\)\.upsert/);
  assert.match(vercel, /\/api\/cron\/notifications-push/);
});

test("push targeting matches access buckets, not raw position codes", () => {
  const route = read("../app/api/cron/notifications-push/route.ts");
  const targeting = read("../lib/notifications/push-targeting.ts");

  // target_roles carries access buckets (RLS compares auth_role());
  // matching raw position codes once dropped branch_manager pushes.
  assert.match(route, /@lib\/notifications\/push-targeting/);
  assert.doesNotMatch(route, /target_roles\.includes\(position\.code\)/);
  assert.match(targeting, /staffRoleFromPositionCode/);
  assert.match(targeting, /target_roles\.includes\(bucket\)/);
});

test("push subscription migration has RLS, grants, and delivery ledger", () => {
  const migration = read(
    "../../../supabase/migrations/20260610154520_notification_push_subscriptions.sql",
  );
  const hardeningMigration = read(
    "../../../supabase/migrations/20260619062853_security_rpc_cron_runner_hardening.sql",
  );

  assert.match(
    migration,
    /CREATE TABLE IF NOT EXISTS public\.notification_push_subscriptions/,
  );
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /notification_push_subscriptions_insert_own/);
  assert.match(migration, /notification_push_deliveries/);
  assert.match(migration, /GRANT SELECT, INSERT, UPDATE, DELETE/);
  assert.match(hardeningMigration, /claim_notification_push_delivery/);
  assert.match(
    hardeningMigration,
    /status = ANY \(ARRAY\['pending', 'processing', 'sent', 'failed', 'skipped'\]\)/,
  );
  assert.match(hardeningMigration, /status', 'claimed'/);
});

test("retired customer surfaces are absent from active app/auth copy", () => {
  const retiredCustomerDatabaseWord = new RegExp(`\\b${"cr"}${"m"}\\b`, "i");
  const retiredCustomerResponseLabel = new RegExp(`${"Phản ánh"} ${"khách"}`);
  const retiredCustomerResponsePath = new RegExp(
    `/${"admin"}/${"feed"}${"back"}`,
  );
  const retiredCustomerDatabasePath = new RegExp(`/${"admin"}/${"cr"}${"m"}`);
  const activeSources = [
    "../../../packages/shared/src/auth/module-acl.ts",
    "../../../packages/shared/src/auth/route-map.ts",
    "../../../packages/shared/src/auth/route-resolution.ts",
    "../../../packages/shared/src/labels/vi.ts",
    "../../../packages/shared/src/messages/domain.ts",
    "../lib/messages/employee.ts",
    "../../../README.md",
  ].map(read);

  for (const source of activeSources) {
    assert.doesNotMatch(source, retiredCustomerDatabaseWord);
    assert.doesNotMatch(source, retiredCustomerResponseLabel);
    assert.doesNotMatch(source, retiredCustomerResponsePath);
    assert.doesNotMatch(source, retiredCustomerDatabasePath);
  }
});
