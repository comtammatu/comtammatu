"use client";

import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
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
}: {
  target: OrderTarget;
  appendDraftQuantity: number;
  onCancel: () => void;
  onSwitch: () => void;
}) {
  const isExisting = target.kind === "existing-order";

  // Existing-order append: keep one quiet label + cancel. The append pane
  // already owns the "Món thêm chưa gửi" title — repeating warning badges
  // here stacked three contexts across columns.
  return (
    <div className="hidden h-12 shrink-0 items-center justify-between gap-3 border-b border-border/60 bg-background px-3 md:flex lg:px-4">
      <div className="flex min-w-0 items-center gap-2">
        <p className="font-heading min-w-0 truncate text-base font-semibold tracking-tight text-foreground">
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
      <Button
        type="button"
        variant="ghost"
        size="touch"
        className="min-w-12 shrink-0 px-3 text-sm text-muted-foreground"
        onClick={isExisting ? onCancel : onSwitch}
      >
        {isExisting
          ? messages.pos.desktop.cancelTarget
          : messages.pos.desktop.changeTarget}
      </Button>
    </div>
  );
}
