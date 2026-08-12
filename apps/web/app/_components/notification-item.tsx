"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@comtammatu/ui";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
} from "@comtammatu/ui/components/context-menu";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemHeader,
  ItemMedia,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { toast } from "@comtammatu/ui/components/sonner";
import {
  ChevronRight as IconChevronRight,
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
    case "inventory.waste_pending_approval":
      return IconClipboardList;
    case "workflow.transfer_in_transit":
      return IconTruck;
    case "inventory.stock_request_submitted":
    case "inventory.stock_request_rejected":
      return IconPackageExport;
    case "inventory.stocktake_completed":
      return IconCircleCheck;
    case "hr.leave_approved":
    case "hr.checkout_approved":
    case "hr.payroll_period_ready":
    case "pos.void_resolved":
      return IconCircleCheck;
    case "hr.leave_rejected":
    case "hr.checkout_rejected":
    case "pos.void_rejected":
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
    case "inventory.valuation_variance":
    case "inventory.valuation_reconciliation_failed":
    case "pos.kds_out_of_stock":
    case "pos.shift_variance":
    case "system.cron_failed":
      return IconAlertTriangle;
    default:
      return IconInfoCircle;
  }
}

function severityTone(severity: NotificationItemModel["severity"]) {
  switch (severity) {
    case "critical":
      return {
        icon: "bg-destructive/10 text-destructive",
        rail: "border-l-destructive",
        badge: "destructive" as const,
        label: messages.notifications.severity.critical,
      };
    case "warning":
      return {
        icon: "bg-warning/10 text-warning",
        rail: "border-l-warning",
        badge: "warning" as const,
        label: messages.notifications.severity.warning,
      };
    default:
      return {
        icon: "bg-primary/10 text-primary",
        rail: "border-l-primary",
        badge: "info" as const,
        label: messages.notifications.severity.info,
      };
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
    onHistory?: () => void;
    onAudit?: () => void;
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
  if (item.history_url && handlers.onHistory) {
    actions.push({
      key: "history",
      label: messages.notifications.viewDocumentHistory,
      onSelect: handlers.onHistory,
    });
  }
  if (item.audit_url && handlers.onAudit) {
    actions.push({
      key: "audit",
      label: messages.notifications.viewSystemActivity,
      onSelect: handlers.onAudit,
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
  const tone = severityTone(item.severity);
  const unread = item.read_at === null;
  const kindLabel =
    messages.notifications.kindLabel[item.kind] ?? UNKNOWN_LABEL_VI;
  const cta = item.action_url ? openCtaLabel(item.kind) : null;
  const showSeverityBadge = item.severity !== "info";

  const handleOpen = () => {
    if (unread) onRead(item.id, { quiet: true });
    onNavigate?.();
    if (item.action_url) router.push(item.action_url);
  };

  const handleHistory = () => {
    if (!item.history_url) return;
    if (unread) onRead(item.id, { quiet: true });
    onNavigate?.();
    router.push(item.history_url);
  };

  const handleAudit = () => {
    if (!item.audit_url) return;
    if (unread) onRead(item.id, { quiet: true });
    onNavigate?.();
    router.push(item.audit_url);
  };

  const actions = getNotificationRowActions(item, {
    onOpen: handleOpen,
    onHistory: item.history_url ? handleHistory : undefined,
    onAudit: item.audit_url ? handleAudit : undefined,
    onRead,
  });

  const content = (
    <>
      <ItemMedia
        variant="icon"
        className={cn(
          "size-10 rounded-md",
          unread ? tone.icon : "bg-muted text-muted-foreground",
        )}
        aria-hidden
      >
        <Icon className="size-4" />
      </ItemMedia>
      <ItemContent className="gap-2">
        <ItemHeader className="items-start gap-3">
          <ItemTitle
            size="heading"
            className={cn(
              "min-w-0 flex-1 whitespace-normal",
              unread ? "text-foreground" : "font-medium text-foreground/80",
            )}
          >
            <span className="line-clamp-2">{item.title}</span>
            {unread ? (
              <span
                className="inline-block size-2 shrink-0 rounded-full bg-primary"
                aria-label={messages.notifications.filters.unread}
              />
            ) : null}
          </ItemTitle>
          <time
            dateTime={item.created_at}
            className="shrink-0 pt-0.5 text-2xs text-muted-foreground tabular-nums"
          >
            {relativeTime(item.created_at)}
          </time>
        </ItemHeader>
        {item.body ? (
          <ItemDescription className="line-clamp-2">
            {item.body}
          </ItemDescription>
        ) : null}
        <ItemFooter className="mt-0.5 gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {showSeverityBadge ? (
              <Badge variant={tone.badge}>{tone.label}</Badge>
            ) : null}
            <Badge variant="outline">{kindLabel}</Badge>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            {cta ? (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
                {cta}
                <IconChevronRight className="size-3.5" aria-hidden />
              </span>
            ) : null}
            {item.history_url &&
            item.history_url !== item.action_url ? (
              <Button
                type="button"
                variant="link"
                size="sm"
                className="h-auto p-0 text-2xs text-muted-foreground"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  handleHistory();
                }}
              >
                {messages.notifications.viewDocumentHistory}
              </Button>
            ) : null}
          </div>
        </ItemFooter>
      </ItemContent>
    </>
  );

  const itemClassName = cn(
    "items-start gap-3 border-l-[3px] bg-card py-3 transition-colors",
    unread ? tone.rail : "border-l-transparent",
    unread
      ? "hover:bg-primary/10"
      : "opacity-90 hover:bg-muted/50 hover:opacity-100",
  );

  const primary =
    item.action_url != null ? (
      <Item
        variant="outline"
        className={cn(itemClassName, "min-w-0 flex-1")}
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
        {content}
      </Item>
    ) : (
      <Item
        variant="outline"
        className={cn(itemClassName, "min-w-0 flex-1 cursor-pointer")}
        role="button"
        tabIndex={0}
        onClick={() => {
          if (unread) onRead(item.id);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            if (unread) onRead(item.id);
          }
        }}
      >
        {content}
      </Item>
    );

  const row = (
    <div className="flex items-stretch gap-2">
      {primary}
      {actions.length > 0 ? (
        <ItemActions className="shrink-0 items-start pt-2">
          <RowActionsMenu items={actions} triggerSize="icon-sm" />
        </ItemActions>
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
