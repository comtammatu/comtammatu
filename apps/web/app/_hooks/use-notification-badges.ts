"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { extractClaimsFromAccessToken } from "@comtammatu/shared/auth";
import {
  getNotificationBadgeSummary,
  type NotificationBadgeSummary,
} from "@/(protected)/notifications/actions";
import { useRealtimeChannel } from "@/_hooks/use-realtime-channel";

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

  const refresh = useCallback(async () => {
    if (inFlightRef.current) {
      queuedRef.current = true;
      return;
    }

    inFlightRef.current = true;
    try {
      const result = await getNotificationBadgeSummary();
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
    void refresh();
  }, [refresh]);

  useRealtimeChannel((supabase, token) => {
    const claims = token ? extractClaimsFromAccessToken(token) : null;
    if (!claims) return null;

    return supabase
      .channel(`notification-badges-${String(claims.tenant_id)}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `tenant_id=eq.${String(claims.tenant_id)}`,
        },
        () => void refreshRef.current(),
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void refreshRef.current();
      });
  }, []);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") void refreshRef.current();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  return summary;
}
