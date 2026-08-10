"use client";

import Link from "next/link";
import { cn } from "@comtammatu/ui";
import { Button } from "@comtammatu/ui/components/button";
import {
  Item,
  ItemContent,
  ItemGroup,
} from "@comtammatu/ui/components/item";
import { SectionLabel } from "@comtammatu/ui/components/section-label";
import { Skeleton } from "@comtammatu/ui/components/skeleton";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@comtammatu/ui/components/toggle-group";
import { Inbox as IconInbox } from "lucide-react";
import type { NotificationItem as NotificationItemModel } from "@/(protected)/notifications/actions";
import { messages, m } from "@lib/messages";
import { AppEmptyState } from "@/components/surface";
import {
  formatVNDate,
  getVNDateString,
  getYesterdayVNDateString,
} from "@comtammatu/shared/time";
import { AppBoneyardSkeleton } from "./boneyard-skeleton";
import { NotificationItem } from "./notification-item";

interface Props {
  items: NotificationItemModel[];
  unreadCount: number;
  loading: boolean;
  loadingMore?: boolean;
  hasMore?: boolean;
  feedMode?: "active" | "all";
  onRead: (id: number, options?: { quiet?: boolean }) => void;
  onMarkAll: () => void;
  onLoadMore?: () => void;
  onFeedModeChange?: (next: "active" | "all") => void;
  onItemNavigate?: () => void;
  showViewAll?: boolean;
  /** Hide the compact panel title row when the page header already owns it. */
  showPanelHeader?: boolean;
  /**
   * Render the feed-mode toggle inside this list. Page layouts usually host
   * the toggle in `AppListFrame` toolbar instead.
   */
  showFilterBar?: boolean;
  /** Constrain the scroll viewport height; omit for normal page flow. */
  scrollClassName?: string;
}

type DayGroup = {
  key: string;
  label: string;
  items: NotificationItemModel[];
};

const NOTIFICATION_SKELETON_ITEMS: NotificationItemModel[] = [
  {
    id: 1,
    tenant_id: 1,
    target_branch_id: 1,
    target_roles: ["cashier"],
    kind: "pos.order_new",
    severity: "info",
    title: "Đơn mới cần xử lý",
    body: "Bàn 04 vừa tạo đơn mới.",
    entity_type: "order",
    entity_id: 1,
    action_url: "/br/1/pos",
    history_url: null,
    audit_url: null,
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
    title: "Nguyên liệu sắp hết",
    body: "Sườn cốt lết cần kiểm tra tồn kho.",
    entity_type: "ingredient",
    entity_id: 2,
    action_url: "/inventory/stock",
    history_url: null,
    audit_url: null,
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
    title: "Phiếu nhập đang chờ duyệt",
    body: "Phiếu nhập cần đối chiếu chứng từ.",
    entity_type: "grn",
    entity_id: 3,
    action_url: "/inventory/grn",
    history_url: "/inventory/grn/3",
    audit_url: null,
    meta: {},
    created_at: new Date(2026, 0, 5, 8, 5).toISOString(),
    expires_at: null,
    read_at: new Date(2026, 0, 5, 8, 8).toISOString(),
  },
];

export function NotificationFeedFilter({
  feedMode,
  unreadCount,
  onFeedModeChange,
}: {
  feedMode: "active" | "all";
  unreadCount: number;
  onFeedModeChange: (next: "active" | "all") => void;
}) {
  const hasUnread = unreadCount > 0;

  return (
    <ToggleGroup
      type="single"
      size="sm"
      variant="outline"
      value={feedMode}
      onValueChange={(value) => {
        if (value === "active" || value === "all") onFeedModeChange(value);
      }}
      className="h-8 w-full sm:w-auto"
    >
      <ToggleGroupItem
        value="active"
        className="h-8 flex-1 px-3 text-xs sm:flex-none"
      >
        {messages.notifications.filters.active}
        {hasUnread ? (
          <span className="ml-1.5 tabular-nums text-muted-foreground">
            {unreadCount}
          </span>
        ) : null}
      </ToggleGroupItem>
      <ToggleGroupItem
        value="all"
        className="h-8 flex-1 px-3 text-xs sm:flex-none"
      >
        {messages.notifications.filters.all}
      </ToggleGroupItem>
    </ToggleGroup>
  );
}

export function groupNotificationsByDay(
  items: NotificationItemModel[],
  now: Date = new Date(),
): DayGroup[] {
  const today = getVNDateString(now);
  const yesterday = getYesterdayVNDateString(now);
  const groups: DayGroup[] = [];

  for (const item of items) {
    const key = getVNDateString(item.created_at);
    let label = formatVNDate(item.created_at);
    if (key === today) label = messages.notifications.groups.today;
    else if (key === yesterday) label = messages.notifications.groups.yesterday;

    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.items.push(item);
      continue;
    }
    groups.push({ key, label, items: [item] });
  }

  return groups;
}

function NotificationRows({
  items,
  onItemNavigate,
  onRead,
}: Pick<Props, "items" | "onItemNavigate" | "onRead">) {
  const groups = groupNotificationsByDay(items);

  return (
    <div className="flex flex-col gap-4">
      {groups.map((group) => (
        <section key={group.key} className="flex flex-col gap-2">
          <SectionLabel density="dense" as="h3">
            {group.label}
          </SectionLabel>
          <ItemGroup className="gap-2" data-size="sm">
            {group.items.map((item) => (
              <NotificationItem
                key={item.id}
                item={item}
                onRead={onRead}
                onNavigate={onItemNavigate}
              />
            ))}
          </ItemGroup>
        </section>
      ))}
    </div>
  );
}

function NotificationListSkeletonFallback() {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: 4 }).map((_, index) => (
        <Item
          key={index}
          variant="outline"
          className="items-start gap-3 border-l-[3px] border-l-transparent bg-card p-3"
        >
          <Skeleton className="size-9 shrink-0 rounded-md" />
          <ItemContent className="gap-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-1/3" />
          </ItemContent>
        </Item>
      ))}
    </div>
  );
}

export function NotificationList({
  items,
  unreadCount,
  loading,
  loadingMore = false,
  hasMore = false,
  feedMode = "active",
  onRead,
  onMarkAll,
  onLoadMore,
  onFeedModeChange,
  onItemNavigate,
  showViewAll = true,
  showPanelHeader = true,
  showFilterBar,
  scrollClassName,
}: Props) {
  const hasUnread = unreadCount > 0;
  const showFilter =
    showFilterBar ?? typeof onFeedModeChange === "function";
  const nestedScroll = Boolean(scrollClassName);

  return (
    <div className="flex flex-col">
      {showPanelHeader ? (
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
      ) : null}

      {showFilter && onFeedModeChange ? (
        <div className="border-b px-3 py-2">
          <NotificationFeedFilter
            feedMode={feedMode}
            unreadCount={unreadCount}
            onFeedModeChange={onFeedModeChange}
          />
        </div>
      ) : null}

      <div
        className={cn(
          nestedScroll ? "overflow-y-auto overscroll-contain" : null,
          scrollClassName,
        )}
      >
        <AppBoneyardSkeleton
          name="notifications-list"
          loading={loading}
          className={cn("flex flex-col", nestedScroll ? "gap-2 p-3" : "gap-3 pt-3")}
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
          <div className={cn(nestedScroll ? "px-3 pb-3" : "pt-3")}>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 w-full text-xs"
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
