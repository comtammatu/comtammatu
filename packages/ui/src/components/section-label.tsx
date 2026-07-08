import type { ReactNode } from "react";
import { cn } from "../lib/utils";

export type SectionLabelDensity = "default" | "dense";

export interface SectionLabelProps {
  children: ReactNode;
  /**
   * "default" = text-xs tracking-wide (page/section eyebrow).
   * "dense" = text-2xs tracking-wider (KDS chrome, audit row meta, dense grids).
   * Both emit font-medium uppercase text-muted-foreground per design-system.md
   * § Rhythm B (Panel / field / section uppercase label role).
   */
  density?: SectionLabelDensity;
  className?: string;
}

/**
 * Renders the locked eyebrow small-caps role (design-system.md § Rhythm B).
 * Use for panel / field / section uppercase labels. Do NOT use for page-header
 * eyebrow (owned by AppPageHeader.eyebrow) or table column headers (TableHead).
 */
export function SectionLabel({
  children,
  density = "default",
  className,
}: SectionLabelProps) {
  return (
    <div
      className={cn(
        "font-medium uppercase",
        density === "dense"
          ? "text-2xs tracking-wider text-muted-foreground"
          : "text-xs tracking-wide text-muted-foreground",
        className,
      )}
    >
      {children}
    </div>
  );
}
