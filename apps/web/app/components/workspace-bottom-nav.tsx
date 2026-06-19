"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu as IconMenu } from "lucide-react";
import { cn } from "@comtammatu/ui";
import { Button } from "@comtammatu/ui/components/button";
import { useSidebar } from "@comtammatu/ui/components/sidebar";
import { messages } from "@lib/messages";
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
 * Mobile bottom navbar for the back-office workspace. Destinations come from
 * the same resolved nav model as the desktop sidebar; the trailing "Menu" tab
 * opens the full sidebar drawer. Must render inside `SidebarProvider`
 * (AppShell does this).
 */
export function WorkspaceBottomNav({
  navGroups,
}: {
  navGroups: ShellNavGroup[];
}) {
  const pathname = usePathname();
  const { toggleSidebar } = useSidebar();
  const items = selectBottomNavItems(flattenNavGroups(navGroups), pathname);

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 px-3 pt-2 shadow-sm chrome-safe-pb backdrop-blur lg:hidden print:hidden"
      aria-label={copy.ariaLabel}
    >
      <div className="no-scrollbar mx-auto flex max-w-lg items-stretch gap-1 overflow-x-auto">
        {items.map((item) => {
          const active = isNavItemActive(item, pathname);
          const Icon = item.icon;
          return (
            <Button
              key={item.href}
              asChild
              variant={active ? "secondary" : "ghost"}
              size="touch"
              data-active={active ? "true" : undefined}
              className={cn(
                "min-w-16 flex-1 flex-col gap-1 px-1 text-2xs transition-[transform,background-color,color,box-shadow] duration-150 active:translate-y-px",
                active &&
                  "shadow-sm motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 motion-safe:duration-150",
              )}
            >
              <Link href={item.href} aria-current={active ? "page" : undefined}>
                <Icon data-icon="inline-start" strokeWidth={active ? 2.4 : 2} />
                <span className="max-w-full truncate">{item.label}</span>
              </Link>
            </Button>
          );
        })}
        <Button
          variant="ghost"
          size="touch"
          onClick={toggleSidebar}
          className="min-w-16 flex-1 flex-col gap-1 px-1 text-2xs transition-[transform,background-color,color,box-shadow] duration-150 active:translate-y-px"
        >
          <IconMenu data-icon="inline-start" />
          <span>{copy.menu}</span>
        </Button>
      </div>
    </nav>
  );
}
