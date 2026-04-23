"use client";

import { Card } from "@comtammatu/ui/components/card";
import { useNotifications } from "@/_hooks/use-notifications";
import { NotificationList } from "@/_components/notification-list";

export function NotificationsClient({ tenantId }: { tenantId: number }) {
  const { items, unreadCount, loading, markRead, markAll } = useNotifications({
    tenantId,
  });

  return (
    <Card className="overflow-hidden p-0">
      <NotificationList
        items={items}
        unreadCount={unreadCount}
        loading={loading}
        onRead={markRead}
        onMarkAll={markAll}
        showViewAll={false}
      />
    </Card>
  );
}
