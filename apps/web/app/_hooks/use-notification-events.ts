"use client";

import { useEffect, useRef } from "react";
import {
  subscribeNotificationEvents,
  type NotificationEventFilter,
  type NotificationRealtimeEvent,
  type NotificationRealtimeTable,
} from "./notification-runtime";

function tablesFromKey(key: string): NotificationRealtimeTable[] | undefined {
  if (!key) return undefined;
  const tables: NotificationRealtimeTable[] = [];
  for (const part of key.split("\u0000")) {
    if (part === "notifications" || part === "notification_reads") {
      tables.push(part);
    }
  }
  return tables.length > 0 ? tables : undefined;
}

export function useNotificationEvents({
  enabled = true,
  filter,
  onEvent,
}: {
  enabled?: boolean;
  filter?: NotificationEventFilter;
  onEvent: (event: NotificationRealtimeEvent | null) => void;
}) {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;
  const tablesKey = filter?.tables?.join("\u0000") ?? "";
  const insertOnly = filter?.insertOnly === true;

  useEffect(() => {
    if (!enabled) return;
    return subscribeNotificationEvents({
      filter: {
        insertOnly,
        tables: tablesFromKey(tablesKey),
      },
      onEvent: (event) => onEventRef.current(event),
    });
  }, [enabled, insertOnly, tablesKey]);
}
