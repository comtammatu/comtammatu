"use client";

import { cn } from "@comtammatu/ui";
import { Badge } from "@comtammatu/ui/components/badge";
import { ShieldCheck as IconShieldCheck, ShieldHalf as IconShieldHalf, ShieldX as IconShieldX, Shield as IconShield } from "lucide-react";

interface TrustScoreBadgeProps {
  score: number;
  /** Override the stored score with a freshly-computed one when available. */
  computedScore?: number | null;
  /** Render a compact variant — just the tier pill without the numeric. */
  compact?: boolean;
  /** Add tooltip describing the auto-approve threshold context. */
  withTooltip?: boolean;
  className?: string;
}

/**
 * Trust score visualization (S15-min).
 *
 * Tier thresholds per spec §Q4b:
 *   ≥ 85  Elite  — capped; any incident this period drops to 85
 *   ≥ 70  Trusted — qualifies for GRN auto-approve (c8 gate)
 *   ≥ 50  Bootstrap (warmup) — default starting state
 *   < 50  At risk — recent incidents or low GRN activity
 */
export function TrustScoreBadge({
  score,
  computedScore,
  compact,
  withTooltip,
  className,
}: TrustScoreBadgeProps) {
  const effective = typeof computedScore === "number" ? computedScore : score;
  const tier = tierOf(effective);

  return (
    <Badge
      variant="outline"
      data-slot="trust-score-badge"
      data-tier={tier.key}
      title={withTooltip ? tier.tooltip : undefined}
      className={cn(
        "gap-1 border font-medium tabular-nums",
        tier.tone,
        className,
      )}
    >
      <tier.Icon className="size-3.5" />
      {compact ? (
        <span>{tier.label}</span>
      ) : (
        <>
          <span>{tier.label}</span>
          <span>{Math.round(effective)}</span>
        </>
      )}
    </Badge>
  );
}

function tierOf(score: number) {
  if (score >= 85) {
    return {
      key: "elite" as const,
      label: "Elite",
      tone: "border-purple-300 bg-purple-50 text-purple-900",
      Icon: IconShieldCheck,
      tooltip:
        "≥ 85 — cao nhất. Bất kỳ incident nào cũng kéo xuống 85 theo §Q4b.",
    };
  }
  if (score >= 70) {
    return {
      key: "trusted" as const,
      label: "Trusted",
      tone: "border-green-300 bg-green-50 text-green-900",
      Icon: IconShieldHalf,
      tooltip:
        "≥ 70 — đủ điều kiện auto-approve GRN (cổng c8). Bảo toàn khi không có incident.",
    };
  }
  if (score >= 50) {
    return {
      key: "bootstrap" as const,
      label: "Bootstrap",
      tone: "border-blue-300 bg-blue-50 text-blue-900",
      Icon: IconShield,
      tooltip:
        "Warmup 50-69 — cần ≥ 20 GRN sạch trong 60 ngày để lên Trusted.",
    };
  }
  return {
    key: "at_risk" as const,
    label: "At risk",
    tone: "border-red-300 bg-red-50 text-red-900",
    Icon: IconShieldX,
    tooltip: "< 50 — có incident gần đây, cần cân nhắc trước khi approve.",
  };
}
