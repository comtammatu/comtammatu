"use client";

import { useState, useTransition } from "react";
import {
  Sparkles as IconSparkles,
  Check as IconCheck,
  Building2 as IconBuilding,
  Truck as IconTruck,
  ChefHat as IconChefHat,
  AlertTriangle as IconAlert,
} from "lucide-react";
import { formatQuantity } from "@comtammatu/shared/format";
import { ACTIONS_VI, INVENTORY_VI } from "@comtammatu/shared/messages";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { AppDialog } from "@/components/form";
import { Frame } from "@comtammatu/ui/components/frame";
import { Input } from "@comtammatu/ui/components/input";
import type { ReorderSuggestionItem, SupplyChannel } from "@lib/inventory/smart-reorder-data";
import { createReorderDraftDemandsAction } from "@/(protected)/inventory/stock-actions";

export function SmartReorderSheet({
  branchId,
  branchName,
  items,
}: {
  branchId: number;
  branchName?: string | null;
  items: ReorderSuggestionItem[];
}) {
  const [open, setOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(
    new Set(items.filter((i) => i.isBelowMin).map((i) => i.ingredientId)),
  );
  const [quantities, setQuantities] = useState<Map<number, number>>(
    new Map(items.map((i) => [i.ingredientId, i.suggestedReorderQty || 1])),
  );
  const [isPending, startTransition] = useTransition();
  const [successResult, setSuccessResult] = useState<{
    poCount: number;
    trCount: number;
  } | null>(null);

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedIds.size === items.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(items.map((i) => i.ingredientId)));
    }
  };

  const handleQtyChange = (id: number, val: string) => {
    const num = Math.max(1, Number(val) || 1);
    setQuantities((prev) => new Map(prev).set(id, num));
  };

  const handleCreateDrafts = () => {
    const selectedItems = items.filter((i) => selectedIds.has(i.ingredientId));
    if (selectedItems.length === 0) return;

    startTransition(async () => {
      const res = await createReorderDraftDemandsAction({
        branchId,
        items: selectedItems.map((i) => ({
          ingredientId: i.ingredientId,
          quantity: quantities.get(i.ingredientId) ?? i.suggestedReorderQty ?? 1,
          entryUnitId: i.baseUnitId ?? 1,
          supplyChannel: i.supplyChannel,
        })),
      });

      if (res.success && res.data) {
        setSuccessResult({
          poCount: res.data.createdPurchaseDemandCount,
          trCount: res.data.createdStockRequestCount,
        });
        setTimeout(() => {
          setSuccessResult(null);
          setOpen(false);
        }, 1500);
      }
    });
  };

  const getChannelBadge = (channel: SupplyChannel) => {
    switch (channel) {
      case "internal_transfer_kitchen":
        return (
          <Badge variant="info" className="gap-1">
            <IconChefHat className="size-3" />
            <span>{INVENTORY_VI.smartReorderChannelKitchen}</span>
          </Badge>
        );
      case "internal_transfer_supply":
        return (
          <Badge variant="secondary" className="gap-1">
            <IconBuilding className="size-3" />
            <span>{INVENTORY_VI.smartReorderChannelSupply}</span>
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="gap-1">
            <IconTruck className="size-3" />
            <span>{INVENTORY_VI.smartReorderChannelSupplier}</span>
          </Badge>
        );
    }
  };

  return (
    <>
      <Button
        variant="default"
        size="sm"
        className="gap-1.5"
        onClick={() => setOpen(true)}
      >
        <IconSparkles className="size-4" />
        <span>{INVENTORY_VI.smartReorderOpenBtn}</span>
        {items.filter((i) => i.isBelowMin).length > 0 && (
          <Badge variant="destructive" className="ml-1 px-1.5 h-4 text-2xs">
            {items.filter((i) => i.isBelowMin).length}
          </Badge>
        )}
      </Button>

      <AppDialog
        open={open}
        onOpenChange={setOpen}
        title={
          <div className="flex items-center gap-2">
            <IconSparkles className="size-5 text-primary" />
            <span>{INVENTORY_VI.smartReorderTitle}</span>
          </div>
        }
        description={`${branchName ? `${branchName} — ` : ""}${INVENTORY_VI.smartReorderDescription}`}
        contentClassName="max-w-3xl"
        footer={
          <div className="flex w-full items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {INVENTORY_VI.branchThresholdsItemCount(selectedIds.size)}
            </span>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>
                {ACTIONS_VI.cancel}
              </Button>
              <Button
                onClick={handleCreateDrafts}
                disabled={selectedIds.size === 0 || isPending || successResult !== null}
              >
                {successResult ? (
                  <>
                    <IconCheck className="size-4 mr-1 text-success" />
                    <span>{INVENTORY_VI.smartReorderCreatedSuccess}</span>
                  </>
                ) : isPending ? (
                  INVENTORY_VI.submittingEllipsis
                ) : (
                  INVENTORY_VI.smartReorderCreateDraftsBtn(selectedIds.size)
                )}
              </Button>
            </div>
          </div>
        }
      >
        <div className="flex flex-col gap-3 max-h-96 overflow-y-auto">
          {/* Action bar */}
          <div className="flex items-center justify-between py-1">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSelectAll}
              className="text-xs"
            >
              {selectedIds.size === items.length
                ? ACTIONS_VI.deselectAll
                : INVENTORY_VI.smartReorderSelectAll}
            </Button>
            <span className="text-xs text-muted-foreground tabular-nums">
              {INVENTORY_VI.smartReorderSelectedCount(selectedIds.size, items.length)}
            </span>
          </div>

          {/* List */}
          <div className="flex flex-col gap-2">
            {items.map((item) => {
              const isSelected = selectedIds.has(item.ingredientId);
              const qty = quantities.get(item.ingredientId) ?? item.suggestedReorderQty ?? 1;

              return (
                <Frame
                  key={item.ingredientId}
                  className={`p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer transition-colors ${
                    isSelected ? "border-primary bg-muted" : ""
                  }`}
                  onClick={() => toggleSelect(item.ingredientId)}
                >
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(item.ingredientId)}
                      className="mt-1 size-4 rounded border-border"
                      onClick={(e) => e.stopPropagation()}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-sm truncate">
                          {item.ingredientName}
                        </span>
                        {item.isBelowMin && (
                          <Badge variant="destructive" className="gap-1 text-2xs">
                            <IconAlert className="size-3" />
                            <span>{INVENTORY_VI.underThresholdBadge}</span>
                          </Badge>
                        )}
                        {getChannelBadge(item.supplyChannel)}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                        <span>
                          {INVENTORY_VI.currentOnHandLabel}{" "}
                          <strong className="text-foreground font-semibold">
                            {formatQuantity(item.currentOnHand)} {item.baseUnitCode || "đv"}
                          </strong>
                        </span>
                        <span>
                          {INVENTORY_VI.minStockLabel}{" "}
                          <strong className="text-foreground font-semibold">
                            {formatQuantity(item.minStockLevel)} {item.baseUnitCode || "đv"}
                          </strong>
                        </span>
                      </div>
                    </div>
                  </div>

                  <div
                    className="flex items-center gap-2 shrink-0 sm:self-center"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <label className="text-2xs text-muted-foreground">{INVENTORY_VI.suggestedQtyLabel}</label>
                    <Input
                      type="number"
                      min={1}
                      value={qty}
                      onChange={(e) => handleQtyChange(item.ingredientId, e.target.value)}
                      className="h-8 w-24 text-xs tabular-nums font-semibold"
                    />
                    <span className="text-xs text-muted-foreground w-8">
                      {item.baseUnitCode || "đv"}
                    </span>
                  </div>
                </Frame>
              );
            })}

            {items.length === 0 && (
              <div className="p-3 text-center text-sm text-muted-foreground">
                {INVENTORY_VI.smartReorderAllSafe}
              </div>
            )}
          </div>
        </div>
      </AppDialog>
    </>
  );
}
