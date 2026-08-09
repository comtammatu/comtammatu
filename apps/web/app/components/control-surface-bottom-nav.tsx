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
import {
  isNavItemActive,
  type ShellNavGroup,
  type ShellNavItem,
} from "@/lib/shell-primitives";

const copy = messages.controlSurface.nav;
const MAX_VISIBLE_ITEMS = 4;

function flattenNavGroups(navGroups: ShellNavGroup[]): ShellNavItem[] {
  const seenHref = new Set<string>();
  const items: ShellNavItem[] = [];

  for (const group of navGroups) {
    for (const item of group.items) {
      if (seenHref.has(item.href)) continue;
      seenHref.add(item.href);
      items.push(item);
    }
  }

  return items;
}

function selectBottomNavItems(
  items: ShellNavItem[],
  pathname: string,
): ShellNavItem[] {
  const visible = items.slice(0, MAX_VISIBLE_ITEMS);
  const active = items.find((item) => isNavItemActive(item, pathname));

  if (!active || visible.some((item) => item.href === active.href)) {
    return visible;
  }

  return [...visible.slice(0, MAX_VISIBLE_ITEMS - 1), active];
}

/**
 * Mobile bottom navbar for control_surface (Quản trị) routes. Bar destinations are the
 * active module's deep nav (tier-2), falling back to primary modules when no
 * deep nav exists. The leading "Mô-đun" tab opens the single sidebar drawer.
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
  const deepNavItems = flattenNavGroups(tier2);
  const items = selectBottomNavItems(
    deepNavItems.length > 0 ? deepNavItems : tier1,
    pathname,
  );

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
