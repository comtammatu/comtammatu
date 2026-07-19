"use client";

import Link from "next/link";
import { cn } from "@comtammatu/ui";
import { Button } from "@comtammatu/ui/components/button";
import { Item } from "@comtammatu/ui/components/item";
import { Skeleton } from "@comtammatu/ui/components/skeleton";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@comtammatu/ui/components/toggle-group";
import { Inbox as IconInbox } from "lucide-react";
import type { NotificationItem as NotificationItemModel } from "@/(protected)/notifications/actions";
import { messages, m } from "@lib/messages";
import { AppEmptyState } from "@/components/surface";
import { AppBoneyardSkeleton } from "./boneyard-skeleton";
import { NotificationItem } from "./notification-item";

interface Props {
  items: NotificationItemModel[];
  unreadCount: number;
  loading: boolean;
  loadingMore?: boolean;
  hasMore?: boolean;
  unreadOnly?: boolean;
  onRead: (id: number) => void;
  onMarkAll: () => void;
  onLoadMore?: () => void;
  onUnreadOnlyChange?: (next: boolean) => void;
  onItemNavigate?: () => void;
  showViewAll?: boolean;
  /** Constrain the scroll viewport height; omit to grow with content. */
  scrollClassName?: string;
}

const NOTIFICATION_SKELETON_ITEMS: NotificationItemModel[] = [
  {
    id: 1,
    tenant_id: 1,
    target_branch_id: 1,
    target_roles: ["cashier"],
    kind: "pos.order_new",
    severity: "info",
    title: "Don moi can xu ly",
    body: "Ban 04 vua tao don moi.",
    entity_type: "order",
    entity_id: 1,
    action_url: "/br/1/pos",
    meta: {},
    created_at: new Date(2026, 0, 5, 8, 15).toISOString(),
    expires_at: null,
    read_at: null,
  },
  {
    id: 2,
    tenant_id: 1,
    target_branch_id: 1,
    target_roles: ["branch_manager"],
    kind: "inventory.stock_low",
    severity: "warning",
    title: "Nguyen lieu sap het",
    body: "Suon cot let can kiem tra ton kho.",
    entity_type: "ingredient",
    entity_id: 2,
    action_url: "/inventory/stock",
    meta: {},
    created_at: new Date(2026, 0, 5, 8, 10).toISOString(),
    expires_at: null,
    read_at: null,
  },
  {
    id: 3,
    tenant_id: 1,
    target_branch_id: null,
    target_roles: ["owner"],
    kind: "workflow.grn_pending",
    severity: "info",
    title: "GRN dang cho duyet",
    body: "Phieu nhap can doi chieu chung tu.",
    entity_type: "grn",
    entity_id: 3,
    action_url: "/inventory/grn",
    meta: {},
    created_at: new Date(2026, 0, 5, 8, 5).toISOString(),
    expires_at: null,
    read_at: new Date(2026, 0, 5, 8, 8).toISOString(),
  },
];

function NotificationRows({
  items,
  onItemNavigate,
  onRead,
}: Pick<Props, "items" | "onItemNavigate" | "onRead">) {
  return (
    <>
      {items.map((item) => (
        <NotificationItem
          key={item.id}
          item={item}
          onRead={onRead}
          onNavigate={onItemNavigate}
        />
      ))}
    </>
  );
}

function NotificationListSkeletonFallback() {
  return (
    <>
      {Array.from({ length: 4 }).map((_, index) => (
        <Item
          key={index}
          variant="outline"
          className="items-start gap-3 bg-card p-3"
        >
          <Skeleton className="size-8 shrink-0 rounded-md" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </Item>
      ))}
    </>
  );
}

export function NotificationList({
  items,
  unreadCount,
  loading,
  loadingMore = false,
  hasMore = false,
  unreadOnly = false,
  onRead,
  onMarkAll,
  onLoadMore,
  onUnreadOnlyChange,
  onItemNavigate,
  showViewAll = true,
  scrollClassName = "max-h-[28rem]",
}: Props) {
  const hasUnread = unreadCount > 0;
  const showFilter = typeof onUnreadOnlyChange === "function";

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <p className="text-sm font-semibold">
          {messages.notifications.pageTitle}
          {hasUnread ? (
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              {m(messages.notifications.unreadBadge, { count: unreadCount })}
            </span>
          ) : null}
        </p>
        {hasUnread ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={onMarkAll}
          >
            {messages.notifications.markAllRead}
          </Button>
        ) : null}
      </div>

      {showFilter ? (
        <div className="border-b px-3 py-2">
          <ToggleGroup
            type="single"
            size="sm"
            variant="outline"
            value={unreadOnly ? "unread" : "all"}
            onValueChange={(value) => {
              if (value) onUnreadOnlyChange(value === "unread");
            }}
            className="h-7"
          >
            <ToggleGroupItem value="all" className="h-7 px-3 text-xs">
              {messages.notifications.filters.all}
            </ToggleGroupItem>
            <ToggleGroupItem value="unread" className="h-7 px-3 text-xs">
              {messages.notifications.filters.unread}
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      ) : null}

      <div
        className={cn("overflow-y-auto overscroll-contain", scrollClassName)}
      >
        <AppBoneyardSkeleton
          name="notifications-list"
          loading={loading}
          className="flex flex-col gap-2 p-3"
          fixture={
            <NotificationRows
              items={NOTIFICATION_SKELETON_ITEMS}
              onRead={() => undefined}
            />
          }
          fallback={<NotificationListSkeletonFallback />}
          snapshotConfig={{ excludeSelectors: ["svg"] }}
        >
          {items.length === 0 && !loading ? (
            <AppEmptyState
              compact
              title={messages.notifications.empty}
              description={messages.notifications.emptyHint}
              icon={<IconInbox aria-hidden />}
            />
          ) : (
            <NotificationRows
              items={items}
              onRead={onRead}
              onItemNavigate={onItemNavigate}
            />
          )}
        </AppBoneyardSkeleton>
        {hasMore && onLoadMore && !loading ? (
          <div className="px-3 pb-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 w-full text-xs"
              onClick={onLoadMore}
              disabled={loadingMore}
            >
              {messages.notifications.loadMore}
            </Button>
          </div>
        ) : null}
      </div>

      {showViewAll ? (
        <div className="border-t px-3 py-2 text-right">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            render={<Link href="/notifications" />}
          >
            {messages.notifications.viewAll}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
