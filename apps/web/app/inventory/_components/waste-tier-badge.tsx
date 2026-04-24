"use client";

import { Badge } from "@comtammatu/ui/components/badge";
import { cn } from "@comtammatu/ui";
import { WASTE_TIER_LABELS_VI } from "@comtammatu/shared/labels";

type WasteTier = 0 | 1 | 2;

interface WasteTierBadgeProps {
  /** 0 = no gate, 1 = photo required, 2 = photo + approval */
  tier: number | null | undefined;
  photoRequired?: boolean;
  approvalRequired?: boolean;
  compact?: boolean;
  className?: string;
}

/**
 * Waste tier pill (S11).
 * Tier 0: no badge.
 * Tier 1: yellow "Cần ảnh".
 * Tier 2: orange "Cần duyệt" (auto-pending approval).
 */
export function WasteTierBadge({
  tier,
  photoRequired,
  approvalRequired,
  compact,
  className,
}: WasteTierBadgeProps) {
  const resolved: WasteTier | null =
    tier === 0 || tier === 1 || tier === 2 ? tier : null;

  if (resolved === null || resolved === 0) {
    return null;
  }

  const tone = {
    1: "bg-yellow-100 text-yellow-900 border-yellow-300",
    2: "bg-orange-100 text-orange-900 border-orange-300",
  }[resolved];

  const label = WASTE_TIER_LABELS_VI[resolved];

  const tooltip = [
    photoRequired ? "Ảnh bắt buộc" : null,
    approvalRequired ? "Cần duyệt QLV" : null,
  ]
    .filter(Boolean)
    .join(" • ");

  return (
    <Badge
      variant="outline"
      className={cn("border", tone, className)}
      data-slot="waste-tier-badge"
      data-tier={resolved}
      title={tooltip || undefined}
    >
      {compact ? `T${resolved}` : label}
    </Badge>
  );
}
