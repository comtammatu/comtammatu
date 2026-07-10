"use client";

import { Badge, type BadgeProps } from "@comtammatu/ui/components/badge";
import { SELF_ORDER_VI } from "@comtammatu/shared/messages";
import type { PublicSelfOrderSnapshot } from "@lib/self-order/contracts";

interface StatusPillProps {
  session: PublicSelfOrderSnapshot["session"];
  paymentRequest: { status?: string } | null | undefined;
  order: PublicSelfOrderSnapshot["order"];
}

interface PillConfig {
  label: string;
  variant: BadgeProps["variant"];
}

function resolvePillConfig({
  session,
  paymentRequest,
  order,
}: StatusPillProps): PillConfig | null {
  const status = session?.status;
  if (!status) return null;

  if (status === "pending_approval") {
    return { label: SELF_ORDER_VI.statusPendingApproval, variant: "warning" };
  }
  if (status !== "active") {
    if (status === "closed") {
      return { label: SELF_ORDER_VI.statusClosed, variant: "secondary" };
    }
    if (status === "revoked") {
      return { label: SELF_ORDER_VI.statusRejected, variant: "destructive" };
    }
    return null;
  }

  const paid = order && order.paymentStatus === "paid";
  if (paid) {
    return { label: SELF_ORDER_VI.statusClosed, variant: "secondary" };
  }

  if (paymentRequest?.status === "vietqr_pending") {
    return { label: SELF_ORDER_VI.statusAwaitingVietQr, variant: "info" };
  }
  if (paymentRequest?.status === "cash_call") {
    return { label: SELF_ORDER_VI.statusAwaitingCash, variant: "warning" };
  }

  return { label: SELF_ORDER_VI.statusActive, variant: "success" };
}

export function StatusPill(props: StatusPillProps) {
  const config = resolvePillConfig(props);
  if (!config) return null;

  return (
    <Badge variant={config.variant} className="gap-1">
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {config.label}
    </Badge>
  );
}
