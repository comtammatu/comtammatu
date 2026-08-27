"use client";

import { memo, useState } from "react";
import { AppEmptyState } from "@/components/surface";
import { formatVND } from "@comtammatu/shared/format";
import { Button } from "@comtammatu/ui/components/button";
import { Item } from "@comtammatu/ui/components/item";
import { ScrollArea } from "@comtammatu/ui/components/scroll-area";
import { SectionLabel } from "@comtammatu/ui/components/section-label";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { cn } from "@comtammatu/ui";
import { messages } from "@lib/messages";
import {
  Plus as IconPlus,
  Send as IconSend,
  Trash as IconTrash,
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
  targetLabel: string;
  items: CartItem[];
  isSubmitting: boolean;
  onSubmit: () => void;
  onCancel: () => void;
  onClosePane?: () => void;
  onRemoveItem: (key: string) => void;
  onUpdateQuantity?: (key: string, delta: number) => void;
  /**
   * Tap on a draft row to edit (variant / modifiers / note / quantity). Mirrors
   * the cart pane so items added without options can still get a note appended
   * later — without this, no-variant items land in the draft as static rows.
   */
  onEditItem: (item: CartItem) => void;
}

function AppendDraftPaneComponent({
  targetLabel,
  items,
  isSubmitting,
  onSubmit,
  onCancel,
  onClosePane,
  onRemoveItem,
  onUpdateQuantity,
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
      {!onClosePane ? (
        <div className="flex min-h-12 shrink-0 items-center justify-between gap-3 border-b border-border/60 px-3 py-2 sm:px-4">
          <div className="min-w-0">
            <h2 className="font-heading truncate text-base font-semibold tracking-tight text-foreground">
              {messages.pos.appendDraft.title}
            </h2>
            {/* Menu target row already shows the table/order label from md up. */}
            <p className="truncate text-sm text-muted-foreground md:sr-only">
              {targetLabel}
            </p>
          </div>
        </div>
      ) : null}

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
                      "bg-card p-0 text-left transition-[background-color,border-color,box-shadow,opacity,transform] duration-150 hover:shadow-effect-card-hover",
                      isRemoving &&
                        "bg-destructive/10 opacity-0 motion-safe:scale-95",
                    )}
                  >
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-auto w-full min-w-0 justify-start px-3 py-2 pr-[2.75rem] text-left font-normal whitespace-normal hover:bg-transparent sm:pr-[3.5rem]"
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
                        onIncreaseQuantity={
                          onUpdateQuantity
                            ? () => onUpdateQuantity(item.key, 1)
                            : undefined
                        }
                        onDecreaseQuantity={
                          onUpdateQuantity
                            ? () => {
                                if (item.quantity > 1) {
                                  onUpdateQuantity(item.key, -1);
                                } else {
                                  removeItemWithEffect(item.key);
                                }
                              }
                            : undefined
                        }
                      />
                    </Button>
                  </Item>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-touch"
                    className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-destructive"
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

      <div className="flex shrink-0 flex-col gap-2 border-t border-border/60 bg-background px-3 py-3 sm:px-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <SectionLabel>{messages.pos.appendDraft.summaryLabel}</SectionLabel>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {messages.pos.appendDraft.itemCount(quantity)}
            </p>
          </div>
          <p className="shrink-0 font-mono text-lg sm:text-xl font-bold text-primary tabular-nums">
            {formatVND(total)}
          </p>
        </div>
        <div className="grid grid-cols-1 gap-2">
          <Button
            type="button"
            size="touch"
            className="w-full min-w-0 font-semibold"
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
          <Button
            type="button"
            variant="outline"
            size="touch"
            className="w-full min-w-0 font-medium text-muted-foreground"
            disabled={isSubmitting}
            onClick={onCancel}
          >
            {messages.pos.appendDraft.cancel}
          </Button>
        </div>
      </div>
    </div>
  );
}

export const AppendDraftPane = memo(AppendDraftPaneComponent);
