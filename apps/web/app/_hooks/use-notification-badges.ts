"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getNotificationBadgeSummary,
  type NotificationBadgeSummary,
} from "@/(protected)/notifications/actions";
import { useNotificationEvents } from "@/_hooks/use-notification-events";
import { makeRealtimeCoalescer } from "@/_utils/realtime-scheduler";
import { dedupeInflight } from "@/_utils/inflight-dedupe";
import { NOTIFICATIONS_CHANGED_EVENT } from "@lib/notifications/changed-event";

const EMPTY_SUMMARY: NotificationBadgeSummary = {
  unreadCount: 0,
  targets: [],
};

export function useNotificationBadges(): NotificationBadgeSummary {
  const [summary, setSummary] =
    useState<NotificationBadgeSummary>(EMPTY_SUMMARY);
  const inFlightRef = useRef(false);
  const queuedRef = useRef(false);
  const refreshRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const scheduleRefreshRef = useRef<() => void>(() => {});

  const refresh = useCallback(async () => {
    if (inFlightRef.current) {
      queuedRef.current = true;
      return;
    }

    inFlightRef.current = true;
    try {
      const result = await dedupeInflight("getNotificationBadgeSummary", () =>
        getNotificationBadgeSummary(),
      );
      if (result.success && result.data) setSummary(result.data);
    } finally {
      inFlightRef.current = false;
      if (queuedRef.current) {
        queuedRef.current = false;
        void refreshRef.current();
      }
    }
  }, []);

  useEffect(() => {
    refreshRef.current = refresh;
    scheduleRefreshRef.current = makeRealtimeCoalescer(
      () => refreshRef.current(),
      undefined,
      { metricName: "notifications.badges.refresh" },
    );
    void refresh();
  }, [refresh]);

  useNotificationEvents({
    onEvent: () => scheduleRefreshRef.current(),
  });

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") void refreshRef.current();
    };
    const handleChanged = () => void refreshRef.current();
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, handleChanged);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, handleChanged);
    };
  }, []);

  return summary;
}
