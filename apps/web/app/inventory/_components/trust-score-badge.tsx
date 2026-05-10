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
      label: "Đỉnh cao",
      tone: "border-tier-elite/40 bg-tier-elite/10 text-tier-elite",
      Icon: IconShieldCheck,
      tooltip:
        "≥ 85 — cao nhất. Bất kỳ sự cố nào cũng kéo xuống 85 theo §Q4b.",
    };
  }
  if (score >= 70) {
    return {
      key: "trusted" as const,
      label: "Đã tin cậy",
      tone: "border-success/40 bg-success/10 text-success",
      Icon: IconShieldHalf,
      tooltip:
        "≥ 70 — đủ điều kiện tự duyệt phiếu nhập (cổng c8). Bảo toàn khi không có sự cố.",
    };
  }
  if (score >= 50) {
    return {
      key: "bootstrap" as const,
      label: "Đang đánh giá",
      tone: "border-info/40 bg-info/10 text-info",
      Icon: IconShield,
      tooltip:
        "Khởi động 50–69 — cần ≥ 20 phiếu nhập sạch trong 60 ngày để lên Đã tin cậy.",
    };
  }
  return {
    key: "at_risk" as const,
    label: "Có rủi ro",
    tone: "border-destructive/40 bg-destructive/10 text-destructive",
    Icon: IconShieldX,
    tooltip: "< 50 — có sự cố gần đây, cần cân nhắc trước khi duyệt.",
  };
}
