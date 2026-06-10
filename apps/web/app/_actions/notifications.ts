"use server";

import { z } from "zod";
import { STAFF_ROLES } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { getAuthContext, loadAuthState } from "@/_lib/auth";
import {
  buildNotificationPushPayload,
  getWebPushPublicConfig,
  sendWebPushNotification,
  type WebPushSubscriptionRecord,
} from "@lib/notifications/web-push";

export interface NotificationItem {
  id: number;
  tenant_id: number;
  target_branch_id: number | null;
  target_roles: string[];
  kind: string;
  severity: "info" | "warning" | "critical";
  title: string;
  body: string | null;
  entity_type: string | null;
  entity_id: number | null;
  action_url: string | null;
  meta: Record<string, unknown>;
  created_at: string;
  expires_at: string | null;
  read_at: string | null;
}

export interface ListNotificationsResult {
  items: NotificationItem[];
  hasMore: boolean;
}

export interface PushRegistrationState {
  configured: boolean;
  publicKey: string | null;
  activeSubscriptionCount: number;
}

const listSchema = z.object({
  limit: z.number().int().min(1).max(50).default(20),
  before: z.string().datetime().optional(),
  unreadOnly: z.boolean().default(false),
});

/**
 * List notifications visible to caller (RLS filters by role + branch).
 * Joins `notification_reads` so each row carries `read_at`.
 */
export async function listNotifications(
  input: z.input<typeof listSchema>,
): Promise<ActionResult<ListNotificationsResult>> {
  const parsed = listSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }
  const { limit, before, unreadOnly } = parsed.data;
  const { supabase, session } = await loadAuthState();
  const userId = session.user.id;

  let query = supabase
    .from("notifications")
    .select(
      `
      id, tenant_id, target_branch_id, target_roles,
      kind, severity, title, body,
      entity_type, entity_id, action_url, meta,
      created_at, expires_at,
      notification_reads!left(read_at, user_id)
    `,
    )
    .order("created_at", { ascending: false })
    .limit(limit + 1);

  if (before) query = query.lt("created_at", before);

  const { data, error } = await query;
  if (error) return { success: false, error: "Không thể tải thông báo" };

  const mapped: NotificationItem[] = (data ?? []).map((row) => {
    const readRow = Array.isArray(row.notification_reads)
      ? row.notification_reads.find(
          (r: { user_id: string; read_at: string }) => r.user_id === userId,
        )
      : null;
    return {
      id: row.id,
      tenant_id: row.tenant_id,
      target_branch_id: row.target_branch_id,
      target_roles: row.target_roles,
      kind: row.kind,
      severity: row.severity as NotificationItem["severity"],
      title: row.title,
      body: row.body,
      entity_type: row.entity_type,
      entity_id: row.entity_id,
      action_url: row.action_url,
      meta: (row.meta ?? {}) as Record<string, unknown>,
      created_at: row.created_at,
      expires_at: row.expires_at,
      read_at: readRow?.read_at ?? null,
    };
  });

  const filtered = unreadOnly ? mapped.filter((n) => !n.read_at) : mapped;
  const hasMore = filtered.length > limit;
  return {
    success: true,
    data: { items: filtered.slice(0, limit), hasMore },
  };
}

/**
 * Count of unread notifications visible to caller. Uses RPC for server-side fold.
 */
export async function getUnreadCount(): Promise<
  ActionResult<{ count: number }>
> {
  const { supabase } = await loadAuthState();
  const { data, error } = await supabase.rpc("count_unread_notifications");
  if (error) return { success: false, error: "Không thể đếm thông báo" };
  return { success: true, data: { count: Number(data ?? 0) } };
}

const markReadSchema = z.object({ id: z.number().int().positive() });

export async function markNotificationRead(
  input: z.input<typeof markReadSchema>,
): Promise<ActionResult> {
  const parsed = markReadSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Dữ liệu không hợp lệ" };
  }
  const { supabase, session } = await loadAuthState();
  const { error } = await supabase
    .from("notification_reads")
    .insert({ notification_id: parsed.data.id, user_id: session.user.id });
  // 23505 = unique_violation → already read, treat as success
  if (error && error.code !== "23505") {
    return { success: false, error: "Không thể đánh dấu đã đọc" };
  }
  return { success: true };
}

/** Mark every currently-visible unread notification as read for the caller. */
export async function markAllNotificationsRead(): Promise<
  ActionResult<{ count: number }>
> {
  const { supabase } = await loadAuthState();
  const { data, error } = await supabase.rpc("mark_all_notifications_read");
  if (error) {
    return { success: false, error: "Không thể đánh dấu tất cả" };
  }
  return { success: true, data: { count: Number(data ?? 0) } };
}

