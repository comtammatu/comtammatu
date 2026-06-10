/**
 * Web Push dispatcher for durable in-app notifications.
 *
 * Auth: Bearer CRON_SECRET.
 * Schedule: frequent, idempotent via notification_push_deliveries.
 */
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createServiceClient } from "@comtammatu/database/supabase/service";
import { getCronSecret } from "@comtammatu/shared/runtime";
import {
  buildNotificationPushPayload,
  getWebPushPublicConfig,
  sendWebPushNotification,
  type WebPushNotificationSource,
  type WebPushSubscriptionRecord,
} from "@lib/notifications/web-push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type NotificationRow = WebPushNotificationSource & {
  tenant_id: number;
  target_branch_id: number | null;
  target_roles: string[];
  expires_at: string | null;
};

type SubscriptionRow = WebPushSubscriptionRecord & {
  tenant_id: number;
  user_id: string;
  failure_count: number;
};

type ProfileRow = {
  id: string;
  tenant_id: number;
  branch_id: number | null;
  is_active: boolean | null;
  position_id: number;
};

type PositionRow = {
  id: number;
  tenant_id: number;
  code: string;
};

type DeliveryRow = {
  notification_id: number;
  subscription_id: number;
  status: string;
  attempt_count: number;
};

const TENANT_WIDE_ROLES = new Set(["owner", "super_manager"]);

function timingSafeEquals(a: string, b: string): boolean {
  const MAX = 256;
  const ba = Buffer.alloc(MAX);
  const bb = Buffer.alloc(MAX);
  ba.write(a.slice(0, MAX), "utf8");
  bb.write(b.slice(0, MAX), "utf8");
  const eq = timingSafeEqual(ba, bb);
  return eq && a.length === b.length;
}

function unauthorized() {
  return NextResponse.json(
    { ok: false, error: "unauthorized" },
    { status: 401 },
  );
}

function canReceiveNotification(
  notification: NotificationRow,
  subscription: SubscriptionRow,
  profile: ProfileRow | undefined,
  position: PositionRow | undefined,
): boolean {
  if (!profile || !position) return false;
  if (profile.is_active === false) return false;
  if (profile.tenant_id !== notification.tenant_id) return false;
  if (subscription.tenant_id !== notification.tenant_id) return false;
  if (position.tenant_id !== notification.tenant_id) return false;
  if (!notification.target_roles.includes(position.code)) return false;
  if (notification.target_branch_id === null) return true;
  if (profile.branch_id === notification.target_branch_id) return true;
  return TENANT_WIDE_ROLES.has(position.code);
}

function deliveryKey(notificationId: number, subscriptionId: number): string {
  return `${notificationId}:${subscriptionId}`;
}

