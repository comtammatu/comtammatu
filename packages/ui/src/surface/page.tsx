"use client";

import { createContext, useContext, type ReactNode } from "react";
import { cn } from "../lib/utils";
import type { SurfaceWidth } from "./types";
export type { SurfaceWidth } from "./types";

// `xwide` is the one named exception to the arbitrary-dimension ban
// (design-system.md § Rhythm Contract / app-arbitrary-sizing gate): a single
// capped tier for dense data-table/list pages on wide desktop viewports, so
// the 1600px value lives in exactly one place instead of per-page overrides.
const PAGE_WIDTH_CLASSNAME: Record<SurfaceWidth, string> = {
  narrow: "max-w-xl",
  default: "max-w-5xl",
  wide: "max-w-7xl",
  xwide: "max-w-[1600px]",
  full: "max-w-none",
};

// Page-padding ownership (design-system.md § E): outer page padding is applied
// once and never compounds. `padded` marks an ancestor that already applied the
// page padding (AppShell main or another AppPage); `constrained` marks an
// ancestor AppPage that already applied the centered max-width. A nested AppPage
// reads these and drops whatever an ancestor already owns.
type SurfaceNesting = { padded: boolean; constrained: boolean };

const SURFACE_NESTING_NONE: SurfaceNesting = {
  padded: false,
  constrained: false,
};
const SURFACE_NESTING_SHELL: SurfaceNesting = {
  padded: true,
  constrained: false,
};
const SURFACE_NESTING_PAGE: SurfaceNesting = {
  padded: true,
  constrained: true,
};

const SurfaceNestingContext =
  createContext<SurfaceNesting>(SURFACE_NESTING_NONE);

/**
 * Marks the AppShell main region as the owner of the Management frame padding so
 * a nested AppPage drops its own padding (keeping its centered max-width). Keeps
 * page padding from compounding into the double-padding the audit flagged.
 */
export function AppShellPaddingBoundary({ children }: { children: ReactNode }) {
  return (
    <SurfaceNestingContext.Provider value={SURFACE_NESTING_SHELL}>
      {children}
    </SurfaceNestingContext.Provider>
  );
}

/**
 * Cancels Owner shell mobile `pb-24` so a sticky CTA can dock above the bottom
 * nav. Desktop shell uses `lg:pb-0`, so no lg negative margin is required.
 */
export const APP_PAGE_STICKY_FOOTER_SHELL_BLEED_CLASSNAME =
  "in-[[data-control-surface-scroll]]:-mb-24 in-[[data-control-surface-scroll]]:lg:mb-0";

export type AppPageProps = {
  children: ReactNode;
  /**
   * Full-width slot below the width-constrained body. Use for sticky
   * `AppDetailFooter` so the CTA can bleed to Owner shell panel edges
   * instead of sitting inside the centered max-width column.
   */
  footer?: ReactNode;
  as?: "div" | "main";
  id?: string;
  tabIndex?: -1;
  className?: string;
  contentClassName?: string;
  scroll?: boolean;
  width?: SurfaceWidth;
  padded?: boolean;
  density?: "comfortable" | "compact";
  mobile?: boolean;
};

export function AppPage({
  children,
  footer,
  as = "div",
  id,
  tabIndex,
  className,
  contentClassName,
  scroll = false,
  width = "wide",
  padded = true,
  density = "comfortable",
  mobile = false,
}: AppPageProps) {
  const Root = as;
  const isCompact = density === "compact";
  const nesting = useContext(SurfaceNestingContext);
  const applyPadding = padded && !nesting.padded;
  const applyMaxWidth = !nesting.constrained;
  // Owner shell already owns the scrollport. A second overflow-auto here
  // steals sticky containing-block from LIST filters and lets the inset
  // panel chrome scroll away.
  const applyInnerScroll = scroll && !nesting.padded;
  return (
    <SurfaceNestingContext.Provider value={SURFACE_NESTING_PAGE}>
      <Root
        id={id}
        tabIndex={tabIndex}
        className={cn(
          "min-h-0 flex-1",
          applyInnerScroll ? "no-scrollbar overflow-auto" : "overflow-visible",
          applyPadding && (isCompact ? "p-3" : "p-4"),
          // Owner shell child is flex-1; grow and push `footer` to the panel
          // bottom when the body is short. Sticky still pins while scrolling.
          footer != null && "flex flex-col in-[[data-control-surface-scroll]]:flex-1",
          footer != null ? APP_PAGE_STICKY_FOOTER_SHELL_BLEED_CLASSNAME : null,
          className,
        )}
      >
        <div
          className={cn(
            "mx-auto flex w-full flex-col",
            isCompact ? "gap-3" : "gap-4",
            applyMaxWidth
              ? mobile
                ? "max-w-2xl"
                : PAGE_WIDTH_CLASSNAME[width]
              : "max-w-none",
            contentClassName,
          )}
        >
          {children}
        </div>
        {footer != null ? (
          <div className="mt-auto w-full shrink-0">{footer}</div>
        ) : null}
      </Root>
    </SurfaceNestingContext.Provider>
  );
}

export const PageFrame = AppPage;
export type PageFrameProps = AppPageProps;

export type BranchOperatorPageProps = AppPageProps;
export const BranchOperatorPage = AppPage;
export type EmployeePageProps = AppPageProps;
export const EmployeePage = AppPage;
export type PublicPageProps = AppPageProps;
export const PublicPage = AppPage;
export type StationPageProps = AppPageProps;
export const StationPage = AppPage;
