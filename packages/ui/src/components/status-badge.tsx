import {
  ACTIVE_STATE_LABELS_VI,
  ATTENDANCE_STATUS_LABELS_VI,
  CONSUMPTION_REPORT_STATUS_LABELS_VI,
  COUNT_SLIP_STATUS_LABELS_VI,
  EXPENSE_PAYMENT_STATE_LABELS_VI,
  INVENTORY_STATUS_LABELS_VI,
  LEAVE_REQUEST_STATUS_LABELS_VI,
  ORDER_ITEM_STATUS_LABELS_VI,
  ORDER_PAYMENT_STATUS_LABELS_VI,
  ORDER_STATUS_LABELS_VI,
  PAYROLL_PERIOD_STATUS_LABELS_VI,
  PROMOTION_CODE_STATUS_LABELS_VI,
  PROMOTION_STATUS_LABELS_VI,
  PAYMENT_RECORD_STATUS_LABELS_VI,
  PRINT_JOB_STATUS_LABELS_VI,
  PURCHASE_ORDER_STATUS_LABELS_VI,
  REFUND_STATUS_LABELS_VI,
  TABLE_STATUS_LABELS_VI,
  TAX_INVOICE_STATUS_LABELS_VI,
  UNKNOWN_LABEL_VI,
  WORK_TASK_STATUS_LABELS_VI,
} from "@comtammatu/shared/labels";
import { Badge, type BadgeProps } from "./badge";
import { cn } from "../lib/utils";

type BadgeVariant = NonNullable<BadgeProps["variant"]>;

type DomainConfig = {
  labels: Record<string, string>;
  variants: Record<string, BadgeVariant>;
  fallbackVariant?: BadgeVariant;
  dots?: Record<string, string>;
};

