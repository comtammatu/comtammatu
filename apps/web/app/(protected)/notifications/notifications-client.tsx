"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { useNotifications } from "@/_hooks/use-notifications";
import {
  NotificationFeedFilter,
  NotificationList,
} from "@/_components/notification-list";
import { NotificationPopupControl } from "@/_components/notification-popup-control";
import { AppListFrame, AppPageHeader } from "@/components/surface";
import { messages, m } from "@lib/messages";
import {
  OWNER_SHELL_BREAKPOINT,
  useIsMobile,
} from "@comtammatu/ui/hooks/use-mobile";

export function NotificationsClient({
  tenantId,
  branchId,
  backHref,
}: {
  tenantId: number;
  branchId: number | null;
  backHref: string | null;
}) {
  const isTouchLayout = useIsMobile(OWNER_SHELL_BREAKPOINT);

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

  const hasUnread = unreadCount > 0;

  return (
    <div className="flex flex-col gap-4">
      <AppPageHeader
        title={messages.notifications.pageTitle}
        description={
          hasUnread
            ? m(messages.notifications.pageDescriptionUnread, {
                count: unreadCount,
              })
            : messages.notifications.pageDescription
        }
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            {hasUnread ? (
              <Button
                type="button"
                variant="outline"
                size={isTouchLayout ? "touch" : "lg"}
                onClick={markAll}
              >
                {messages.notifications.markAllRead}
              </Button>
            ) : null}
            {backHref ? (
              <Button
                variant="outline"
                size={isTouchLayout ? "touch" : "lg"}
                render={<Link href={backHref} />}
              >
                <ArrowLeft data-icon="inline-start" />
                {messages.notifications.back}
              </Button>
            ) : null}
          </div>
        }
      />

      <AppListFrame
        toolbar={
          <div className="flex flex-col gap-3 px-3 py-2">
            <NotificationFeedFilter
              feedMode={feedMode}
              unreadCount={unreadCount}
              onFeedModeChange={setFeedMode}
            />
            <NotificationPopupControl compact />
          </div>
        }
      >
        <div className="px-3 pb-3">
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
            showViewAll={false}
            showPanelHeader={false}
            showFilterBar={false}
          />
        </div>
      </AppListFrame>
    </div>
  );
}
