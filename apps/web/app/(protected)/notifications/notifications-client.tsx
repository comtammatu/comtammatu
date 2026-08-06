"use client";

import { AppSection } from "@/components/surface";
import { useNotifications } from "@/_hooks/use-notifications";
import { NotificationList } from "@/_components/notification-list";
import { NotificationPopupControl } from "@/_components/notification-popup-control";

export function NotificationsClient({
  tenantId,
  branchId,
}: {
  tenantId: number;
  branchId: number | null;
}) {
  const {
    items,
    unreadCount,
    loading,
    loadingMore,
    hasMore,
    feedMode,
    markRead,
    markAll,
    loadMore,
    setFeedMode,
  } = useNotifications({ tenantId, branchId });

  return (
    <div className="flex flex-col gap-3">
      <NotificationPopupControl />
      <AppSection className="overflow-hidden" contentFlush>
        <NotificationList
          items={items}
          unreadCount={unreadCount}
          loading={loading}
          loadingMore={loadingMore}
          hasMore={hasMore}
          feedMode={feedMode}
          onRead={markRead}
          onMarkAll={markAll}
          onLoadMore={loadMore}
          onFeedModeChange={setFeedMode}
          showViewAll={false}
          scrollClassName="max-h-[70vh]"
        />
      </AppSection>
    </div>
  );
}