export async function POST(request: Request) {
  const expected = getCronSecret();
  const authHeader = request.headers.get("authorization");
  const provided = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : null;
  if (!provided || !timingSafeEquals(provided, expected)) {
    return unauthorized();
  }

  const pushConfig = getWebPushPublicConfig();
  if (!pushConfig.configured) {
    return NextResponse.json({ ok: true, skipped: "web_push_not_configured" });
  }

  const supabase = createServiceClient();
  const now = new Date();
  const nowIso = now.toISOString();
  const lowerBound = new Date(
    now.getTime() - 24 * 60 * 60 * 1000,
  ).toISOString();

  const { data: notifications, error: notificationsError } = await supabase
    .from("notifications")
    .select(
      "id, tenant_id, target_branch_id, target_roles, kind, severity, title, body, action_url, created_at, expires_at",
    )
    .gte("created_at", lowerBound)
    .order("created_at", { ascending: true })
    .limit(200);

  if (notificationsError) {
    console.error(
      "[cron/notifications-push] notification fetch failed code=%s",
      notificationsError.code,
    );
    return NextResponse.json(
      { ok: false, error: "notification_fetch_failed" },
      { status: 500 },
    );
  }

  const activeNotifications = (
    (notifications ?? []) as NotificationRow[]
  ).filter(
    (notification) =>
      !notification.expires_at ||
      new Date(notification.expires_at).getTime() > now.getTime(),
  );

  if (activeNotifications.length === 0) {
    return NextResponse.json({ ok: true, processed: 0, sent: 0, failed: 0 });
  }

  const tenantIds = [
    ...new Set(activeNotifications.map((row) => row.tenant_id)),
  ];
  const { data: subscriptions, error: subscriptionsError } = await supabase
    .from("notification_push_subscriptions")
    .select("id, tenant_id, user_id, endpoint, p256dh, auth, failure_count")
    .in("tenant_id", tenantIds)
    .is("disabled_at", null);

  if (subscriptionsError) {
    console.error(
      "[cron/notifications-push] subscription fetch failed code=%s",
      subscriptionsError.code,
    );
    return NextResponse.json(
      { ok: false, error: "subscription_fetch_failed" },
      { status: 500 },
    );
  }

  if (!subscriptions || subscriptions.length === 0) {
    return NextResponse.json({
      ok: true,
      processed: activeNotifications.length,
      sent: 0,
      failed: 0,
      skipped: "no_subscriptions",
    });
  }

  const userIds = [...new Set(subscriptions.map((row) => row.user_id))];
  const [profilesResult, positionsResult, deliveriesResult] = await Promise.all(
    [
      supabase
        .from("profiles")
        .select("id, tenant_id, branch_id, is_active, position_id")
        .in("id", userIds),
      supabase
        .from("positions")
        .select("id, tenant_id, code")
        .in("tenant_id", tenantIds),
      supabase
        .from("notification_push_deliveries")
        .select("notification_id, subscription_id, status, attempt_count")
        .in(
          "notification_id",
          activeNotifications.map((row) => row.id),
        ),
    ],
  );

  if (profilesResult.error || positionsResult.error || deliveriesResult.error) {
    console.error("[cron/notifications-push] support fetch failed codes=%o", {
      profiles: profilesResult.error?.code,
      positions: positionsResult.error?.code,
      deliveries: deliveriesResult.error?.code,
    });
    return NextResponse.json(
      { ok: false, error: "notification_support_fetch_failed" },
      { status: 500 },
    );
  }

  const profileByUserId = new Map(
    ((profilesResult.data ?? []) as ProfileRow[]).map((profile) => [
      profile.id,
      profile,
    ]),
  );
  const positionById = new Map(
    ((positionsResult.data ?? []) as PositionRow[]).map((position) => [
      position.id,
      position,
    ]),
  );
  const deliveryByPair = new Map(
    ((deliveriesResult.data ?? []) as DeliveryRow[]).map((delivery) => [
      deliveryKey(delivery.notification_id, delivery.subscription_id),
      delivery,
    ]),
  );

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const notification of activeNotifications) {
    const payload = buildNotificationPushPayload(notification);
    for (const subscription of subscriptions as SubscriptionRow[]) {
      const profile = profileByUserId.get(subscription.user_id);
      const position = profile
        ? positionById.get(profile.position_id)
        : undefined;
      if (
        !canReceiveNotification(notification, subscription, profile, position)
      ) {
        skipped++;
        continue;
      }

      const key = deliveryKey(notification.id, subscription.id);
      const prior = deliveryByPair.get(key);
      if (prior?.status === "sent" || (prior?.attempt_count ?? 0) >= 3) {
        skipped++;
        continue;
      }

      const result = await sendWebPushNotification(subscription, payload);
      const attemptCount = (prior?.attempt_count ?? 0) + 1;
      if (result.success) {
        sent++;
        await Promise.all([
          supabase.from("notification_push_deliveries").upsert(
            {
              notification_id: notification.id,
              subscription_id: subscription.id,
              status: "sent",
              attempt_count: attemptCount,
              last_attempt_at: nowIso,
              sent_at: nowIso,
              error: null,
              updated_at: nowIso,
            },
            { onConflict: "notification_id,subscription_id" },
          ),
          supabase
            .from("notification_push_subscriptions")
            .update({
              last_sent_at: nowIso,
              failure_count: 0,
              last_error: null,
              updated_at: nowIso,
            })
            .eq("id", subscription.id),
        ]);
        continue;
      }

      failed++;
      await Promise.all([
        supabase.from("notification_push_deliveries").upsert(
          {
            notification_id: notification.id,
            subscription_id: subscription.id,
            status: result.expired || attemptCount >= 3 ? "failed" : "pending",
            attempt_count: attemptCount,
            last_attempt_at: nowIso,
            error: result.error,
            updated_at: nowIso,
          },
          { onConflict: "notification_id,subscription_id" },
        ),
        supabase
          .from("notification_push_subscriptions")
          .update({
            disabled_at: result.expired ? nowIso : null,
            failure_count: subscription.failure_count + 1,
            last_error: result.error,
            updated_at: nowIso,
          })
          .eq("id", subscription.id),
      ]);
    }
  }

  return NextResponse.json({
    ok: true,
    processed: activeNotifications.length,
    sent,
    failed,
    skipped,
  });
}

export const GET = POST;
