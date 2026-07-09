"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRealtimeChannel } from "@/_hooks/use-realtime-channel";
import {
  getUnreadCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationItem,
} from "@/(protected)/notifications/actions";
import { messages } from "@lib/messages";

interface UseNotificationsArgs {
  tenantId: number;
  /**
   * JWT `branch_id` claim for the current user. When non-null (branch-scoped
   * staff), the realtime INSERT callback skips the refetch if the incoming
   * notification targets a different branch.
   *
   * Why not a server-side filter `target_branch_id=eq.<id>`? Because
   * tenant-wide notifications use `target_branch_id IS NULL`, and Supabase
   * Realtime `eq` filters exclude NULL rows — branch users would silently
   * miss those broadcasts. The subscription therefore stays broad
   * (tenant_id only); branch scoping is applied client-side on the payload
   * so correctness is preserved while unnecessary refetches are reduced.
   *
   * Owner/all-branch users pass `null` → every INSERT triggers a refetch
   * (unchanged behaviour).
   */
  branchId?: number | null;
  initialItems?: NotificationItem[];
  initialUnread?: number;
}

interface UseNotificationsResult {
  items: NotificationItem[];
  unreadCount: number;
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  unreadOnly: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  loadMore: () => Promise<void>;
  setUnreadOnly: (next: boolean) => void;
  markRead: (id: number) => Promise<void>;
  markAll: () => Promise<void>;
}

const PAGE_SIZE = 20;

/**
 * Subscribes to new INSERTs on the `notifications` table filtered by tenant.
 * RLS further filters what the caller can actually SELECT; we do a refetch on
 * each event so joined read-state stays consistent.
 */
export function useNotifications({
  tenantId,
  branchId,
  initialItems = [],
  initialUnread = 0,
}: UseNotificationsArgs): UseNotificationsResult {
  const [items, setItems] = useState<NotificationItem[]>(initialItems);
  const [unreadCount, setUnreadCount] = useState<number>(initialUnread);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [unreadOnly, setUnreadOnlyState] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inflightRef = useRef(false);
  const unreadOnlyRef = useRef(unreadOnly);
  const refreshRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const initialSubscribeSeenRef = useRef(false);
  // Stable ref so the channel callback always sees the latest branchId
  // without needing to be listed in the dep array (would tear down + rebuild
  // the subscription on every render where branchId changes identity).
  const branchIdRef = useRef(branchId);

  const refresh = useCallback(async () => {
    if (inflightRef.current) return;
    inflightRef.current = true;
    setLoading(true);
    try {
      const [list, count] = await Promise.all([
        listNotifications({ limit: PAGE_SIZE, unreadOnly: unreadOnlyRef.current }),
        getUnreadCount(),
      ]);
      if (list.success && list.data) {
        setItems(list.data.items);
        setHasMore(list.data.hasMore);
        setError(null);
      } else if (!list.success) {
        setError(list.error ?? messages.notifications.loadFailed);
      }
      if (count.success && count.data) {
        setUnreadCount(count.data.count);
      }
    } finally {
      inflightRef.current = false;
      setLoading(false);
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (inflightRef.current) return;
    const cursor = items.at(-1)?.created_at;
    if (!cursor) return;
    inflightRef.current = true;
    setLoadingMore(true);
    try {
      const list = await listNotifications({
        limit: PAGE_SIZE,
        before: cursor,
        unreadOnly: unreadOnlyRef.current,
      });
      if (list.success && list.data) {
        setItems((prev) => {
          const seen = new Set(prev.map((n) => n.id));
          const next = list.data!.items.filter((n) => !seen.has(n.id));
          return [...prev, ...next];
        });
        setHasMore(list.data.hasMore);
        setError(null);
      } else if (!list.success) {
        setError(list.error ?? messages.notifications.loadFailed);
      }
    } finally {
      inflightRef.current = false;
      setLoadingMore(false);
    }
  }, [items]);

  const setUnreadOnly = useCallback((next: boolean) => {
    unreadOnlyRef.current = next;
    setUnreadOnlyState(next);
    void refreshRef.current();
  }, []);

  const markRead = useCallback(
    async (id: number) => {
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
    },
    [refresh],
  );

  const markAll = useCallback(async () => {
    const r = await markAllNotificationsRead();
    if (r.success) {
      const now = new Date().toISOString();
      setItems((prev) =>
        prev.map((n) => (n.read_at ? n : { ...n, read_at: now })),
      );
      setUnreadCount(0);
      // In the unread-only view the now-read rows would otherwise linger;
      // refetch so the filtered list reflects the cleared state.
      if (unreadOnlyRef.current) void refreshRef.current();
    }
  }, []);

  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    branchIdRef.current = branchId;
  }, [branchId]);

  useEffect(() => {
    void refreshRef.current();
  }, []);

  useRealtimeChannel(
    (supabase) =>
      supabase
        .channel(`notifications-${String(tenantId)}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "notifications",
            filter: `tenant_id=eq.${String(tenantId)}`,
          },
          (payload: { new: { target_branch_id?: number | null } }) => {
            const scopedBranchId = branchIdRef.current;
            // Branch-scoped users: skip refetch when the notification targets
            // a different branch. target_branch_id=null means tenant-wide and
            // must always pass through (cannot use server-side eq filter for
            // this — it would exclude NULL rows and silently drop broadcasts).
            if (
              scopedBranchId != null &&
              payload.new.target_branch_id != null &&
              payload.new.target_branch_id !== scopedBranchId
            ) {
              return;
            }
            void refreshRef.current();
          },
        )
        .subscribe((status) => {
          if (status !== "SUBSCRIBED") return;
          // Skip the FIRST SUBSCRIBED — list/unread are seeded from RSC
          // props. Every SUBSCRIBED after that is a reconnect: refetch to
          // catch any INSERTs that fired during the disconnect window.
          if (!initialSubscribeSeenRef.current) {
            initialSubscribeSeenRef.current = true;
            return;
          }
          void refreshRef.current();
        }),
    [tenantId],
  );

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") void refreshRef.current();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  return {
    items,
    unreadCount,
    loading,
    loadingMore,
    hasMore,
    unreadOnly,
    error,
    refresh,
    loadMore,
    setUnreadOnly,
    markRead,
    markAll,
  };
}
