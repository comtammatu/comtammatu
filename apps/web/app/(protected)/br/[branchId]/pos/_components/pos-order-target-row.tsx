"use client";

import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Pencil as IconPencil } from "lucide-react";
import { cn } from "@comtammatu/ui";
import { messages } from "@lib/messages";

export type OrderTarget =
  | { kind: "new-dine-in"; label: string }
  | { kind: "new-takeaway"; label: string }
  | { kind: "new-delivery"; label: string }
  | { kind: "existing-order"; label: string };

export function PosOrderTargetRow({
  target,
  appendDraftQuantity,
  onCancel,
  onSwitch,
  onEditDelivery,
}: {
  target: OrderTarget;
  appendDraftQuantity: number;
  onCancel: () => void;
  onSwitch: () => void;
  onEditDelivery?: () => void;
}) {
  const isExisting = target.kind === "existing-order";
  const isDelivery = target.kind === "new-delivery";

  // Existing-order append: keep one quiet label + cancel. The append pane
  // already owns the "Món thêm chưa gửi" title — repeating warning badges
  // here stacked three contexts across columns.
  return (
    <div
      className={cn(
        "h-11 shrink-0 items-center justify-between gap-2 border-b border-border/60 bg-background px-3 lg:px-4",
        isDelivery ? "flex" : "hidden md:flex",
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <p className="font-heading min-w-0 truncate text-sm sm:text-base font-semibold tracking-tight text-foreground">
          {target.label}
        </p>
        {isExisting && appendDraftQuantity > 0 ? (
          <Badge
            variant="secondary"
            className="shrink-0 text-xs font-semibold tabular-nums"
          >
            {messages.pos.appendDraft.itemCount(appendDraftQuantity)}
          </Badge>
        ) : null}
      </div>
      <div className="flex items-center gap-1">
        {isDelivery && onEditDelivery ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="shrink-0 px-2 text-xs font-medium text-primary hover:text-primary sm:text-sm"
            onClick={onEditDelivery}
          >
            <IconPencil data-icon="inline-start" className="size-3.5" />
            <span>{messages.pos.delivery.editDeliveryInfo}</span>
          </Button>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="shrink-0 px-2 text-xs text-muted-foreground sm:text-sm"
          onClick={isExisting ? onCancel : onSwitch}
        >
          {isExisting
            ? messages.pos.desktop.cancelTarget
            : messages.pos.desktop.changeTarget}
        </Button>
      </div>
    </div>
  );
}

