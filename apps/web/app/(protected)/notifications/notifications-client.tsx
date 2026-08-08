"use client";

import Link from "next/link";
import { ArrowLeft, ChevronDown as IconChevronDown } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@comtammatu/ui/components/collapsible";
import { useNotifications } from "@/_hooks/use-notifications";
import {
  NotificationFeedFilter,
  NotificationList,
} from "@/_components/notification-list";
import { NotificationPopupControl } from "@/_components/notification-popup-control";
import { AppListFrame, AppPageHeader, AppSection } from "@/components/surface";
import { messages, m } from "@lib/messages";

export function NotificationsClient({
  tenantId,
  branchId,
  backHref,
}: {
  tenantId: number;
  branchId: number | null;
  backHref: string | null;
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
                size="touch"
                onClick={markAll}
              >
                {messages.notifications.markAllRead}
              </Button>
            ) : null}
            {backHref ? (
              <Button
                variant="outline"
                size="touch"
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
          <div className="px-3 py-2">
            <NotificationFeedFilter
              feedMode={feedMode}
              unreadCount={unreadCount}
              onFeedModeChange={setFeedMode}
            />
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

      <AppSection contentFlush>
        <Collapsible>
          <CollapsibleTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="touch"
                className="group w-full justify-between px-3 font-normal"
              />
            }
          >
            <span className="text-sm text-muted-foreground">
              {messages.notifications.deviceToggle}
            </span>
            <IconChevronDown
              className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[panel-open]:rotate-180"
              aria-hidden
            />
          </CollapsibleTrigger>
          <CollapsibleContent className="border-t px-3 pb-3 pt-2">
            <NotificationPopupControl compact />
          </CollapsibleContent>
        </Collapsible>
      </AppSection>
    </div>
  );
}
