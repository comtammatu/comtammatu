"use client";

import { AppSection } from "@/components/surface";
import { useNotifications } from "@/_hooks/use-notifications";
import { NotificationList } from "@/_components/notification-list";
import { NotificationPushControl } from "@/_components/notification-push-control";

export function NotificationsClient({ tenantId }: { tenantId: number }) {
  const {
    items,
    unreadCount,
    loading,
    loadingMore,
    hasMore,
    unreadOnly,
    markRead,
    markAll,
    loadMore,
    setUnreadOnly,
  } = useNotifications({ tenantId });

  return (
    <div className="flex flex-col gap-3">
      <NotificationPushControl />
      <AppSection className="overflow-hidden" contentFlush>
        <NotificationList
          items={items}
          unreadCount={unreadCount}
          loading={loading}
          loadingMore={loadingMore}
          hasMore={hasMore}
          unreadOnly={unreadOnly}
          onRead={markRead}
          onMarkAll={markAll}
          onLoadMore={loadMore}
          onUnreadOnlyChange={setUnreadOnly}
          showViewAll={false}
          scrollClassName="max-h-[70vh]"
        />
      </AppSection>
    </div>
  );
}
