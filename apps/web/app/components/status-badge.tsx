import {
  ATTENDANCE_STATUS_LABELS_VI,
  CONSUMPTION_REPORT_STATUS_LABELS_VI,
  COUNT_SLIP_STATUS_LABELS_VI,
  LEAVE_REQUEST_STATUS_LABELS_VI,
  ORDER_ITEM_STATUS_LABELS_VI,
  ORDER_PAYMENT_STATUS_LABELS_VI,
  ORDER_STATUS_LABELS_VI,
  PAYROLL_PERIOD_STATUS_LABELS_VI,
  PAYMENT_RECORD_STATUS_LABELS_VI,
  PRINT_JOB_STATUS_LABELS_VI,
  REFUND_STATUS_LABELS_VI,
  SUMMARY_RUN_STATUS_LABELS_VI,
  TABLE_STATUS_LABELS_VI,
  TAX_INVOICE_STATUS_LABELS_VI,
} from "@comtammatu/shared/labels";
import { Badge, type BadgeProps } from "@comtammatu/ui/components/badge";

type BadgeVariant = NonNullable<BadgeProps["variant"]>;

type DomainConfig = {
  labels: Record<string, string>;
  variants: Record<string, BadgeVariant>;
  dots?: Record<string, string>;
};

const STATUS_DOMAINS = {
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
  "summary-run": {
    labels: SUMMARY_RUN_STATUS_LABELS_VI,
    variants: {
      queued: "outline",
      running: "secondary",
      issued: "default",
      failed: "destructive",
      skipped: "secondary",
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
    },
    dots: {
      present: "bg-success",
      late: "bg-warning",
      absent: "bg-destructive",
      half_day: "bg-info",
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
} satisfies Record<string, DomainConfig>;

export type StatusDomain = keyof typeof STATUS_DOMAINS;

export function getStatusBadgeMeta(
  domain: StatusDomain,
  value: string,
): { label: string; variant: BadgeVariant } {
  const config: DomainConfig = STATUS_DOMAINS[domain];
  return {
    label: config.labels[value] ?? value,
    variant: config.variants[value] ?? "outline",
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
}: {
  domain: StatusDomain;
  value: string;
  label?: string;
  className?: string;
}) {
  const meta = getStatusBadgeMeta(domain, value);
  return (
    <Badge
      variant={meta.variant}
      className={className}
      data-slot="status-badge"
      data-domain={domain}
      data-status={value}
    >
      {label ?? meta.label}
    </Badge>
  );
}
