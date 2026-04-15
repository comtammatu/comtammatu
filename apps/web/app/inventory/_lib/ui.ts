import type { BadgeProps } from "@comtammatu/ui/components/badge";
import { tStatus } from "./dictionary";

export type InventorySemanticColor =
  | "primary"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "muted";

const INVENTORY_COLOR_VALUE: Record<InventorySemanticColor, string> = {
  primary: "var(--primary)",
  success: "var(--success)",
  warning: "var(--warning)",
  danger: "var(--destructive)",
  info: "var(--info)",
  muted: "var(--muted-foreground)",
};

export function resolveInventoryColorValue(
  color: InventorySemanticColor | string,
) {
  return color in INVENTORY_COLOR_VALUE
    ? INVENTORY_COLOR_VALUE[color as InventorySemanticColor]
    : color;
}

const STATUS_BADGE_VARIANTS: Record<string, BadgeProps["variant"]> = {
  draft: "secondary",
  confirmed: "success",
  sent: "info",
  partially_received: "warning",
  in_transit: "info",
  received: "success",
  completed: "success",
  cancelled: "destructive",
  pending: "warning",
  in_progress: "info",
  matched: "success",
  discrepancy: "destructive",
  approved: "success",
  overdue: "destructive",
  unpaid: "warning",
  partial: "info",
  paid: "success",
  expired: "destructive",
  critical: "warning",
  warning: "warning",
  kitchen_use: "info",
  write_off: "destructive",
  consumption: "success",
  normal: "success",
  low: "destructive",
  out: "destructive",
  over: "warning",
  active: "success",
  suspended: "secondary",
};

export function getInventoryStatusLabel(status: string, label?: string) {
  return label ?? tStatus(status, "badge");
}

export function getInventoryStatusBadgeVariant(
  status: string,
): BadgeProps["variant"] {
  return STATUS_BADGE_VARIANTS[status] ?? "secondary";
}
