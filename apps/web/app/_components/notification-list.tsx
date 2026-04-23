"use client";

import Link from "next/link";
import { Button } from "@comtammatu/ui/components/button";
import { ScrollArea } from "@comtammatu/ui/components/scroll-area";
import { IconInbox } from "@tabler/icons-react";
import type { NotificationItem as NotificationItemModel } from "@/_actions/notifications";
import { messages, m } from "@lib/messages";
import { NotificationItem } from "./notification-item";

interface Props {
  items: NotificationItemModel[];
  unreadCount: number;
  loading: boolean;
  onRead: (id: number) => void;
  onMarkAll: () => void;
  onItemNavigate?: () => void;
  showViewAll?: boolean;
}

export function NotificationList({
  items,
  unreadCount,
  loading,
  onRead,
  onMarkAll,
  onItemNavigate,
  showViewAll = true,
}: Props) {
  const hasUnread = unreadCount > 0;

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

      <ScrollArea className="h-[360px]">
        <div className="flex flex-col gap-2 p-3">
          {items.length === 0 && !loading ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
              <IconInbox className="size-8 text-muted-foreground" aria-hidden />
              <p className="text-sm font-medium">
                {messages.notifications.empty}
              </p>
              <p className="text-xs text-muted-foreground">
                {messages.notifications.emptyHint}
              </p>
            </div>
          ) : (
            items.map((item) => (
              <NotificationItem
                key={item.id}
                item={item}
                onRead={onRead}
                onNavigate={onItemNavigate}
              />
            ))
          )}
        </div>
      </ScrollArea>

      {showViewAll ? (
        <div className="border-t px-3 py-2 text-right">
          <Button asChild variant="ghost" size="sm" className="h-7 text-xs">
            <Link href="/notifications">{messages.notifications.viewAll}</Link>
          </Button>
        </div>
      ) : null}
    </div>
  );
}
