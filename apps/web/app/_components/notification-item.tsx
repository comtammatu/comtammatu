"use client";

import { useRouter } from "next/navigation";
import { cn } from "@comtammatu/ui";
import { TriangleAlert as IconAlertTriangle, CircleCheck as IconCircleCheck, ClipboardList as IconClipboardList, Info as IconInfoCircle, PackageOpen as IconPackageExport, ShoppingBag as IconShoppingBag, Truck as IconTruck } from "lucide-react";
import type { NotificationItem as NotificationItemModel } from "@/_actions/notifications";
import { messages } from "@lib/messages";

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
    case "inventory.stock_low":
    case "inventory.expiry_soon":
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
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diff = Math.max(0, now - then);
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "vừa xong";
  if (min < 60) return `${min} phút`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} giờ`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day} ngày`;
  return new Date(iso).toLocaleDateString("vi-VN");
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
          "mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-muted",
          tone,
        )}
        aria-hidden
      >
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1 space-y-1">
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
              aria-label="Chưa đọc"
            />
          )}
        </div>
        {item.body && (
          <p className="line-clamp-2 text-xs text-muted-foreground">
            {item.body}
          </p>
        )}
        <p className="text-[11px] text-muted-foreground">
          {kindLabel} · {relativeTime(item.created_at)}
        </p>
      </div>
    </button>
  );
}
