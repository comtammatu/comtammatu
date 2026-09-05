"use client";

import Link from "next/link";
import {
  KpiCard as CanonicalKpiCard,
  type KpiCardProps as CanonicalKpiCardProps,
  type KpiTone,
  type KpiCardLinkProps,
} from "@comtammatu/ui/components/kpi-card";
import { TrendSparkline, type TrendPoint } from "./trend-sparkline";

export type { KpiTone, KpiCardLinkProps };

export interface KpiCardProps
  extends Omit<CanonicalKpiCardProps, "renderLink" | "sparklineNode"> {
  /** Optional sparkline series (≤30 points typical) */
  sparkline?: TrendPoint[];
  /** Sparkline screen-reader description */
  sparklineLabel?: string;
}

export function KpiCard({
  label,
  tone = "neutral",
  sparkline,
  sparklineLabel,
  ...props
}: KpiCardProps) {
  const sparklineNode =
    sparkline && sparkline.length > 0 ? (
      <TrendSparkline
        data={sparkline}
        ariaLabel={sparklineLabel ?? `Xu hướng ${label}`}
        tone={
          tone === "destructive"
            ? "destructive"
            : tone === "warning"
              ? "warning"
              : tone === "success"
                ? "success"
                : "primary"
        }
      />
    ) : undefined;

  return (
    <CanonicalKpiCard
      label={label}
      tone={tone}
      sparklineNode={sparklineNode}
      renderLink={({ href, className, "aria-label": ariaLabel, children }) => (
        <Link href={href} className={className} aria-label={ariaLabel}>
          {children}
        </Link>
      )}
      {...props}
    />
  );
}
