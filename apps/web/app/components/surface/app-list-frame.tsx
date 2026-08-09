"use client";

import type { ReactNode } from "react";
import { cn } from "@comtammatu/ui";
import { AppSection, type AppSectionProps } from "./app-section";
import { AppStickyFilterChrome } from "./app-sticky-filter-chrome";

export type AppListFrameProps = Omit<
  AppSectionProps,
  "children" | "className" | "contentFlush"
> & {
  children: ReactNode;
  className?: string;
  toolbar?: ReactNode;
};

/**
 * Owner LIST card: optional inline toolbar + flush card chrome for tables.
 * Dual Thesis — table/grid body stays edge-flush under the toolbar; Item-row
 * bodies own horizontal inset (`DataTable` mobile `px-3 py-3`, or bare
 * `ItemGroup` with the same pad + `gap-2`). Do not pad the Frame for tables.
 */
export function AppListFrame({
  children,
  className,
  toolbar,
  contentClassName,
  ...sectionProps
}: AppListFrameProps) {
  // Untitled LIST: Card py would stack on AppToolbar pad and pagination.
  // Titled LIST keeps top Card rhythm for the header, still flush bottom to the table.
  // Wrap toolbar+body so CardContent's gap-3 has one child (borders separate chrome).
  // Card keeps overflow-visible (sticky shell bleed). Flush corners clip on the
  // edge surfaces themselves — same element needs overflow-hidden + radius or
  // bg paints square past Card's rounded border.
  const hasHeader = Boolean(
    sectionProps.title ||
      sectionProps.description ||
      sectionProps.headerHint ||
      sectionProps.icon ||
      sectionProps.badge ||
      sectionProps.action ||
      sectionProps.collapsible,
  );
  const flushTop = !hasHeader;
  const hasToolbar = toolbar != null;

  return (
    <AppSection
      {...sectionProps}
      // Override Card `overflow-hidden` so toolbar Select/Dropdown collision
      // and any non-portaled layer are not clipped by the LIST frame.
      className={cn("overflow-visible", hasHeader ? "pb-0" : "py-0", className)}
      contentFlush
      contentClassName={contentClassName}
    >
      <div className="flex min-w-0 flex-col">
        {hasToolbar ? (
          <AppStickyFilterChrome
            className={
              flushTop
                ? "overflow-hidden rounded-t-lg"
                : undefined
            }
          >
            {toolbar}
          </AppStickyFilterChrome>
        ) : null}
        <div
          className={cn(
            "min-w-0 overflow-hidden",
            flushTop && !hasToolbar && "rounded-t-lg",
            "rounded-b-lg",
          )}
        >
          {children}
        </div>
      </div>
    </AppSection>
  );
}
