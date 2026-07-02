"use client";

/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: baseline inline Vietnamese copy in order merge sibling dialog */

import { useCallback, useEffect, useState, useTransition } from "react";
import { formatVND } from "@comtammatu/shared/format";
import {
  Alert,
  AlertAction,
  AlertDescription,
} from "@comtammatu/ui/components/alert";
import { Button } from "@comtammatu/ui/components/button";
import {
  Item,
  ItemContent,
  ItemGroup,
} from "@comtammatu/ui/components/item";
import { Label } from "@comtammatu/ui/components/label";
import {
  RadioGroup,
  RadioGroupItem,
} from "@comtammatu/ui/components/radio-group";
import { ScrollArea } from "@comtammatu/ui/components/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@comtammatu/ui/components/sheet";
import { Skeleton } from "@comtammatu/ui/components/skeleton";
import { fetchSiblingOrdersForTable } from "../../actions";
import type { SiblingOrderRow } from "../../discount-actions";

import { ACTIONS_VI, POS_VI } from "@comtammatu/shared/messages";
interface MergeOrdersSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branchId: number;
  /** Đơn đang xem — sẽ là SOURCE (bị cancel sau merge). */
  sourceOrderId: number;
  sourceOrderNumber: string | null;
  sourceTableId: number | null;
  sourceTableNumber: number | null;
  sourceHasPctDiscount: boolean;
  isPending?: boolean;
  onSubmit: (targetOrderId: number) => void;
}

/**
 * Pick a TARGET order on the same table to merge the source INTO. The
 * source order becomes 'cancelled' with merged_into_order_id pointing at
 * the target. UI gates (server enforces too):
 *   - Both orders must be the same table_id (server filters), unpaid,
 *     non-terminal, no pending payment row.
 *   - If EITHER source or target has a pct discount → block (Q4 owner
 *     decision). UI marks pct-discounted siblings as disabled with a hint;
 *     and if source itself has pct, every option disabled with a banner.
 *
 * Loads sibling list fresh on open via fetchSiblingOrdersForTable. No
 * realtime — the cashier pick-window is short (seconds).
 */
export function MergeOrdersSheet({
  open,
  onOpenChange,
  branchId,
  sourceOrderId,
  sourceOrderNumber,
  sourceTableId,
  sourceTableNumber,
  sourceHasPctDiscount,
  isPending = false,
  onSubmit,
}: MergeOrdersSheetProps) {
  const [siblings, setSiblings] = useState<SiblingOrderRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string>("");
  const [, startTransition] = useTransition();
  const [isLoading, setIsLoading] = useState(false);

  const load = useCallback(() => {
    if (sourceTableId == null) {
      setSiblings([]);
      return;
    }
    setIsLoading(true);
    startTransition(async () => {
      const r = await fetchSiblingOrdersForTable({
        branchId,
        tableId: sourceTableId,
        excludeOrderId: sourceOrderId,
      });
      if (r.success && r.data) {
        setSiblings(r.data);
        setError(null);
      } else {
        setSiblings([]);
        setError(r.error ?? POS_VI.mergeLoadFailed);
      }
      setIsLoading(false);
    });
  }, [branchId, sourceTableId, sourceOrderId]);

  useEffect(() => {
    if (open) {
      setSelectedId("");
      load();
    }
  }, [open, load]);

  const selectedSibling =
    selectedId === ""
      ? null
      : ((siblings ?? []).find((s) => String(s.id) === selectedId) ?? null);

  const selectedHasPct =
    selectedSibling != null &&
    selectedSibling.has_discount &&
    selectedSibling.discount_type === "pct";

  const blockedByPct = sourceHasPctDiscount || selectedHasPct;
  const canSubmit = selectedSibling != null && !blockedByPct && !isPending;

  const handleClose = () => {
    if (isPending) return;
    onOpenChange(false);
  };

  const handleSubmit = () => {
    if (!canSubmit || selectedSibling == null) return;
    onSubmit(selectedSibling.id);
  };

  const headerSubtitle = [
    sourceTableNumber != null ? `Bàn ${sourceTableNumber}` : null,
    sourceOrderNumber ? `#${sourceOrderNumber}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Sheet open={open} onOpenChange={(o) => !o && handleClose()}>
      <SheetContent
        side="right"
        className="data-[side=right]:w-full data-[side=right]:sm:max-w-md"
      >
        <SheetHeader>
          <SheetTitle>
            Gộp hóa đơn{headerSubtitle ? ` · ${headerSubtitle}` : ""}
          </SheetTitle>
        </SheetHeader>

        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col gap-2 px-3 py-3 sm:px-4">
            {sourceHasPctDiscount && (
              <Alert variant="destructive">
                <AlertDescription>{POS_VI.mergePctBlock}</AlertDescription>
              </Alert>
            )}

            {isLoading && siblings === null && (
              <>
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </>
            )}

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
                <AlertAction>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={load}
                  >
                    {ACTIONS_VI.retry}
                  </Button>
                </AlertAction>
              </Alert>
            )}

            {!isLoading && !error && siblings && siblings.length === 0 && (
              <p className="text-sm text-muted-foreground">
                {POS_VI.mergeEmpty}
              </p>
            )}

            {siblings && siblings.length > 0 && (
              <RadioGroup value={selectedId} onValueChange={setSelectedId}>
                <ItemGroup className="gap-2">
                  {siblings.map((s) => {
                    const optionId = `merge-target-${s.id}`;
                    const hasPct = s.has_discount && s.discount_type === "pct";
                    return (
                      <Item
                        key={s.id}
                        variant="outline"
                        className="px-3 py-2"
                        data-disabled={hasPct || undefined}
                        role="listitem"
                      >
                        <Label
                          htmlFor={optionId}
                          className="flex w-full cursor-pointer items-center gap-3 font-normal"
                        >
                          <RadioGroupItem
                            id={optionId}
                            value={String(s.id)}
                            disabled={hasPct || isPending}
                          />
                          <ItemContent className="min-w-0">
                            <span className="font-medium">
                              #{s.order_number}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {s.item_count} món
                              {s.has_discount && s.discount_type === "vnd"
                                ? " · có giảm VNĐ (sẽ cộng dồn)"
                                : ""}
                              {hasPct ? " · có giảm % (không gộp được)" : ""}
                            </span>
                          </ItemContent>
                          <span className="shrink-0 whitespace-nowrap text-right text-sm font-semibold tabular-nums">
                            {formatVND(s.total_amount)}
                          </span>
                        </Label>
                      </Item>
                    );
                  })}
                </ItemGroup>
              </RadioGroup>
            )}
          </div>
        </ScrollArea>

        <SheetFooter>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              disabled={isPending}
              onClick={handleClose}
            >
              {ACTIONS_VI.cancel}
            </Button>
            <Button
              type="button"
              className="flex-1"
              disabled={!canSubmit}
              onClick={handleSubmit}
            >
              {POS_VI.mergeConfirm}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
