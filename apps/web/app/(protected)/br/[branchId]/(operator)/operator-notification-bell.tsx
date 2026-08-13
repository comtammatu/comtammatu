"use client";

import { usePathname } from "next/navigation";
import { NotificationBell } from "@/_components/notification-bell";
import { useNotificationBadges } from "@/_hooks/use-notification-badges";

export function OperatorNotificationBell({
  returnTo,
}: {
  returnTo: string;
}) {
  const pathname = usePathname();
  const summary = useNotificationBadges();

  return (
    <NotificationBell
      variant="header"
      returnTo={returnTo || pathname}
      unreadCount={summary.unreadCount}
    />
  );
}
