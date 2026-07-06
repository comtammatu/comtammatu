"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { isRunnerPublicDisplayPath, extractClaimsFromAccessToken } from "@comtammatu/shared/auth";
import { useRealtimeChannel } from "@/_hooks/use-realtime-channel";
import { listNotifications } from "@/(protected)/notifications/actions";
import { areNotificationPopupsEnabled } from "@lib/notifications/popup-preference";

const SCAN_LIMIT = 10;
const MAX_POPUPS = 3;

async function showPopupsForNewNotifications(
  highWaterRef: { current: number | null },
  inFlightRef: { current: boolean },
): Promise<void> {
  if (typeof window === "undefined") return;
  if (!("Notification" in window) || !("serviceWorker" in navigator)) return;
  if (Notification.permission !== "granted") return;
  if (!areNotificationPopupsEnabled()) return;
  // Not seeded yet — skip until the high-water mark is known so we never
  // replay the backlog as a burst of popups.
  if (highWaterRef.current === null) return;
  // Coalesce overlapping triggers: a single fetch already captures every
  // recent row, so a second concurrent run would only re-pop the same items
  // and double the work. Also serializes the read-modify-write of highWater.
  if (inFlightRef.current) return;

  inFlightRef.current = true;
  try {
    const result = await listNotifications({ limit: SCAN_LIMIT });
    if (!result.success || !result.data) return;

    const seen = highWaterRef.current;
    const fresh = result.data.items
      .filter((item) => item.id > seen && !item.read_at)
      .sort((a, b) => a.id - b.id);
    if (fresh.length === 0) return;

    highWaterRef.current = Math.max(seen, ...fresh.map((item) => item.id));

    // Cap simultaneous popups — a reconnect after offline can surface a
    // backlog at once. The in-app bell badge carries the full count.
    const registration = await navigator.serviceWorker.ready;
    for (const item of fresh.slice(-MAX_POPUPS)) {
      await registration.showNotification(item.title, {
        body: item.body ?? undefined,
        icon: "/icons/icon-192.png",
        badge: "/icons/favicon-32x32.png",
        tag: `notification:${String(item.id)}`,
        data: { url: item.action_url ?? "/notifications" },
      });
    }
  } finally {
    inFlightRef.current = false;
  }
}

/**
 * Foreground OS notification popups while the PWA is open — the client-side
 * replacement for server Web Push. A Realtime INSERT on `notifications`
 * triggers a refetch (RLS scopes the rows this user may see) and fires a
 * popup for each genuinely-new unread item via the registered service worker.
 * Gated by browser permission + the device mute preference. The SW's
 * `notificationclick` handler routes taps to the notification's action_url.
 */
export function useForegroundNotifications(): void {
  const highWaterRef = useRef<number | null>(null);
  const inFlightRef = useRef(false);
  const pathname = usePathname();
  const disabled = isRunnerPublicDisplayPath(pathname ?? "");

  // Seed the high-water mark from the newest visible notification so a fresh
  // mount does not popup notifications that arrived before the app opened.
  useEffect(() => {
    if (disabled) {
      highWaterRef.current = 0;
      return;
    }
    void listNotifications({ limit: 1 }).then((result) => {
      highWaterRef.current =
        result.success && result.data ? (result.data.items[0]?.id ?? 0) : 0;
    });
  }, [disabled]);

  const initialSubscribeSeenRef = useRef(false);

  useRealtimeChannel(
    (supabase, token) => {
      if (disabled) return null;

      let tenantId: number | null = null;
      let branchId: number | null = null;
      if (token) {
        const claims = extractClaimsFromAccessToken(token);
        if (claims) {
          tenantId = claims.tenant_id;
          branchId = claims.branch_id;
        }
      }
      if (tenantId === null) return null;

      return supabase
        .channel(`notification-popups-${String(tenantId)}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "notifications",
            filter: `tenant_id=eq.${String(tenantId)}`,
          },
          (payload: { new: { target_branch_id?: number | null } }) => {
            // Client-side branch scoping
            if (
              branchId !== null &&
              payload.new.target_branch_id != null &&
              payload.new.target_branch_id !== branchId
            ) {
              return;
            }
            void showPopupsForNewNotifications(highWaterRef, inFlightRef);
          },
        )
        .subscribe((status) => {
          if (status !== "SUBSCRIBED") return;
          if (!initialSubscribeSeenRef.current) {
            initialSubscribeSeenRef.current = true;
            return;
          }
          void showPopupsForNewNotifications(highWaterRef, inFlightRef);
        });
    },
    [disabled],
  );

  // Re-fetch when tab returns to foreground
  useEffect(() => {
    if (disabled) return;
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void showPopupsForNewNotifications(highWaterRef, inFlightRef);
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [disabled]);
}
