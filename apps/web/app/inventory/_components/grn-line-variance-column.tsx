"use client";

import { cn } from "@comtammatu/ui";
import { VarianceTierBadge } from "./variance-tier-badge";
import { HardblockOverrideDialog } from "./hardblock-override-dialog";

/**
 * Shape that any GRN line must expose to render the variance column.
 * Populated from `grn_items` variance additions:
 *   - variance_tier, baseline_source, baseline_variance_pct,
 *     is_hard_blocked, baseline_sample_n.
 * Additive — if fields absent, component renders nothing.
 */
export interface GrnLineWithVariance {
  /** Database PK grn_items.id (not lineId string from client state) */
  grnItemId?: number | null;
  varianceTier?: number | null;
  baselineSource?: string | null;
  baselineVariancePct?: number | null;
  baselineSampleN?: number | null;
  isHardBlocked?: boolean;
}

interface GrnLineVarianceColumnProps {
  line: GrnLineWithVariance;
  /** tenantId for storage upload path in override dialog */
  tenantId: number;
  /** Whether current user holds inventory:grn_hardblock_override.
   *  Server-side check: parent page should pass this prop from claims. */
  canHardblockOverride?: boolean;
  onOverrideSuccess?: () => void;
  className?: string;
}

/**
 * Inline variance pill + optional hardblock override button,
 * designed to drop into an existing GRN line row cell.
 *
 * Renders nothing when `varianceTier` is null/undefined AND
 * `baselineSource` is not 'paused'/'none' (e.g. legacy rows
 * before variance trigger was installed).
 */
export function GrnLineVarianceColumn({
  line,
  tenantId,
  canHardblockOverride,
  onOverrideSuccess,
  className,
}: GrnLineVarianceColumnProps) {
  const showBadge =
    line.varianceTier !== null ||
    line.baselineSource === "paused" ||
    line.baselineSource === "none" ||
    line.isHardBlocked;

  if (!showBadge) return null;

  const showOverride =
    Boolean(line.isHardBlocked) &&
    line.grnItemId !== null &&
    line.grnItemId !== undefined &&
    canHardblockOverride;

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <VarianceTierBadge
        tier={line.varianceTier ?? null}
        baselineSource={line.baselineSource ?? undefined}
        variancePct={line.baselineVariancePct ?? null}
        isHardBlocked={line.isHardBlocked}
      />
      {showOverride && line.grnItemId ? (
        <HardblockOverrideDialog
          grnItemId={line.grnItemId}
          tenantId={tenantId}
          variancePct={line.baselineVariancePct ?? null}
          onSuccess={onOverrideSuccess}
          triggerLabel="Duyệt vượt"
        />
      ) : null}
    </div>
  );
}
