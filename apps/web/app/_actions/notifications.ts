"use server";

import { z } from "zod";
import type { ActionResult } from "@comtammatu/shared/types";
import { loadAuthState } from "@/_lib/auth";

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
export async function getUnreadCount(): Promise<ActionResult<{ count: number }>> {
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
