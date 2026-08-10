"use client";

import type { ReactNode } from "react";
import { cn } from "@comtammatu/ui";

export type AppDetailFooterProps = {
  leading?: ReactNode;
  trailing?: ReactNode;
  className?: string;
  sticky?: boolean;
  mobileReverse?: boolean;
  stacked?: boolean;
};

export function AppDetailFooter({
  leading,
  trailing,
  className,
  sticky = false,
  mobileReverse = false,
  stacked = false,
}: AppDetailFooterProps) {
  const hasLeading = leading != null;
  const hasTrailing = trailing != null;

  return (
    <footer
      className={cn(
        "flex border-t border-border",
        mobileReverse ? "flex-col-reverse" : "flex-col",
        stacked
          ? "sm:flex-col sm:items-stretch"
          : "sm:flex-row sm:items-center sm:justify-between",
        sticky
          ? [
              // Sticky CTA: pin to scrollport bottom while scrolling; AppPage
              // footer slot uses min-h-full + mt-auto so short pages also dock.
              "sticky bottom-[var(--app-bottom-nav-offset,0px)] z-10 gap-2 border-border bg-background py-2 shadow-lg lg:bottom-0",
              // Do not use w-full with -mx bleed: width:100% keeps the border box
              // at the parent width so background/CTA never reach the panel edge.
              "px-2 [&_[data-slot=button]]:w-full sm:[&_[data-slot=button]]:w-auto",
              // Owner shell horizontal pad (`px-3 md:px-4`): widen + pull to panel.
              "in-[[data-control-surface-scroll]]:w-[calc(100%+1.5rem)] in-[[data-control-surface-scroll]]:md:w-[calc(100%+2rem)]",
              "in-[[data-control-surface-scroll]]:-mx-3 in-[[data-control-surface-scroll]]:md:-mx-4",
              "in-[[data-control-surface-scroll]]:px-3 in-[[data-control-surface-scroll]]:md:px-4",
              "in-[[data-control-surface-scroll]]:lg:rounded-b-lg",
              "in-[[data-slot=dialog-footer]]:static in-[[data-slot=dialog-footer]]:w-full",
              "in-[[data-slot=dialog-footer]]:border-0 in-[[data-slot=dialog-footer]]:bg-transparent",
              "in-[[data-slot=dialog-footer]]:px-0 in-[[data-slot=dialog-footer]]:py-0 in-[[data-slot=dialog-footer]]:shadow-none",
              // Nested sticky CTA inside AppDialog body overlays lines — keep in flow.
              "in-[.app-dialog-body]:static in-[.app-dialog-body]:z-auto in-[.app-dialog-body]:shadow-none",
            ]
          : "gap-3 py-6",
        className,
      )}
    >
      {hasLeading ? (
        <div
          className={cn(
            "flex min-w-0 flex-col gap-2",
            !stacked && "sm:flex-row sm:items-center",
          )}
        >
          {leading}
        </div>
      ) : null}
      {hasTrailing ? (
        <div
          className={cn(
            "flex min-w-0 flex-col gap-2",
            !stacked && "sm:flex-row sm:items-center sm:justify-end",
            !hasLeading && "w-full",
          )}
        >
          {trailing}
        </div>
      ) : null}
    </footer>
  );
}
