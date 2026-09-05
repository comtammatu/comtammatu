"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  isPickupPublicDisplayPath,
  resolveRouteFamilyContract,
} from "@comtammatu/shared/auth";
import { toast } from "@comtammatu/ui/components/sonner";
import { useNotificationEvents } from "@/_hooks/use-notification-events";
import { makeRealtimeCoalescer } from "@/_utils/realtime-scheduler";
import { dedupeInflight } from "@/_utils/inflight-dedupe";
import {
  listNotifications,
  markNotificationRead,
  type NotificationItem,
} from "@/(protected)/notifications/actions";
import { emitNotificationsChanged } from "@lib/notifications/changed-event";
import { areNotificationPopupsEnabled } from "@lib/notifications/popup-preference";
import { messages } from "@lib/messages";

const SCAN_LIMIT = 10;
const MAX_POPUPS = 3;

const FLOOR_OPS_PATH =
  /^\/br\/\d+\/(pos|kds|pickup)(?:\/|$)/;

/** Sonner on control surfaces; POS/KDS/pickup never use arrival Sonner. */
function shouldShowInAppToast(pathname: string): boolean {
  const family = resolveRouteFamilyContract(pathname);
  if (!family) return false;
  if (family.surface === "owner" || family.surface === "branch_management") {
    return true;
  }
  if (family.surface === "branch_operation") {
    return !FLOOR_OPS_PATH.test(pathname);
  }
  return false;
}

/** Floor boards: swallow durable attention while the tab is visible. */
function isFloorOpsPath(pathname: string): boolean {
  return FLOOR_OPS_PATH.test(pathname);
}

function openCtaLabel(kind: string): string {
  return (
    messages.notifications.ctaByKind[kind] ?? messages.notifications.openAction
  );
}

async function showPopupsForNewNotifications(
  highWaterRef: { current: number | null },
  inFlightRef: { current: boolean },
  showInAppToast: boolean,
  muteVisibleFloorAttention: boolean,
  navigate: (url: string) => void,
): Promise<void> {
  if (typeof window === "undefined") return;
  if (highWaterRef.current === null) return;
  if (inFlightRef.current) return;

  inFlightRef.current = true;
  try {
    const result = await dedupeInflight(
      `listNotifications:${String(SCAN_LIMIT)}:popup`,
      () => listNotifications({ limit: SCAN_LIMIT }),
    );
    if (!result.success || !result.data) return;

    const seen = highWaterRef.current;
    const fresh = result.data.items
      .filter((item) => item.id > seen && !item.read_at)
      .sort((a, b) => a.id - b.id);
    if (fresh.length === 0) return;

    highWaterRef.current = Math.max(seen, ...fresh.map((item) => item.id));

    // POS/KDS/pickup: live board owns attention while visible. Advance
    // high-water so durable manager feed does not OS-popup mid-service.
    if (
      muteVisibleFloorAttention &&
      document.visibilityState === "visible"
    ) {
      return;
    }

    if (showInAppToast && document.visibilityState === "visible") {
      for (const item of fresh.slice(-MAX_POPUPS)) {
        showArrivalToast(item, navigate);
      }
      return;
    }

    if (!("Notification" in window) || !("serviceWorker" in navigator)) return;
    if (Notification.permission !== "granted") return;
    if (!areNotificationPopupsEnabled()) return;

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

function showArrivalToast(
  item: NotificationItem,
  navigate: (url: string) => void,
): void {
  // Attention Hygiene: Routine info feeds without actionable work do not pop up;
  // they update the badge and feed silently. Only critical, warning, or actionable items pop up.
  if (item.severity === "info" && !item.action_url) {
    return;
  }
  const options: {
    description?: string;
    id: string;
    action?: { label: string; onClick: () => void };
  } = {
    description: item.body ?? undefined,
    id: `notification:${String(item.id)}`,
  };
  if (item.action_url) {
    options.action = {
      label: openCtaLabel(item.kind),
      onClick: () => {
        void markNotificationRead({ id: item.id }).then((result) => {
          if (result.success) emitNotificationsChanged();
        });
        navigate(item.action_url!);
      },
    };
  }
  if (item.severity === "critical") toast.error(item.title, options);
  else if (item.severity === "warning") toast.warning(item.title, options);
  else toast.info(item.title, options);
}

/**
 * Foreground notification attention while the PWA is open. A Realtime INSERT
 * triggers an RLS-scoped refetch. Visible control-surface routes use Sonner
 * with an optional Open CTA. Visible POS/KDS/pickup mute durable attention
 * (board + operational audio own the floor); backgrounded floor tabs keep the
 * permission-gated service-worker popup.
 */
export function useForegroundNotifications(): void {
  const highWaterRef = useRef<number | null>(null);
  const inFlightRef = useRef(false);
  const pathname = usePathname();
  const router = useRouter();
  const navigateRef = useRef((url: string) => {
    router.push(url);
  });
  navigateRef.current = (url: string) => {
    router.push(url);
  };
  const disabled = isPickupPublicDisplayPath(pathname ?? "");
  const showInAppToast = shouldShowInAppToast(pathname ?? "");
  const muteVisibleFloorAttention = isFloorOpsPath(pathname ?? "");
  const showInAppToastRef = useRef(showInAppToast);
  const muteVisibleFloorAttentionRef = useRef(muteVisibleFloorAttention);
  showInAppToastRef.current = showInAppToast;
  muteVisibleFloorAttentionRef.current = muteVisibleFloorAttention;
  const schedulePopupsRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (disabled) {
      highWaterRef.current = 0;
      return;
    }
    void dedupeInflight("listNotifications:1:highwater", () =>
      listNotifications({ limit: 1 }),
    ).then((result) => {
      highWaterRef.current =
        result.success && result.data ? (result.data.items[0]?.id ?? 0) : 0;
    });
  }, [disabled]);

  useEffect(() => {
    schedulePopupsRef.current = makeRealtimeCoalescer(
      async () => {
        await showPopupsForNewNotifications(
          highWaterRef,
          inFlightRef,
          showInAppToastRef.current,
          muteVisibleFloorAttentionRef.current,
          (url) => navigateRef.current(url),
        );
      },
      undefined,
      { metricName: "notifications.popup.refresh" },
    );
  }, []);

  useNotificationEvents({
    enabled: !disabled,
    filter: { insertOnly: true },
    onEvent: () => schedulePopupsRef.current(),
  });

  useEffect(() => {
    if (disabled) return;
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void showPopupsForNewNotifications(
          highWaterRef,
          inFlightRef,
          showInAppToastRef.current,
          muteVisibleFloorAttentionRef.current,
          (url) => navigateRef.current(url),
        );
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [disabled]);
}
