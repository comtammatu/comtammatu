"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "@comtammatu/ui/components/sonner";
import { useRealtimeChannel } from "@/_hooks/use-realtime-channel";
import {
  getUnreadCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationItem,
} from "@/(protected)/notifications/actions";
import { emitNotificationsChanged } from "@lib/notifications/changed-event";
import { messages, m } from "@lib/messages";

export type NotificationFeedMode = "active" | "all";

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
  feedMode: NotificationFeedMode;
  error: string | null;
  refresh: () => Promise<void>;
  loadMore: () => Promise<void>;
  setFeedMode: (next: NotificationFeedMode) => void;
  markRead: (id: number, options?: { quiet?: boolean }) => Promise<void>;
  markAll: () => Promise<void>;
}

const PAGE_SIZE = 20;

function listArgsForMode(mode: NotificationFeedMode) {
  return mode === "active"
    ? { unreadOnly: true, includeExpired: false }
    : { unreadOnly: false, includeExpired: true };
}

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
  const [feedMode, setFeedModeState] = useState<NotificationFeedMode>("active");
  const [error, setError] = useState<string | null>(null);
  const inflightRef = useRef(false);
  const feedModeRef = useRef(feedMode);
  const refreshRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const initialSubscribeSeenRef = useRef(false);
  const branchIdRef = useRef(branchId);

  const refresh = useCallback(async () => {
    if (inflightRef.current) return;
    inflightRef.current = true;
    setLoading(true);
    try {
      const modeArgs = listArgsForMode(feedModeRef.current);
      const [list, count] = await Promise.all([
        listNotifications({ limit: PAGE_SIZE, ...modeArgs }),
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
      const modeArgs = listArgsForMode(feedModeRef.current);
      const list = await listNotifications({
        limit: PAGE_SIZE,
        before: cursor,
        ...modeArgs,
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

  const setFeedMode = useCallback((next: NotificationFeedMode) => {
    feedModeRef.current = next;
    setFeedModeState(next);
    void refreshRef.current();
  }, []);

  const markRead = useCallback(
    async (id: number, options?: { quiet?: boolean }) => {
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
        return;
      }
      emitNotificationsChanged();
      if (!options?.quiet) {
        toast.success(messages.notifications.markReadSuccess);
      }
      if (feedModeRef.current === "active") void refreshRef.current();
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
      emitNotificationsChanged();
      toast.success(
        m(messages.notifications.markAllReadSuccess, {
          count: r.data?.count ?? 0,
        }),
      );
      if (feedModeRef.current === "active") void refreshRef.current();
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
            event: "*",
            schema: "public",
            table: "notifications",
            filter: `tenant_id=eq.${String(tenantId)}`,
          },
          (payload: {
            new?: { target_branch_id?: number | null };
            old?: { target_branch_id?: number | null };
          }) => {
            const scopedBranchId = branchIdRef.current;
            const row = payload.new ?? payload.old;
            if (
              scopedBranchId != null &&
              row?.target_branch_id != null &&
              row.target_branch_id !== scopedBranchId
            ) {
              return;
            }
            void refreshRef.current();
          },
        )
        .subscribe((status) => {
          if (status !== "SUBSCRIBED") return;
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
    feedMode,
    error,
    refresh,
    loadMore,
    setFeedMode,
    markRead,
    markAll,
  };
}
