"use client";

import type { ReactNode } from "react";
import { ChevronRight as IconChevronRight } from "lucide-react";
import { InteractiveCard } from "@comtammatu/ui/components/interactive-card";

export interface TeamMemberTileProps {
  /** Heading line — typically the employee full name. */
  name: string;
  /** Subtitle — position/shift/role context. */
  subtitle: string;
  /** Optional secondary subtitle, e.g. employee code. */
  secondarySubtitle?: string;
  /** Optional avatar; required for `layout="grid"`. */
  avatar?: ReactNode;
  /** Status badge row rendered on the trailing edge (row) or under the title (grid). */
  badges?: ReactNode;
  /** Secondary badges rendered on the footer line of a row tile (count/leave, etc.). */
  footerBadges?: ReactNode;
  /** A11y label for the tile trigger. */
  ariaLabel?: string;
  layout?: "row" | "grid";
  className?: string;
  onSelect: () => void;
}

/**
 * Single touch card for team members. Two presentation modes share one frame,
 * density, and touch target so the team hub keeps one card vocabulary.
 * - `row` (default): horizontal, badges on the trailing edge, chevron affordance.
 * - `grid`: avatar-centered, used inside a multi-column member grid.
 */
export function TeamMemberTile({
  name,
  subtitle,
  secondarySubtitle,
  avatar,
  badges,
  footerBadges,
  ariaLabel,
  layout = "row",
  className,
  onSelect,
}: TeamMemberTileProps) {
  if (layout === "grid") {
    return (
      <InteractiveCard
        minHeight="tap"
        padding="compact"
        className={`h-full min-h-24 flex-col justify-center text-center ${className ?? ""}`}
        render={
          <button
            type="button"
            className="w-full"
            onClick={onSelect}
            aria-label={ariaLabel ?? `Mở hồ sơ ${name}`}
          />
        }
      >
        {avatar}
        <div className="grid min-w-0 gap-1">
          <p className="truncate text-sm font-semibold leading-5">{name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {secondarySubtitle ?? subtitle}
          </p>
        </div>
        {badges ? (
          <div className="flex flex-wrap justify-center gap-1">{badges}</div>
        ) : null}
      </InteractiveCard>
    );
  }

  return (
    <InteractiveCard
      minHeight="tap"
      padding="compact"
      className={`h-auto touch-manipulation select-none text-left ${className ?? ""}`}
      render={
        <button type="button" onClick={onSelect} aria-label={ariaLabel} />
      }
    >
      <div className="pointer-events-none flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex min-w-0 items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{name}</p>
            <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
          </div>
          {badges}
        </div>
        {footerBadges ? (
          <div className="flex flex-wrap gap-1.5">{footerBadges}</div>
        ) : null}
      </div>
      <IconChevronRight
        aria-hidden="true"
        className="pointer-events-none size-4 shrink-0 text-muted-foreground"
      />
    </InteractiveCard>
  );
}
