"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@comtammatu/database/supabase/client";
import {
  getUnreadCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationItem,
} from "@/_actions/notifications";

interface UseNotificationsArgs {
  tenantId: number;
  initialItems?: NotificationItem[];
  initialUnread?: number;
}

interface UseNotificationsResult {
  items: NotificationItem[];
  unreadCount: number;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  markRead: (id: number) => Promise<void>;
  markAll: () => Promise<void>;
}

/**
 * Subscribes to new INSERTs on the `notifications` table filtered by tenant.
 * RLS further filters what the caller can actually SELECT; we do a refetch on
 * each event so joined read-state stays consistent.
 */
export function useNotifications({
  tenantId,
  initialItems = [],
  initialUnread = 0,
}: UseNotificationsArgs): UseNotificationsResult {
  const [items, setItems] = useState<NotificationItem[]>(initialItems);
  const [unreadCount, setUnreadCount] = useState<number>(initialUnread);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inflightRef = useRef(false);

  const refresh = useCallback(async () => {
    if (inflightRef.current) return;
    inflightRef.current = true;
    setLoading(true);
    try {
      const [list, count] = await Promise.all([
        listNotifications({ limit: 20, unreadOnly: false }),
        getUnreadCount(),
      ]);
      if (list.success && list.data) {
        setItems(list.data.items);
        setError(null);
      } else if (!list.success) {
        setError(list.error ?? "Không thể tải thông báo");
      }
      if (count.success && count.data) {
        setUnreadCount(count.data.count);
      }
    } finally {
      inflightRef.current = false;
      setLoading(false);
    }
  }, []);

  const markRead = useCallback(async (id: number) => {
    setItems((prev) =>
      prev.map((n) =>
        n.id === id && !n.read_at
          ? { ...n, read_at: new Date().toISOString() }
          : n,
      ),
    );
    setUnreadCount((c) => Math.max(0, c - 1));
    const r = await markNotificationRead({ id });
    if (!r.success) {
      void refresh();
    }
  }, [refresh]);

  const markAll = useCallback(async () => {
    const r = await markAllNotificationsRead();
    if (r.success) {
      const now = new Date().toISOString();
      setItems((prev) =>
        prev.map((n) => (n.read_at ? n : { ...n, read_at: now })),
      );
      setUnreadCount(0);
    }
  }, []);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`notifications-${tenantId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `tenant_id=eq.${String(tenantId)}`,
        },
        () => {
          void refresh();
        },
      )
      .subscribe();

    const handleVisibility = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      void supabase.removeChannel(channel);
    };
  }, [tenantId, refresh]);

  return { items, unreadCount, loading, error, refresh, markRead, markAll };
}