const pushSubscriptionSchema = z.object({
  endpoint: z.string().url().max(2048),
  expirationTime: z.number().nullable().optional(),
  keys: z.object({
    p256dh: z.string().min(1).max(512),
    auth: z.string().min(1).max(512),
  }),
  userAgent: z.string().max(500).nullable().optional(),
  deviceLabel: z.string().max(120).nullable().optional(),
});

const pushEndpointSchema = z.object({
  endpoint: z.string().url().max(2048),
});

export async function getPushRegistrationState(): Promise<
  ActionResult<PushRegistrationState>
> {
  const ctx = await getAuthContext(STAFF_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const publicConfig = getWebPushPublicConfig();
  const { data, error } = await ctx.supabase
    .from("notification_push_subscriptions")
    .select("id")
    .is("disabled_at", null);

  if (error) {
    return {
      success: false,
      error: "Không thể đọc trạng thái thông báo thiết bị",
    };
  }

  return {
    success: true,
    data: {
      ...publicConfig,
      activeSubscriptionCount: data?.length ?? 0,
    },
  };
}

export async function savePushSubscription(
  input: z.input<typeof pushSubscriptionSchema>,
): Promise<ActionResult> {
  const parsed = pushSubscriptionSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Dữ liệu thiết bị không hợp lệ" };
  }

  const ctx = await getAuthContext(STAFF_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { endpoint, keys, userAgent, deviceLabel } = parsed.data;
  const now = new Date().toISOString();
  const { error } = await ctx.supabase
    .from("notification_push_subscriptions")
    .upsert(
      {
        tenant_id: ctx.claims.tenant_id,
        user_id: ctx.user.id,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        user_agent: userAgent ?? null,
        device_label: deviceLabel ?? null,
        updated_at: now,
        last_seen_at: now,
        disabled_at: null,
        failure_count: 0,
        last_error: null,
      },
      { onConflict: "tenant_id,user_id,endpoint" },
    );

  if (error) {
    return { success: false, error: "Không thể bật thông báo thiết bị" };
  }

  return { success: true };
}

export async function removePushSubscription(
  input: z.input<typeof pushEndpointSchema>,
): Promise<ActionResult> {
  const parsed = pushEndpointSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Dữ liệu thiết bị không hợp lệ" };
  }

  const ctx = await getAuthContext(STAFF_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { error } = await ctx.supabase
    .from("notification_push_subscriptions")
    .delete()
    .eq("endpoint", parsed.data.endpoint);

  if (error) {
    return { success: false, error: "Không thể tắt thông báo thiết bị" };
  }

  return { success: true };
}

export async function sendTestPushNotification(): Promise<
  ActionResult<{ sent: number; failed: number }>
> {
  const ctx = await getAuthContext(STAFF_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const publicConfig = getWebPushPublicConfig();
  if (!publicConfig.configured) {
    return { success: false, error: "Chưa cấu hình Web Push" };
  }

  const { data, error } = await ctx.supabase
    .from("notification_push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .is("disabled_at", null);

  if (error) {
    return { success: false, error: "Không thể đọc thiết bị nhận thông báo" };
  }

  const subscriptions: WebPushSubscriptionRecord[] = (data ?? []).map(
    (row) => ({
      id: row.id,
      endpoint: row.endpoint,
      p256dh: row.p256dh,
      auth: row.auth,
    }),
  );

  if (subscriptions.length === 0) {
    return { success: false, error: "Thiết bị chưa bật thông báo" };
  }

  const now = new Date().toISOString();
  const payload = buildNotificationPushPayload({
    id: 0,
    kind: "system.test",
    severity: "info",
    title: "Thông báo thử",
    body: "Thiết bị đã nhận được thông báo từ Cơm Tấm Má Tư.",
    action_url: "/notifications",
    created_at: now,
  });

  let sent = 0;
  let failed = 0;
  await Promise.all(
    subscriptions.map(async (subscription) => {
      const result = await sendWebPushNotification(subscription, payload);
      if (result.success) {
        sent++;
        await ctx.supabase
          .from("notification_push_subscriptions")
          .update({
            last_sent_at: now,
            failure_count: 0,
            last_error: null,
            updated_at: now,
          })
          .eq("id", subscription.id);
        return;
      }

      failed++;
      await ctx.supabase
        .from("notification_push_subscriptions")
        .update({
          disabled_at: result.expired ? now : null,
          failure_count: 1,
          last_error: result.error,
          updated_at: now,
        })
        .eq("id", subscription.id);
    }),
  );

  if (sent === 0) {
    return { success: false, error: "Không gửi được thông báo thử" };
  }

  return { success: true, data: { sent, failed } };
}
