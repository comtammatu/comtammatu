"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { NotificationBell } from "@/_components/notification-bell";
import { useNotificationBadges } from "@/_hooks/use-notification-badges";

export function OperatorNotificationBell({
  returnTo,
}: {
  returnTo?: string;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const summary = useNotificationBadges();
  const search = searchParams.toString();
  const currentPath = search ? `${pathname}?${search}` : pathname;

  return (
    <NotificationBell
      variant="header"
      returnTo={returnTo || currentPath}
      unreadCount={summary.unreadCount}
    />
  );
}
