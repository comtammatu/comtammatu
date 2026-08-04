"use client";

import Link from "next/link";
import type { ElementType, ReactNode } from "react";
import { cn } from "@comtammatu/ui";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";

/**
 * Shared mobile bottom-nav recipe consumed by Management, Branch runtime, and
 * Operations chrome. Per design-system.md § B the bottom nav is an exported
 * primitive, not a per-surface re-implementation. Callers pass pre-resolved
 * items (active computed by the surface's nav model) plus optional leading and
 * trailing actions.
 */
export const BOTTOM_NAV_ITEM_CLASS =
  "flex-1 flex-col gap-1 px-1 text-xs transition-[background-color,color,transform] duration-150 relative active:scale-95";

export type AppBottomNavItem = {
  href: string;
  label: string;
  icon: ElementType;
  active: boolean;
  badgeCount?: number;
  badgeLabel?: string;
};

export function AppBottomNav({
  items,
  ariaLabel,
  className,
  itemClassName,
  leading,
  trailing,
  hideOnDesktop = true,
  position = "fixed",
}: {
  items: AppBottomNavItem[];
  ariaLabel: string;
  className?: string;
  itemClassName?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  hideOnDesktop?: boolean;
  position?: "fixed" | "static";
}) {
  return (
    <nav
      className={cn(
        "z-40 border-t border-border/20 bg-card/80 px-3 pt-2 pb-1 shadow-effect-card-resting chrome-safe-pb chrome-tap select-none backdrop-blur-md print:hidden",
        position === "fixed" ? "fixed inset-x-0 bottom-0" : "static shrink-0",
        hideOnDesktop && "lg:hidden",
        className,
      )}
      aria-label={ariaLabel}
    >
      <div className="no-scrollbar mx-auto flex max-w-lg items-stretch gap-1 overflow-x-auto">
        {leading}
        {items.map((item) => {
          const Icon = item.icon;
          const badgeCount = item.badgeCount ?? 0;
          const hasBadge = badgeCount > 0;
          return (
            <Button
              key={item.href}
              variant="ghost"
              size="touch"
              data-active={item.active ? "true" : undefined}
              className={cn(
                BOTTOM_NAV_ITEM_CLASS,
                "min-w-0 data-active:text-primary data-active:bg-primary/10 rounded-md font-medium",
                itemClassName,
              )}
              render={
                <Link
                  href={item.href}
                  aria-current={item.active ? "page" : undefined}
                />
              }
            >
              <span className="relative inline-flex">
                <Icon
                  data-icon="inline-start"
                  strokeWidth={item.active ? 2.4 : 2}
                />
                {hasBadge ? (
                  <Badge
                    aria-hidden
                    variant="secondary"
                    className="absolute -right-3 -top-2 h-4 min-w-4 justify-center rounded-full px-1 text-3xs leading-none"
                  >
                    {badgeCount > 99 ? "99+" : badgeCount}
                  </Badge>
                ) : null}
              </span>
              <span className="max-w-full truncate">{item.label}</span>
              {hasBadge && item.badgeLabel ? (
                <span className="sr-only">{item.badgeLabel}</span>
              ) : null}
            </Button>
          );
        })}
        {trailing}
      </div>
    </nav>
  );
}
