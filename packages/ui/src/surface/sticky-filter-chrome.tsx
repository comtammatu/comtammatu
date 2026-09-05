"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "../lib/utils";

/**
 * Sticky LIST filter/toolbar chrome inside the control_surface shell scrollport.
 * Use for page-level filters that are not already in AppListFrame's toolbar
 * slot. Do not use above KPI/dashboard cards — stuck chrome crushes the next
 * section while scrolling.
 *
 * Negative `top` cancels control_surface shell `pt-3 md:pt-4`: sticky `top-0`
 * pins to the scrollport content edge (below the pad), so rows scroll into the
 * pad gap and read as above the filter. Negative top pins flush to the inset
 * panel top. `top` only affects the sticky threshold — resting in-flow position
 * is unchanged.
 */
export const APP_PAGE_STICKY_FILTER_CLASSNAME =
  "sticky top-[-0.75rem] z-20 bg-background md:top-[-1rem]";

/**
 * Cancels control_surface shell horizontal pad (`px-3 md:px-4`) when LIST filter
 * chrome is stuck, so the bar flushes to the inset panel edges. Pair with
 * `data-stuck` from `AppStickyFilterChrome` — do not apply while resting inside
 * the LIST card. Top pad is cancelled via negative sticky `top` on
 * `APP_PAGE_STICKY_FILTER_CLASSNAME` (not `-mt`, which flickers the stuck observer).
 */
export const APP_PAGE_STICKY_FILTER_SHELL_BLEED_CLASSNAME = [
  // Do not use w-full with -mx bleed: width:100% keeps the border box at the
  // parent width so the background never reaches the panel edge.
  "in-[[data-control-surface-scroll]]:w-[calc(100%+1.5rem)] in-[[data-control-surface-scroll]]:md:w-[calc(100%+2rem)]",
  "in-[[data-control-surface-scroll]]:-mx-3 in-[[data-control-surface-scroll]]:md:-mx-4",
].join(" ");

/**
 * Sticky LIST filter surface with stuck-state shell bleed. Resting: sits inside
 * the LIST card. Stuck: pins to the control_surface shell scrollport top, drops
 * side inset, and elevates over scrolling rows.
 */
export function AppStickyFilterChrome({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const root = sentinel.closest("[data-control-surface-scroll]");
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        setStuck(!entry.isIntersecting);
      },
      { root, threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <div
        ref={sentinelRef}
        aria-hidden
        className="pointer-events-none h-px w-full shrink-0"
      />
      <div
        data-stuck={stuck ? "true" : undefined}
        className={cn(
          APP_PAGE_STICKY_FILTER_CLASSNAME,
          // Match the LIST card surface when covering scrolling rows.
          // No transition: stuck width/margin bleed is layout; animating it
          // inflates the DataTable toolbar on scroll (forbidden on hot paths).
          "bg-card",
          className,
          // Stuck overrides caller radius / clip (flush LIST passes
          // overflow-hidden rounded-t-lg at rest so bg follows Card corners).
          stuck
            ? [
                APP_PAGE_STICKY_FILTER_SHELL_BLEED_CLASSNAME,
                "overflow-visible rounded-none shadow-lg",
              ]
            : null,
        )}
      >
        {children}
      </div>
    </>
  );
}

export const StickyFilterChrome = AppStickyFilterChrome;
