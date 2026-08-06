"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell as IconBell } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { NotificationCountBadge } from "@/components/notification-count-badge";
import { useNotificationBadges } from "@/_hooks/use-notification-badges";
import { messages } from "@lib/messages";

export function OperatorNotificationBell({
  returnTo,
}: {
  returnTo: string;
}) {
  const pathname = usePathname();
  const summary = useNotificationBadges();
  const unread = summary.unreadCount;
  const href = `/notifications?returnTo=${encodeURIComponent(returnTo || pathname)}`;
  const aria =
    unread > 0
      ? `${messages.operator.header.notificationsAria}, ${unread} chưa đọc`
      : messages.operator.header.notificationsAria;

  return (
    <Button
      variant="outline"
      size="icon-touch"
      aria-label={aria}
      className="relative"
      render={<Link href={href} />}
    >
      <IconBell />
      <NotificationCountBadge count={unread} />
    </Button>
  );
}