const STATUS_DOMAINS = {
  "active-state": {
    labels: ACTIVE_STATE_LABELS_VI,
    variants: {
      active: "success",
      inactive: "secondary",
    },
  },
  order: {
    labels: ORDER_STATUS_LABELS_VI,
    variants: {
      new: "info",
      confirmed: "secondary",
      preparing: "warning",
      ready: "success",
      served: "success",
      completed: "secondary",
      cancelled: "destructive",
    },
  },
  "order-item": {
    labels: ORDER_ITEM_STATUS_LABELS_VI,
    variants: {
      pending: "warning",
      preparing: "warning",
      ready: "success",
      served: "success",
      cancelled: "destructive",
    },
  },
  "order-payment": {
    labels: ORDER_PAYMENT_STATUS_LABELS_VI,
    variants: {
      unpaid: "outline",
      pending: "warning",
      paid: "success",
    },
  },
  payment: {
    labels: PAYMENT_RECORD_STATUS_LABELS_VI,
    variants: {
      pending: "warning",
      completed: "success",
      failed: "destructive",
      refunded: "secondary",
    },
  },
  "expense-payment": {
    labels: EXPENSE_PAYMENT_STATE_LABELS_VI,
    variants: {
      unpaid: "warning",
      cash_paid: "secondary",
      transfer_paid: "secondary",
      transfer_matched: "success",
      transfer_needs_match: "warning",
    },
  },
  refund: {
    labels: REFUND_STATUS_LABELS_VI,
    variants: {
      pending: "warning",
      approved: "success",
      rejected: "destructive",
    },
  },
  table: {
    labels: TABLE_STATUS_LABELS_VI,
    variants: {
      available: "success",
      occupied: "secondary",
      reserved: "outline",
      maintenance: "destructive",
    },
  },
  "print-job": {
    labels: PRINT_JOB_STATUS_LABELS_VI,
    variants: {
      pending: "outline",
      processing: "secondary",
      printed: "success",
      failed: "destructive",
      expired: "warning",
      cancelled: "outline",
    },
  },
  "tax-invoice": {
    labels: TAX_INVOICE_STATUS_LABELS_VI,
    variants: {
      draft: "secondary",
      signing: "outline",
      submitted: "outline",
      issued: "success",
      cancelled: "destructive",
      replaced: "secondary",
      not_required: "secondary",
    },
  },
  attendance: {
    labels: ATTENDANCE_STATUS_LABELS_VI,
    variants: {
      present: "default",
      late: "outline",
      absent: "destructive",
      half_day: "secondary",
      checked_out: "default",
      in_shift: "secondary",
      stale_open: "destructive",
      scheduled: "info",
      day_off: "secondary",
    },
    dots: {
      present: "bg-success",
      late: "bg-warning",
      absent: "bg-destructive",
      half_day: "bg-info",
      scheduled: "bg-info",
      day_off: "bg-muted-foreground",
    },
  },
  "leave-request": {
    labels: LEAVE_REQUEST_STATUS_LABELS_VI,
    variants: {
      pending: "warning",
      approved: "success",
      rejected: "destructive",
      cancelled: "secondary",
    },
  },
  "payroll-period": {
    labels: PAYROLL_PERIOD_STATUS_LABELS_VI,
    variants: {
      draft: "secondary",
      calculated: "outline",
      approved: "default",
      paid: "default",
    },
  },
  "consumption-report": {
    labels: CONSUMPTION_REPORT_STATUS_LABELS_VI,
    variants: {
      draft: "secondary",
      submitted: "warning",
      needs_changes: "destructive",
      approved: "success",
      applied: "success",
      cancelled: "secondary",
    },
  },
  "count-slip": {
    labels: COUNT_SLIP_STATUS_LABELS_VI,
    variants: {
      submitted: "warning",
      needs_changes: "destructive",
      approved: "success",
    },
  },
  inventory: {
    labels: INVENTORY_STATUS_LABELS_VI,
    fallbackVariant: "secondary",
    variants: {
      draft: "secondary",
      confirmed: "success",
      sent: "info",
      credited: "success",
      refunded: "success",
      partially_received: "warning",
      in_transit: "info",
      confirmed_ship: "info",
      confirmed_receive: "warning",
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
      write_off: "destructive",
      consumption: "success",
      storage_loss: "warning",
      sale_consumption: "success",
      normal: "success",
      low: "warning",
      out: "destructive",
      over: "warning",
      active: "success",
      suspended: "secondary",
    },
  },
  "purchase-order": {
    labels: PURCHASE_ORDER_STATUS_LABELS_VI,
    fallbackVariant: "secondary",
    variants: {
      draft: "secondary",
      sent: "success",
      pending_approval: "warning",
      changes_requested: "destructive",
      approved: "success",
      partially_received: "warning",
      received: "success",
      closed: "secondary",
      cancelled: "destructive",
    },
  },
  "expiry-urgency": {
    labels: INVENTORY_STATUS_LABELS_VI,
    variants: {
      expired: "destructive",
      critical: "destructive",
      warning: "warning",
    },
  },
  promotion: {
    labels: PROMOTION_STATUS_LABELS_VI,
    fallbackVariant: "secondary",
    variants: {
      draft: "secondary",
      active: "success",
      paused: "warning",
      ended: "outline",
    },
  },
  "promotion-code": {
    labels: PROMOTION_CODE_STATUS_LABELS_VI,
    fallbackVariant: "outline",
    variants: {
      active: "success",
      redeemed: "secondary",
      void: "outline",
    },
  },
  "work-task": {
    labels: WORK_TASK_STATUS_LABELS_VI,
    fallbackVariant: "secondary",
    variants: {
      backlog: "secondary",
      todo: "secondary",
      in_progress: "info",
      review: "warning",
      done: "success",
      canceled: "destructive",
    },
  },
} satisfies Record<string, DomainConfig>;

export type StatusDomain = keyof typeof STATUS_DOMAINS;

export function getStatusBadgeMeta(
  domain: StatusDomain,
  value: string,
): { label: string; variant: BadgeVariant } {
  const config: DomainConfig = STATUS_DOMAINS[domain];
  return {
    label: config.labels[value] ?? UNKNOWN_LABEL_VI,
    variant: config.variants[value] ?? config.fallbackVariant ?? "outline",
  };
}

export function getStatusDotClassName(
  domain: StatusDomain,
  value: string,
): string {
  const config: DomainConfig = STATUS_DOMAINS[domain];
  return config.dots?.[value] ?? "bg-muted-foreground";
}

export function StatusBadge({
  domain,
  value,
  label,
  className,
  size = "default",
}: {
  domain: StatusDomain;
  value: string;
  label?: string;
  className?: string;
  size?: "sm" | "default";
}) {
  const meta = getStatusBadgeMeta(domain, value);
  return (
    <Badge
      variant={meta.variant}
      className={cn(size === "sm" && "text-xs", className)}
      data-slot="status-badge"
      data-domain={domain}
      data-status={value}
    >
      {label ?? meta.label}
    </Badge>
  );
}
