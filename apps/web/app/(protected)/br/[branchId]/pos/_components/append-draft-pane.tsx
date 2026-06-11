"use client";

import { memo, useState } from "react";
import { AppEmptyState } from "@/components/surface";
import { formatVND } from "@comtammatu/shared/format";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Item } from "@comtammatu/ui/components/item";
import { ScrollArea } from "@comtammatu/ui/components/scroll-area";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { cn } from "@comtammatu/ui";
import { messages } from "@lib/messages";
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
  const [removingKeys, setRemovingKeys] = useState<Set<string>>(
    () => new Set(),
  );
  const quantity = items.reduce((sum, item) => sum + item.quantity, 0);
  const total = calcCartTotal(items);

  function removeItemWithEffect(key: string) {
    setRemovingKeys((current) => new Set(current).add(key));
    window.setTimeout(() => {
      onRemoveItem(key);
      setRemovingKeys((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
    }, 180);
  }
  const hasRemovingItems = removingKeys.size > 0;
  const canSubmit = items.length > 0 && !isSubmitting && !hasRemovingItems;

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <div className="shrink-0 border-b border-border/60 px-3 py-3 sm:px-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h2 className="font-heading truncate text-base font-semibold tracking-tight text-foreground sm:text-xl">
              {messages.pos.appendDraft.title}
            </h2>
            <Badge variant="warning">#{orderNumber}</Badge>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="touch"
            className="w-12 shrink-0 px-0 text-muted-foreground"
            aria-label={
              onClosePane
                ? messages.pos.appendDraft.closeAria
                : messages.pos.appendDraft.cancelAria
            }
            disabled={isSubmitting}
            onClick={onClosePane ?? onCancel}
          >
            <IconX />
          </Button>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-4">
          <AppEmptyState
            title={messages.pos.appendDraft.empty}
            icon={<IconPlus />}
            compact
          />
        </div>
      ) : (
        <ScrollArea className="min-h-0 flex-1">
          <ul
            className="flex flex-col gap-2 px-3 py-2 sm:px-4"
            aria-label={messages.pos.appendDraft.listAria}
          >
            {items.map((item) => {
              const displayName = getPosLineItemDisplayName(item);
              const summary = getPosLineItemSummary(item);
              const subtotal = calcItemSubtotal(item);
              const isRemoving = removingKeys.has(item.key);

              return (
                <li key={item.key} className="relative">
                  <Item
                    variant="outline"
                    size="sm"
                    className={cn(
                      "rounded-none bg-card p-0 pr-12 shadow-sm transition-all duration-150 hover:shadow-md sm:pr-14",
                      isRemoving &&
                        "bg-destructive/10 opacity-0 motion-safe:scale-95",
                    )}
                  >
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-auto min-h-24 w-full justify-start whitespace-normal rounded-none px-2 py-2 text-left hover:bg-transparent sm:px-3"
                      aria-label={messages.pos.appendDraft.editItemAria(
                        displayName,
                      )}
                      disabled={isSubmitting || isRemoving}
                      onClick={() => onEditItem(item)}
                    >
                      <PosLineItemCompact
                        quantity={item.quantity}
                        title={displayName}
                        total={formatVND(subtotal)}
                        options={summary.options}
                        modifiers={summary.modifiers}
                        sides={summary.sides}
                        note={summary.note}
                        isPriority={summary.isPriority}
                      />
                    </Button>
                  </Item>
                  <Button
                    type="button"
                    variant="ghost"
                    size="touch"
                    className="absolute right-2 top-1/2 min-w-12 -translate-y-1/2 px-0 text-muted-foreground hover:text-destructive"
                    aria-label={messages.pos.appendDraft.removeItemAria(
                      displayName,
                    )}
                    disabled={isSubmitting || isRemoving}
                    onClick={() => removeItemWithEffect(item.key)}
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
            {messages.pos.appendDraft.itemCount(quantity)}
          </p>
          <p className="text-xl font-bold text-primary tabular-nums">
            {formatVND(total)}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="touch"
            className="flex-1"
            disabled={isSubmitting}
            onClick={onCancel}
          >
            {messages.pos.appendDraft.cancel}
          </Button>
          <Button
            type="button"
            size="touch"
            className="flex-1"
            disabled={!canSubmit}
            onClick={onSubmit}
          >
            {isSubmitting ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <IconSend data-icon="inline-start" />
            )}
            {messages.pos.appendDraft.submit}
          </Button>
        </div>
      </div>
    </div>
  );
}

export const AppendDraftPane = memo(AppendDraftPaneComponent);
