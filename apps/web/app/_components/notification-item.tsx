"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@comtammatu/ui";
import { Button } from "@comtammatu/ui/components/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
} from "@comtammatu/ui/components/context-menu";
import { toast } from "@comtammatu/ui/components/sonner";
import {
  TriangleAlert as IconAlertTriangle,
  CircleCheck as IconCircleCheck,
  ClipboardList as IconClipboardList,
  Info as IconInfoCircle,
  PackageOpen as IconPackageExport,
  ShoppingBag as IconShoppingBag,
  Truck as IconTruck,
} from "lucide-react";
import type { NotificationItem as NotificationItemModel } from "@/(protected)/notifications/actions";
import {
  RowActionsContextMenuItems,
  RowActionsMenu,
  type RowActionItem,
} from "@/components/row-actions-menu";
import { messages } from "@lib/messages";
import { formatVNDate } from "@comtammatu/shared/time";
import { UNKNOWN_LABEL_VI } from "@comtammatu/shared/labels";

function iconFor(kind: string) {
  switch (kind) {
    case "pos.order_new":
    case "order.delay_sla_breach":
      return IconShoppingBag;
    case "workflow.po_sent":
    case "workflow.po_approved":
      return IconPackageExport;
    case "workflow.grn_pending":
    case "procurement.purchase_request_submitted":
    case "procurement.po_pending_approval":
    case "inventory.waste.weekly_report":
      return IconClipboardList;
    case "workflow.transfer_in_transit":
      return IconTruck;
    case "inventory.stock_request_submitted":
      return IconPackageExport;
    case "workflow.stocktake_submitted":
    case "inventory.stocktake_completed":
      return IconCircleCheck;
    case "hr.leave_approved":
    case "hr.payroll_period_ready":
      return IconCircleCheck;
    case "hr.leave_rejected":
      return IconAlertTriangle;
    case "hr.leave_requested":
    case "hr.checkout_requested":
    case "attendance.checkout_requested":
    case "pos.void_requested":
      return IconClipboardList;
    case "inventory.count_slip_submitted":
      return IconClipboardList;
    case "inventory.count_slip_approved":
      return IconCircleCheck;
    case "inventory.count_slip_recount":
    case "inventory.stocktake_conflict":
      return IconAlertTriangle;
    case "inventory.stock_low":
    case "inventory.expiry_soon":
    case "inventory.valuation_variance":
    case "inventory.valuation_reconciliation_failed":
    case "pos.kds_out_of_stock":
    case "pos.payment_stock_failed":
    case "pos.shift_variance":
    case "system.cron_failed":
      return IconAlertTriangle;
    default:
      return IconInfoCircle;
  }
}

function toneFor(severity: NotificationItemModel["severity"]) {
  switch (severity) {
    case "critical":
      return "text-destructive";
    case "warning":
      return "text-warning";
    default:
      return "text-primary";
  }
}

function relativeTime(iso: string) {
  const t = messages.notifications.time;
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diff = Math.max(0, now - then);
  const min = Math.floor(diff / 60_000);
  if (min < 1) return t.justNow;
  if (min < 60) return `${min} ${t.minutes}`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} ${t.hours}`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day} ${t.days}`;
  return formatVNDate(iso);
}

function openCtaLabel(kind: string): string {
  return (
    messages.notifications.ctaByKind[kind] ?? messages.notifications.openWork
  );
}

export function getNotificationRowActions(
  item: NotificationItemModel,
  handlers: {
    onOpen: () => void;
    onRead: (id: number, options?: { quiet?: boolean }) => void;
  },
): RowActionItem[] {
  const unread = item.read_at === null;
  const actions: RowActionItem[] = [];
  if (item.action_url) {
    actions.push({
      key: "open",
      label: openCtaLabel(item.kind),
      onSelect: handlers.onOpen,
    });
  }
  if (unread) {
    actions.push({
      key: "mark-read",
      label: messages.notifications.markRead,
      onSelect: () => handlers.onRead(item.id),
    });
  }
  if (item.action_url) {
    actions.push({
      key: "copy",
      label: messages.notifications.copyLink,
      separatorBefore: actions.length > 0,
      onSelect: () => {
        void navigator.clipboard.writeText(
          `${window.location.origin}${item.action_url}`,
        );
        toast.success(messages.notifications.copyLinkSuccess);
      },
    });
  }
  return actions;
}

interface Props {
  item: NotificationItemModel;
  onRead: (id: number, options?: { quiet?: boolean }) => void;
  onNavigate?: () => void;
}

export function NotificationItem({ item, onRead, onNavigate }: Props) {
  const router = useRouter();
  const Icon = iconFor(item.kind);
  const tone = toneFor(item.severity);
  const unread = item.read_at === null;
  const kindLabel =
    messages.notifications.kindLabel[item.kind] ?? UNKNOWN_LABEL_VI;
  const cta = item.action_url ? openCtaLabel(item.kind) : null;

  const handleOpen = () => {
    if (unread) onRead(item.id, { quiet: true });
    onNavigate?.();
    if (item.action_url) router.push(item.action_url);
  };

  const actions = getNotificationRowActions(item, {
    onOpen: handleOpen,
    onRead,
  });

  const className = cn(
    "flex h-auto w-full items-start justify-start gap-3 whitespace-normal rounded-lg border p-3 text-left font-normal transition-colors",
    unread
      ? "border-primary/20 bg-primary/10 hover:bg-primary/15"
      : "border-border bg-card hover:bg-muted/50",
  );

  const body = (
    <>
      <span
        className={cn(
          "inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-muted",
          tone,
        )}
        aria-hidden
      >
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1 flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <p
            className={cn(
              "truncate text-sm",
              unread ? "font-semibold text-foreground" : "text-foreground/80",
            )}
          >
            {item.title}
          </p>
          {unread ? (
            <span
              className="inline-block size-2 shrink-0 rounded-full bg-primary"
              aria-label={messages.notifications.filters.unread}
            />
          ) : null}
        </div>
        {item.body ? (
          <p className="line-clamp-2 text-xs text-muted-foreground">
            {item.body}
          </p>
        ) : null}
        <p className="text-xs text-muted-foreground">
          {cta ? `${cta} · ` : null}
          {kindLabel} · {relativeTime(item.created_at)}
        </p>
      </div>
    </>
  );

  const primary =
    item.action_url != null ? (
      <Button
        variant="ghost"
        className={cn(className, "min-w-0 flex-1")}
        render={
          <Link
            href={item.action_url}
            onClick={() => {
              if (unread) onRead(item.id, { quiet: true });
              onNavigate?.();
            }}
          />
        }
      >
        {body}
      </Button>
    ) : (
      <Button
        type="button"
        variant="ghost"
        className={cn(className, "min-w-0 flex-1")}
        onClick={() => {
          if (unread) onRead(item.id);
        }}
      >
        {body}
      </Button>
    );

  const row = (
    <div className="flex items-stretch gap-1">
      {primary}
      {actions.length > 0 ? (
        <div className="flex shrink-0 items-start pt-2 pr-1">
          <RowActionsMenu
            items={actions}
            label={messages.notifications.openWork}
            triggerSize="icon-sm"
          />
        </div>
      ) : null}
    </div>
  );

  if (actions.length === 0) return row;

  return (
    <ContextMenu>
      <ContextMenuTrigger render={row} />
      <ContextMenuContent>
        <RowActionsContextMenuItems items={actions} />
      </ContextMenuContent>
    </ContextMenu>
  );
}
