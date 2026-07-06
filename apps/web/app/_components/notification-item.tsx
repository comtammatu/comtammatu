"use client";

import { useRouter } from "next/navigation";
import { cn } from "@comtammatu/ui";
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
import { messages } from "@lib/messages";
import { formatVNDate } from "@comtammatu/shared/time";

function iconFor(kind: string) {
  switch (kind) {
    case "pos.order_new":
      return IconShoppingBag;
    case "workflow.po_sent":
      return IconPackageExport;
    case "workflow.grn_pending":
      return IconClipboardList;
    case "workflow.transfer_in_transit":
      return IconTruck;
    case "workflow.stocktake_submitted":
      return IconCircleCheck;
    case "hr.leave_approved":
      return IconCircleCheck;
    case "hr.leave_rejected":
      return IconAlertTriangle;
    case "hr.leave_requested":
      return IconClipboardList;
    case "inventory.count_slip_submitted":
      return IconClipboardList;
    case "inventory.count_slip_approved":
      return IconCircleCheck;
    case "inventory.count_slip_recount":
      return IconAlertTriangle;
    case "inventory.stock_low":
    case "inventory.expiry_soon":
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

interface Props {
  item: NotificationItemModel;
  onRead: (id: number) => void;
  onNavigate?: () => void;
}

export function NotificationItem({ item, onRead, onNavigate }: Props) {
  const router = useRouter();
  const Icon = iconFor(item.kind);
  const tone = toneFor(item.severity);
  const unread = item.read_at === null;
  const kindLabel = messages.notifications.kindLabel[item.kind] ?? item.kind;

  const handleClick = () => {
    if (unread) onRead(item.id);
    if (item.action_url) {
      router.push(item.action_url);
      onNavigate?.();
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        "flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/60",
        unread ? "bg-primary/5 border-primary/20" : "bg-card",
      )}
    >
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
          {unread && (
            <span
              className="inline-block size-2 shrink-0 rounded-full bg-primary"
              aria-label={messages.notifications.filters.unread}
            />
          )}
        </div>
        {item.body && (
          <p className="line-clamp-2 text-xs text-muted-foreground">
            {item.body}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          {kindLabel} · {relativeTime(item.created_at)}
        </p>
      </div>
    </button>
  );
}
