"use client";

import { useEffect, useRef } from "react";
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

  // Seed the high-water mark from the newest visible notification so a fresh
  // mount does not popup notifications that arrived before the app opened.
  useEffect(() => {
    void listNotifications({ limit: 1 }).then((result) => {
      highWaterRef.current =
        result.success && result.data ? (result.data.items[0]?.id ?? 0) : 0;
    });
  }, []);

  useRealtimeChannel(
    (supabase) =>
      supabase
        .channel("notification-popups")
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "notifications" },
          () => {
            void showPopupsForNewNotifications(highWaterRef, inFlightRef);
          },
        )
        .subscribe(),
    [],
  );
}
