"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@comtammatu/database/supabase/client";
import { extractClaimsFromAccessToken } from "@comtammatu/shared/auth";
import { Bell as IconBell } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@comtammatu/ui/components/popover";
import {
  OWNER_SHELL_BREAKPOINT,
  useIsMobile,
} from "@comtammatu/ui/hooks/use-mobile";
import { Badge } from "@comtammatu/ui/components/badge";
import { NotificationCountBadge } from "@/components/notification-count-badge";
import { NotificationList } from "@/_components/notification-list";
import { AppSheet } from "@/components/surface";
import { useNotifications } from "@/_hooks/use-notifications";
import { m, messages } from "@lib/messages";

const PEEK_PAGE_SIZE = 8;

function viewAllHref(returnTo: string | null | undefined): string {
  if (!returnTo) return "/notifications";
  return `/notifications?returnTo=${encodeURIComponent(returnTo)}`;
}

function PeekUnreadBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <>
      <Badge
        aria-hidden
        variant="secondary"
        className="ml-auto min-w-5 justify-center rounded-full px-1.5 tabular-nums"
      >
        {count > 99 ? "99+" : count}
      </Badge>
      <span className="sr-only">
        {m(messages.notifications.unreadBadge, { count })}
      </span>
    </>
  );
}

function NotificationPeekFeed({
  returnTo,
  onNavigate,
}: {
  returnTo?: string | null;
  onNavigate: () => void;
}) {
  const pathname = usePathname();
  const [scope, setScope] = useState<{
    tenantId: number;
    branchId: number | null;
  } | null>(null);

  useEffect(() => {
    const supabase = createClient();
    void supabase.auth.getSession().then(({ data }) => {
      const claims = extractClaimsFromAccessToken(
        data.session?.access_token ?? null,
      );
      if (!claims) return;
      setScope({
        tenantId: claims.tenant_id,
        branchId: claims.branch_id,
      });
    });
  }, []);

  const onNotificationsPage = (pathname ?? "").startsWith("/notifications");
  const feed = useNotifications({
    tenantId: scope?.tenantId ?? 0,
    branchId: scope?.branchId ?? null,
    channelSuffix: "peek",
    subscribe: Boolean(scope) && !onNotificationsPage,
    pageSize: PEEK_PAGE_SIZE,
  });

  return (
    <NotificationList
      items={feed.items.slice(0, PEEK_PAGE_SIZE)}
      unreadCount={feed.unreadCount}
      loading={scope === null || feed.loading}
      feedMode="active"
      onRead={feed.markRead}
      onMarkAll={feed.markAll}
      onItemNavigate={onNavigate}
      showViewAll
      showPanelHeader
      showFilterBar={false}
      scrollClassName="max-h-96"
      viewAllHref={viewAllHref(returnTo)}
    />
  );
}

export function NotificationBell({
  variant,
  returnTo,
  unreadCount,
}: {
  variant: "sidebar" | "header";
  returnTo?: string | null;
  unreadCount: number;
}) {
  const [open, setOpen] = useState(false);
  const isTouchLayout = useIsMobile(OWNER_SHELL_BREAKPOINT);
  const aria =
    unreadCount > 0
      ? `${messages.notifications.bellAriaLabel}, ${m(messages.notifications.unreadBadge, { count: unreadCount })}`
      : messages.notifications.bellAriaLabel;

  const triggerButton =
    variant === "header" ? (
      <Button
        type="button"
        variant="outline"
        size={isTouchLayout ? "icon-touch" : "icon-sm"}
        aria-label={aria}
        className="relative shrink-0"
      >
        <IconBell />
        <NotificationCountBadge count={unreadCount} />
      </Button>
    ) : (
      <Button
        type="button"
        variant="ghost"
        size={isTouchLayout ? "touch" : "default"}
        aria-label={aria}
        className="w-full justify-start gap-2 rounded-lg px-2.5 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      >
        <IconBell />
        <span className="min-w-0 flex-1 truncate text-left">
          {messages.notifications.pageTitle}
        </span>
        <PeekUnreadBadge count={unreadCount} />
      </Button>
    );

  const panel = open ? (
    <NotificationPeekFeed
      returnTo={returnTo}
      onNavigate={() => setOpen(false)}
    />
  ) : null;

  if (isTouchLayout) {
    return (
      <AppSheet
        open={open}
        onOpenChange={setOpen}
        title={messages.notifications.pageTitle}
        trigger={triggerButton}
        side="bottom"
        size="md"
        contentClassName="p-0"
        bodyClassName="overflow-visible p-0"
      >
        {panel}
      </AppSheet>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={triggerButton} />
      <PopoverContent
        align={variant === "header" ? "end" : "start"}
        side={variant === "sidebar" ? "top" : "bottom"}
        className="w-80 max-w-full p-0"
      >
        {panel}
      </PopoverContent>
    </Popover>
  );
}
