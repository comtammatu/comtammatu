import {
  ORDER_PAYMENT_STATUS_LABELS_VI,
  ORDER_STATUS_LABELS_VI,
  PAYMENT_RECORD_STATUS_LABELS_VI,
  REFUND_STATUS_LABELS_VI,
} from "@comtammatu/shared/labels";
import { Badge, type BadgeProps } from "@comtammatu/ui/components/badge";

type BadgeVariant = NonNullable<BadgeProps["variant"]>;

type DomainConfig = {
  labels: Record<string, string>;
  variants: Record<string, BadgeVariant>;
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
