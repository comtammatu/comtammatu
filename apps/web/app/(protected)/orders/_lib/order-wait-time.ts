import { ORDERS_COPY } from "../orders-copy";

export type OrderAlertLevel = "normal" | "warning" | "critical";

export interface OrderWaitInfo {
  waitMinutes: number;
  alertLevel: OrderAlertLevel;
  isKdsCompleted: boolean;
  kdsCompletedAt: string | null;
}

/**
 * Calculates wait duration in minutes from creation until KDS completion (or current time if active).
 */
export function computeOrderWaitInfo(
  createdAt: string,
  kdsCompletedAt?: string | null,
  referenceTimeMs?: number,
): OrderWaitInfo {
  const startMs = Date.parse(createdAt);
  const isKdsCompleted = Boolean(kdsCompletedAt);
  const endMs =
    isKdsCompleted && kdsCompletedAt
      ? Date.parse(kdsCompletedAt)
      : (referenceTimeMs ?? Date.now());

  const diffMinutes =
    Number.isNaN(startMs) || Number.isNaN(endMs)
      ? 0
      : Math.max(0, Math.floor((endMs - startMs) / 60000));

  let alertLevel: OrderAlertLevel = "normal";
  if (diffMinutes > 15) {
    alertLevel = "critical";
  } else if (diffMinutes > 10) {
    alertLevel = "warning";
  }

  return {
    waitMinutes: diffMinutes,
    alertLevel,
    isKdsCompleted,
    kdsCompletedAt: kdsCompletedAt ?? null,
  };
}

export function getOrderAlertBadgeProps(waitInfo: OrderWaitInfo): {
  label: string;
  badgeVariant: "outline" | "secondary" | "warning" | "destructive";
  badgeClassName: string;
} {
  const { waitMinutes, alertLevel, isKdsCompleted } = waitInfo;
  const statusSuffix = isKdsCompleted ? "" : ORDERS_COPY.waitingSuffix;

  switch (alertLevel) {
    case "critical":
      return {
        label: ORDERS_COPY.badgeCritical(waitMinutes, statusSuffix),
        badgeVariant: "destructive",
        badgeClassName:
          "border-destructive/20 bg-destructive text-destructive-foreground font-semibold shadow-xs animate-pulse",
      };
    case "warning":
      return {
        label: ORDERS_COPY.badgeWarning(waitMinutes, statusSuffix),
        badgeVariant: "warning",
        badgeClassName:
          "border-warning/20 bg-warning/15 text-warning font-medium",
      };
    case "normal":
    default:
      return {
        label: ORDERS_COPY.badgeNormal(waitMinutes, statusSuffix),
        badgeVariant: "outline",
        badgeClassName: "text-muted-foreground font-mono text-xs",
      };
  }
}
