"use client";

import Link from "next/link";
import { Plus as IconPlus, Trash as IconTrash } from "lucide-react";
import { formatVNDate } from "@comtammatu/shared/time";
import { ACTIONS_VI } from "@comtammatu/shared/messages";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Item, ItemHeader, ItemTitle } from "@comtammatu/ui/components/item";
import { ScrollArea } from "@comtammatu/ui/components/scroll-area";
import { AppDialog, Combobox, QuantityInput } from "@/components/form";
import {
  purchaseRequestStatusVariant,
  type PurchaseRequestRow,
} from "@lib/inventory/purchase-request-model";
import { messages } from "@lib/messages";
import {
  canAddPurchaseDemandAllocationRow,
  matchingSuppliersForIngredient,
  type PurchaseOrderDraft,
  type PurchaseOrderDraftLine,
  type PurchaseOrderSupplier,
} from "./purchase-order-drafts";

const copy = messages.inventory.purchaseRequests;
const detailCopy = copy.detail;

export function PurchaseRequestAllocateDialog({
  open,
  selected,
  allocationDrafts,
  suppliers,
  missingSupplierItems,
  allocationComplete,
  totals,
  isPending,
  onOpenChange,
  onRequestChanges,
  onReject,
  onSaveDraft,
  onApprove,
  onPatchAllocation,
  onAddAllocationRow,
  onRemoveAllocationRow,
  onChangeAllocationSupplier,
}: {
  open: boolean;
  selected: PurchaseRequestRow | null;
  allocationDrafts: PurchaseOrderDraft[];
  suppliers: PurchaseOrderSupplier[];
  missingSupplierItems: PurchaseRequestRow["items"];
  allocationComplete: boolean;
  totals: Map<number, number>;
  isPending: boolean;
  onOpenChange: (open: boolean) => void;
  onRequestChanges: () => void;
  onReject: () => void;
  onSaveDraft: () => void;
  onApprove: () => void;
  onPatchAllocation: (
    supplierId: number | null,
    key: string,
    patch: Partial<PurchaseOrderDraftLine>,
  ) => void;
  onAddAllocationRow: (requestItemId: number, ingredientId: number) => void;
  onRemoveAllocationRow: (supplierId: number | null, key: string) => void;
  onChangeAllocationSupplier: (
    fromSupplierId: number | null,
    key: string,
    toSupplierId: number | null,
  ) => void;
}) {
  const openLineCount = selected
    ? Math.max(selected.lineCount - selected.orderedLineCount, 0)
    : 0;

  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      variant="document"
      title={
        selected ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{selected.code}</span>
            <Badge variant={purchaseRequestStatusVariant(selected.status)}>
              {copy.statusLabel(selected.status)}
            </Badge>
          </div>
        ) : (
          copy.allocateTitle
        )
      }
      description={
        selected
          ? `${selected.branchName}${
              selected.neededBy
                ? ` · Cần ${formatVNDate(selected.neededBy)}`
                : ""
            }`
          : undefined
      }
      footer={
        <>
          <div className="mr-auto flex gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={onRequestChanges}
            >
              {copy.requestChangesAction}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={isPending}
              onClick={onReject}
            >
              {copy.rejectAction}
            </Button>
          </div>
          <Button
            type="button"
            variant="secondary"
            disabled={isPending}
            onClick={onSaveDraft}
          >
            {copy.saveAllocationAction}
          </Button>
          <Button
            type="button"
            disabled={isPending || !allocationComplete}
            onClick={onApprove}
          >
            {copy.approveAllocationAction}
          </Button>
        </>
      }
    >
      {selected ? (
        <Item
          variant="outline"
          className="mb-4 grid shrink-0 grid-cols-2 gap-4 p-4 text-xs sm:grid-cols-4"
        >
          <div className="min-w-0">
            <span className="block font-medium text-muted-foreground">
              {detailCopy.kpiLines}
            </span>
            <span className="mt-1 block font-mono text-base font-semibold tabular-nums text-foreground">
              {selected.lineCount}
            </span>
          </div>
          <div className="min-w-0">
            <span className="block font-medium text-muted-foreground">
              {detailCopy.kpiOrdered}
            </span>
            <span className="mt-1 block font-mono text-base font-semibold tabular-nums text-foreground">
              {selected.orderedLineCount}
            </span>
          </div>
          <div className="min-w-0">
            <span className="block font-medium text-muted-foreground">
              {detailCopy.kpiOpen}
            </span>
            <span
              className={
                openLineCount > 0
                  ? "mt-1 block font-mono text-base font-semibold tabular-nums text-destructive"
                  : "mt-1 block font-mono text-base font-semibold tabular-nums text-foreground"
              }
            >
              {openLineCount}
            </span>
          </div>
          <div className="min-w-0">
            <span className="block font-medium text-muted-foreground">
              {detailCopy.kpiNeeded}
            </span>
            <span className="mt-1 block font-mono text-base font-semibold tabular-nums text-foreground">
              {selected.neededBy ? formatVNDate(selected.neededBy) : "—"}
            </span>
          </div>
        </Item>
      ) : null}
      {missingSupplierItems.length > 0 ? (
        <Item
          variant="muted"
          size="sm"
          className="mb-4 items-start flex-col sm:flex-row"
        >
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <p className="font-medium">{copy.missingSupplierMappingsTitle}</p>
            <p className="text-sm text-muted-foreground">
              {missingSupplierItems
                .map((item) => item.ingredientName)
                .join(", ")}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            render={<Link href="/inventory/suppliers" />}
          >
            {copy.manageSuppliersAction}
          </Button>
        </Item>
      ) : null}
      <div className="flex flex-col gap-3">
        {selected ? (
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h4 className="text-sm font-semibold">{copy.linesTitle}</h4>
            <p className="text-xs text-muted-foreground">
              {detailCopy.sectionLineCount(selected.items.length)}
            </p>
          </div>
        ) : null}
        <ScrollArea className="h-80">
          <div className="flex flex-col gap-3 pr-2">
            {selected?.items.map((item) => {
              const supplierDrafts = allocationDrafts
                .map((draft) => ({
                  ...draft,
                  lines: draft.lines.filter(
                    (line) => line.requestItemId === item.id,
                  ),
                }))
                .filter((draft) => draft.lines.length > 0);
              const allocated = totals.get(item.id) ?? 0;
              const remaining = item.remainingQuantity - allocated;
              const mapped = matchingSuppliersForIngredient(
                item.ingredientId,
                suppliers,
              );
              const usedSupplierIds = new Set(
                supplierDrafts.flatMap((draft) =>
                  draft.supplierId != null ? [draft.supplierId] : [],
                ),
              );
              const rowCount = supplierDrafts.reduce(
                (count, draft) => count + draft.lines.length,
                0,
              );
              const canAdd = canAddPurchaseDemandAllocationRow(
                allocationDrafts,
                item.id,
                item.ingredientId,
                suppliers,
              );
              return (
                <Item key={item.id} variant="outline" className="items-stretch">
                  <ItemHeader>
                    <ItemTitle size="heading">{item.ingredientName}</ItemTitle>
                    <Badge
                      variant={
                        Math.abs(remaining) <= 0.0005 ? "success" : "warning"
                      }
                    >
                      {allocated}/{item.remainingQuantity} {item.unitLabel}
                    </Badge>
                  </ItemHeader>
                  <div className="flex basis-full flex-col gap-2">
                    {mapped.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        {copy.noActiveSuppliers}
                      </p>
                    ) : (
                      supplierDrafts.flatMap((draft) =>
                        draft.lines.map((line) => {
                          const options = mapped
                            .filter(
                              (supplier) =>
                                supplier.id === draft.supplierId ||
                                !usedSupplierIds.has(supplier.id),
                            )
                            .map((supplier) => ({
                              value: String(supplier.id),
                              label: supplier.name,
                            }));
                          return (
                            <div
                              key={line.key}
                              className="grid items-center gap-2 sm:grid-cols-[minmax(0,1fr)_10rem_auto]"
                            >
                              <Combobox
                                size="field"
                                value={
                                  draft.supplierId != null
                                    ? String(draft.supplierId)
                                    : ""
                                }
                                onValueChange={(value) =>
                                  onChangeAllocationSupplier(
                                    draft.supplierId,
                                    line.key,
                                    value ? Number(value) : null,
                                  )
                                }
                                options={options}
                                placeholder={copy.chooseSupplier}
                                aria-label={`${item.ingredientName}: ${copy.supplier}`}
                              />
                              <QuantityInput
                                controlSize="field"
                                value={line.quantity}
                                onValueChange={(value) =>
                                  onPatchAllocation(draft.supplierId, line.key, {
                                    quantity: value,
                                  })
                                }
                                maxFractionDigits={3}
                                placeholder={copy.quantity}
                                aria-label={`${item.ingredientName}: ${copy.quantity}`}
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-lg"
                                disabled={rowCount <= 1}
                                onClick={() =>
                                  onRemoveAllocationRow(
                                    draft.supplierId,
                                    line.key,
                                  )
                                }
                                aria-label={ACTIONS_VI.delete}
                              >
                                <IconTrash />
                              </Button>
                            </div>
                          );
                        }),
                      )
                    )}
                    {canAdd ? (
                      <Button
                        type="button"
                        variant="outline"
                        className="self-start"
                        onClick={() =>
                          onAddAllocationRow(item.id, item.ingredientId)
                        }
                      >
                        <IconPlus data-icon="inline-start" />
                        {copy.addAllocationLine}
                      </Button>
                    ) : null}
                    <p className="text-xs text-muted-foreground">
                      {copy.allocationProgress(
                        allocated,
                        remaining,
                        item.unitLabel,
                      )}
                    </p>
                  </div>
                </Item>
              );
            })}
          </div>
        </ScrollArea>
      </div>
    </AppDialog>
  );
}
