"use client";

import Link from "next/link";
import type { ElementType, ReactNode } from "react";
import { cn } from "@comtammatu/ui";
import { Button } from "@comtammatu/ui/components/button";

/**
 * Shared mobile bottom-nav recipe consumed by Management, Branch runtime, and
 * Operations chrome. Per design-system.md § B the bottom nav is an exported
 * primitive, not a per-surface re-implementation. Callers pass pre-resolved
 * items (active computed by the surface's nav model) plus optional leading and
 * trailing actions.
 */
export const BOTTOM_NAV_ITEM_CLASS =
  "flex-1 flex-col gap-1 px-1 text-2xs transition-[background-color,color,transform] duration-150 relative active:scale-95";

export type AppBottomNavItem = {
  href: string;
  label: string;
  icon: ElementType;
  active: boolean;
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
      data-app-bottom-nav
      className={cn(
        "z-40 border-t border-border/20 bg-card/80 px-3 pt-2 pb-1 chrome-safe-pb chrome-tap select-none backdrop-blur-md print:hidden",
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
          return (
            <Button
              key={item.href}
              asChild
              variant="ghost"
              size="touch"
              data-active={item.active ? "true" : undefined}
              className={cn(
                BOTTOM_NAV_ITEM_CLASS,
                "min-w-0 data-active:text-primary data-active:bg-primary/10 rounded-md font-medium",
                itemClassName,
              )}
            >
              <Link
                href={item.href}
                aria-current={item.active ? "page" : undefined}
              >
                <Icon
                  data-icon="inline-start"
                  strokeWidth={item.active ? 2.4 : 2}
                />
                <span className="max-w-full truncate">{item.label}</span>
              </Link>
            </Button>
          );
        })}
        {trailing}
      </div>
    </nav>
  );
}
