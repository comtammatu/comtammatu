"use client";

import { memo } from "react";
import { formatVND } from "@comtammatu/shared/format";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@comtammatu/ui/components/empty";
import { Item } from "@comtammatu/ui/components/item";
import { ScrollArea } from "@comtammatu/ui/components/scroll-area";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { cn } from "@comtammatu/ui";
import {
  Plus as IconPlus,
  Send as IconSend,
  Trash as IconTrash,
  X as IconX,
} from "lucide-react";
import {
  calcCartTotal,
  calcItemSubtotal,
  getPosLineItemDisplayName,
  getPosLineItemSummary,
} from "../types";
import type { CartItem } from "../types";
import { PosLineItemCompact } from "./pos-line-item-compact";

interface AppendDraftPaneProps {
  orderNumber: string;
  items: CartItem[];
  isSubmitting: boolean;
  onSubmit: () => void;
  onCancel: () => void;
  onClosePane?: () => void;
  onRemoveItem: (key: string) => void;
  /**
   * Tap on a draft row to edit (variant / modifiers / note / quantity). Mirrors
   * the cart pane so items added without options can still get a note appended
   * later — without this, no-variant items land in the draft as static rows.
   */
  onEditItem: (item: CartItem) => void;
}

function AppendDraftPaneComponent({
  orderNumber,
  items,
  isSubmitting,
  onSubmit,
  onCancel,
  onClosePane,
  onRemoveItem,
  onEditItem,
}: AppendDraftPaneProps) {
  const quantity = items.reduce((sum, item) => sum + item.quantity, 0);
  const total = calcCartTotal(items);
  const canSubmit = items.length > 0 && !isSubmitting;

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <div className="shrink-0 border-b border-border/60 px-3 py-3 sm:px-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h2 className="truncate text-base font-semibold tracking-tight text-foreground sm:text-xl">
              Món thêm
            </h2>
            <Badge variant="warning">#{orderNumber}</Badge>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="shrink-0 text-muted-foreground"
            aria-label={onClosePane ? "Đóng món thêm" : "Hủy thêm món"}
            disabled={isSubmitting}
            onClick={onClosePane ?? onCancel}
          >
            <IconX />
          </Button>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-4">
          <Empty className="py-10">
            <EmptyMedia variant="icon">
              <IconPlus />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle>Chưa có món thêm</EmptyTitle>
            </EmptyHeader>
          </Empty>
        </div>
      ) : (
        <ScrollArea className="min-h-0 flex-1">
          <ul
            className="flex flex-col gap-2 px-3 py-2 sm:px-4"
            aria-label="Món sẽ gửi thêm"
          >
            {items.map((item) => {
              const displayName = getPosLineItemDisplayName(item);
              const summary = getPosLineItemSummary(item);
              const subtotal = calcItemSubtotal(item);

              return (
                <li key={item.key} className="relative">
                  <Item
                    variant="outline"
                    size="sm"
                    className={cn(
                      "h-20 rounded-none bg-card p-0 pr-12 shadow-sm transition-colors hover:shadow-md sm:pr-14",
                    )}
                  >
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-full w-full justify-start whitespace-normal rounded-none px-3 py-2 text-left hover:bg-transparent sm:px-4"
                      aria-label={`Sửa ${displayName} trong món thêm`}
                      disabled={isSubmitting}
                      onClick={() => onEditItem(item)}
                    >
                      <PosLineItemCompact
                        quantity={item.quantity}
                        title={displayName}
                        total={formatVND(subtotal)}
                        options={summary.options}
                        note={summary.note}
                      />
                    </Button>
                  </Item>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-2 top-1/2 min-h-11 min-w-11 size-9 -translate-y-1/2 text-muted-foreground hover:text-destructive"
                    aria-label={`Xóa ${displayName} khỏi món thêm`}
                    disabled={isSubmitting}
                    onClick={() => onRemoveItem(item.key)}
                  >
                    <IconTrash />
                  </Button>
                </li>
              );
            })}
          </ul>
        </ScrollArea>
      )}

      <div className="shrink-0 border-t border-border/60 bg-background px-3 py-3 sm:px-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {quantity} món
          </p>
          <p className="text-xl font-bold text-primary tabular-nums">
            {formatVND(total)}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            className="min-h-12 flex-1"
            disabled={isSubmitting}
            onClick={onCancel}
          >
            Hủy
          </Button>
          <Button
            type="button"
            className="min-h-12 flex-1"
            disabled={!canSubmit}
            onClick={onSubmit}
          >
            {isSubmitting ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <IconSend data-icon="inline-start" />
            )}
            Gửi
          </Button>
        </div>
      </div>
    </div>
  );
}

export const AppendDraftPane = memo(AppendDraftPaneComponent);
