"use client";

import { usePathname } from "next/navigation";
import { LayoutGrid as IconLayoutGrid } from "lucide-react";
import { cn } from "@comtammatu/ui";
import { Button } from "@comtammatu/ui/components/button";
import { useSidebar } from "@comtammatu/ui/components/sidebar";
import { messages } from "@lib/messages";
import {
  AppBottomNav,
  BOTTOM_NAV_ITEM_CLASS,
} from "@/components/app-bottom-nav";
import {
  isNavItemActive,
  type ShellNavGroup,
  type ShellNavItem,
} from "@/lib/shell-primitives";

const copy = messages.admin.nav;
const MAX_VISIBLE_ITEMS = 5;

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
 * Mobile bottom navbar for the back-office workspace. Bar destinations are the
 * active module's deep nav (tier-2); the leading "Mô-đun" tab opens the single
 * sidebar drawer for cross-module switching plus the active module sub-tabs.
 * Must render inside `SidebarProvider` (AppShell does this).
 */
export function WorkspaceBottomNav({
  tier1,
  tier2,
}: {
  tier1: ShellNavItem[];
  tier2: ShellNavGroup[];
}) {
  const pathname = usePathname();
  const { toggleSidebar } = useSidebar();
  // tier1 is surfaced through the drawer the leading tab toggles; the bar items
  // stay scoped to tier-2 so the module's deep actions win the top-5 race.
  void tier1;
  const items = selectBottomNavItems(flattenNavGroups(tier2), pathname);

  return (
    <AppBottomNav
      ariaLabel={copy.ariaLabel}
      className="md:hidden"
      itemClassName="min-w-16"
      items={items.map((item) => ({
        href: item.href,
        label: item.label,
        icon: item.icon,
        active: isNavItemActive(item, pathname),
      }))}
      leading={
        <Button
          variant="ghost"
          size="touch"
          onClick={toggleSidebar}
          className={cn(BOTTOM_NAV_ITEM_CLASS, "min-w-16")}
        >
          <IconLayoutGrid data-icon="inline-start" />
          <span>{copy.modules}</span>
        </Button>
      }
    />
  );
}
