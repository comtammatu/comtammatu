"use client";

import { useState } from "react";
import { Bell as IconBell } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@comtammatu/ui/components/popover";
import { messages } from "@lib/messages";
import { useNotifications } from "@/_hooks/use-notifications";
import { NotificationList } from "./notification-list";

interface Props {
  tenantId: number;
}

export function NotificationBell({ tenantId }: Props) {
  const [open, setOpen] = useState(false);
  const { items, unreadCount, loading, markRead, markAll, refresh } =
    useNotifications({ tenantId });

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) void refresh();
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={messages.notifications.bellAriaLabel}
        >
          <IconBell className="size-5" />
          {unreadCount > 0 ? (
            <span
              className="absolute right-1 top-1 inline-flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-4 text-destructive-foreground"
              aria-live="polite"
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[360px] p-0 sm:w-[400px]"
      >
        <NotificationList
          items={items}
          unreadCount={unreadCount}
          loading={loading}
          onRead={markRead}
          onMarkAll={markAll}
          onItemNavigate={() => setOpen(false)}
        />
      </PopoverContent>
    </Popover>
  );
}
