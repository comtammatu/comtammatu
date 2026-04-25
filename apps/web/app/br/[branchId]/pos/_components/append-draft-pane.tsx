"use client";

import { memo } from "react";
import { formatVND } from "@comtammatu/shared/format";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@comtammatu/ui/components/empty";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { ScrollArea } from "@comtammatu/ui/components/scroll-area";
import { Spinner } from "@comtammatu/ui/components/spinner";
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
} from "../types";
import type { CartItem } from "../types";

interface AppendDraftPaneProps {
  orderNumber: string;
  items: CartItem[];
  isSubmitting: boolean;
  onSubmit: () => void;
  onCancel: () => void;
  onClosePane?: () => void;
  onRemoveItem: (key: string) => void;
}

function AppendDraftPaneComponent({
  orderNumber,
  items,
  isSubmitting,
  onSubmit,
  onCancel,
  onClosePane,
  onRemoveItem,
}: AppendDraftPaneProps) {
  const quantity = items.reduce((sum, item) => sum + item.quantity, 0);
  const total = calcCartTotal(items);
  const canSubmit = items.length > 0 && !isSubmitting;

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <div className="shrink-0 border-b border-border/60 px-3 py-3 sm:px-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-base font-semibold tracking-tight text-foreground sm:text-xl">
                Món thêm
              </h2>
              <Badge variant="warning">Đơn #{orderNumber}</Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Chọn món trên menu, kiểm tra lại rồi gửi vào đơn.
            </p>
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
              <EmptyDescription>
                Chạm món trên menu để đưa vào danh sách gửi thêm.
              </EmptyDescription>
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
              const details = [
                item.modifiers
                  .map((modifier) => `+ ${modifier.name}`)
                  .join(","),
                item.sides.length > 0
                  ? item.sides
                      .map((side) =>
                        side.quantity > 1
                          ? `${side.name} x${String(side.quantity)}`
                          : side.name,
                      )
                      .join(",")
                  : "",
                item.note ? `* ${item.note}` : "",
              ].filter(Boolean);

              return (
                <li key={item.key}>
                  <Item variant="outline" size="xs" className="bg-card">
                    <ItemContent className="min-w-0">
                      <ItemTitle className="max-w-full text-sm">
                        <span className="shrink-0 text-muted-foreground tabular-nums">
                          x{item.quantity}
                        </span>
                        {displayName}
                      </ItemTitle>
                      {details.length > 0 && (
                        <ItemDescription>{details.join(" ·")}</ItemDescription>
                      )}
                      <ItemDescription>
                        {formatVND(calcItemSubtotal(item))}
                      </ItemDescription>
                    </ItemContent>
                    <ItemActions className="shrink-0 self-start">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="text-muted-foreground hover:text-destructive"
                        aria-label={`Xóa ${displayName} khỏi món thêm`}
                        disabled={isSubmitting}
                        onClick={() => onRemoveItem(item.key)}
                      >
                        <IconTrash />
                      </Button>
                    </ItemActions>
                  </Item>
                </li>
              );
            })}
          </ul>
        </ScrollArea>
      )}

      <div className="shrink-0 border-t border-border/60 bg-background px-3 py-3 sm:px-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Sẽ gửi thêm
            </p>
            <p className="text-sm text-muted-foreground">
              {quantity} món cho đơn #{orderNumber}
            </p>
          </div>
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
            Hủy thêm món
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
            Gửi món thêm
          </Button>
        </div>
      </div>
    </div>
  );
}

export const AppendDraftPane = memo(AppendDraftPaneComponent);
