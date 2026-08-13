"use client";

import { useForegroundNotifications } from "@/_hooks/use-foreground-notifications";

/** One-shot mount for arrival toast / OS popup on every protected surface. */
export function NotificationAttentionRuntime() {
  useForegroundNotifications();
  return null;
}
