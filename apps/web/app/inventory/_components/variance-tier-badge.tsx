"use client";

import { Badge } from "@comtammatu/ui/components/badge";
import { cn } from "@comtammatu/ui";
import {
  VARIANCE_TIER_LABELS_VI,
  VARIANCE_TIER_HINT_VI,
  BASELINE_SOURCE_LABELS_VI,
} from "@comtammatu/shared/labels";

type VarianceTier = 0 | 1 | 2 | 3;

type BaselineSource = "same_supplier" | "any_supplier" | "none" | "paused";

interface VarianceTierBadgeProps {
  /** variance_tier column from grn_items (null → no badge). */
  tier: number | null | undefined;
  /** baseline_source for tooltip context. */
  baselineSource?: BaselineSource | string | null;
  /** Signed variance pct (e.g. -23.5) for inline display. */
  variancePct?: number | null;
  /** is_hard_blocked flag — forces tier 3 visual even if tier=null. */
  isHardBlocked?: boolean;
  /** Render compact (no label, only dot). */
  compact?: boolean;
  className?: string;
}

/**
 * GRN line variance tier pill (S10).
 * Tier 0: no visible badge (return null unless hard blocked).
 * Tier 1: yellow confirm hint.
 * Tier 2: orange note + override code required.
 * Tier 3: red hardblock — requires QLV override dialog.
 *
 * Special state: `baseline_source === 'paused'` → gray "tạm dừng" pill
 * (30d post-hardblock-override pause — do NOT treat as tier 3).
 */
export function VarianceTierBadge({
  tier,
  baselineSource,
  variancePct,
  isHardBlocked,
  compact,
  className,
}: VarianceTierBadgeProps) {
  if (baselineSource === "paused") {
    return (
      <Badge
        variant="outline"
        className={cn("border-muted-foreground/40 text-muted-foreground", className)}
        data-slot="variance-tier-badge"
        data-source="paused"
      >
        {compact ? "Pause" : `Baseline tạm dừng`}
      </Badge>
    );
  }

  if (baselineSource === "none" && tier === null) {
    return (
      <Badge
        variant="outline"
        className={cn("border-muted-foreground/40 text-muted-foreground", className)}
        data-slot="variance-tier-badge"
        data-source="none"
      >
        {compact ? "?" : "Chưa đủ lịch sử"}
      </Badge>
    );
  }

  const resolvedTier: VarianceTier | null = (() => {
    if (isHardBlocked) return 3;
    if (tier === 0 || tier === 1 || tier === 2 || tier === 3) return tier;
    return null;
  })();

  if (resolvedTier === null || resolvedTier === 0) {
    return null;
  }

  const tone = {
    1: "bg-warning/15 text-warning-foreground border-warning/40",
    2: "bg-tier-note/15 text-tier-note-foreground border-tier-note/40",
    3: "bg-destructive/15 text-destructive border-destructive/50",
  }[resolvedTier];

  const label = VARIANCE_TIER_LABELS_VI[resolvedTier];
  const hint = VARIANCE_TIER_HINT_VI[resolvedTier];
  const pctStr =
    typeof variancePct === "number" && Number.isFinite(variancePct)
      ? `${variancePct > 0 ? "+" : ""}${variancePct.toFixed(1)}%`
      : null;

  return (
    <Badge
      variant="outline"
      className={cn("border", tone, className)}
      data-slot="variance-tier-badge"
      data-tier={resolvedTier}
      data-source={baselineSource ?? undefined}
      title={hint + (baselineSource ? ` • ${labelSource(baselineSource)}` : "")}
    >
      {compact ? `T${resolvedTier}` : label}
      {pctStr && !compact ? ` ${pctStr}` : null}
    </Badge>
  );
}

function labelSource(source: string): string {
  return (
    (BASELINE_SOURCE_LABELS_VI as Record<string, string>)[source] ?? source
  );
}
