"use client";

import { usePathname } from "next/navigation";
import { LayoutGrid as IconLayoutGrid } from "lucide-react";
import { cn } from "@comtammatu/ui";
import { Button } from "@comtammatu/ui/components/button";
import { useSidebar } from "@/components/sidebar";
import { m, messages } from "@lib/messages";
import {
  AppBottomNav,
  BOTTOM_NAV_ITEM_CLASS,
} from "@/components/app-bottom-nav";
import { selectControlSurfaceBottomNavItems } from "@/lib/control-surface-nav";
import {
  isNavItemActive,
  type ShellNavGroup,
  type ShellNavItem,
} from "@/lib/shell-primitives";

const copy = messages.controlSurface.nav;
const MAX_VISIBLE_ITEMS = 4;

/**
 * Mobile bottom navbar for control_surface (Quản trị) routes. Bar destinations are the
 * active module's deep nav (tier-2), falling back to primary modules when no
 * deep nav exists. The leading "Phân hệ" tab opens the single sidebar drawer.
 * Must render inside `SidebarProvider` (AppShell does this).
 */
export function ControlSurfaceBottomNav({
  tier1,
  tier2,
}: {
  tier1: ShellNavItem[];
  tier2: ShellNavGroup[];
}) {
  const pathname = usePathname();
  const { openMobile, toggleSidebar } = useSidebar();
  const items = selectControlSurfaceBottomNavItems({
    groups: tier2,
    fallbackItems: tier1,
    pathname,
    inventory: pathname.startsWith("/inventory"),
  }).slice(0, MAX_VISIBLE_ITEMS);

  return (
    <AppBottomNav
      ariaLabel={copy.ariaLabel}
      className="lg:hidden"
      itemClassName="min-w-14"
      items={items.map((item) => ({
        href: item.linkHref ?? item.href,
        label: item.label,
        icon: item.icon,
        active: isNavItemActive(item, pathname),
        badgeCount: item.badgeCount,
        badgeLabel:
          item.badgeCount && item.badgeCount > 0
            ? m(messages.notifications.unreadBadge, {
                count: item.badgeCount,
              })
            : undefined,
      }))}
      leading={
        <Button
          variant="ghost"
          size="touch"
          onClick={toggleSidebar}
          aria-expanded={openMobile}
          className={cn(BOTTOM_NAV_ITEM_CLASS, "min-w-14")}
        >
          <IconLayoutGrid data-icon="inline-start" aria-hidden="true" />
          <span>{copy.modules}</span>
        </Button>
      }
    />
  );
}
