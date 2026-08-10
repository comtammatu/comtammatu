"use client";

import Link from "next/link";
import { formatVNDate } from "@comtammatu/shared/time";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Item, ItemHeader, ItemTitle } from "@comtammatu/ui/components/item";
import { AppDialog, QuantityInput } from "@/components/form";
import { type PurchaseRequestRow } from "@lib/inventory/purchase-request-model";
import { messages } from "@lib/messages";
import {
  type PurchaseOrderDraft,
  type PurchaseOrderDraftLine,
} from "./purchase-order-drafts";

const copy = messages.inventory.purchaseRequests;

export function PurchaseRequestAllocateDialog({
  open,
  selected,
  allocationDrafts,
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
}: {
  open: boolean;
  selected: PurchaseRequestRow | null;
  allocationDrafts: PurchaseOrderDraft[];
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
    supplierId: number,
    key: string,
    patch: Partial<PurchaseOrderDraftLine>,
  ) => void;
}) {
  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      variant="document"
      title={copy.allocateTitle}
      description={
        selected
          ? `${selected.code} · ${selected.branchName}${
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
      {missingSupplierItems.length > 0 ? (
        <Item
          variant="muted"
          size="sm"
          className="items-start flex-col sm:flex-row"
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
                {supplierDrafts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {copy.noActiveSuppliers}
                  </p>
                ) : (
                  supplierDrafts.map((draft) => {
                    const line = draft.lines[0];
                    if (!line) return null;
                    return (
                      <div
                        key={draft.supplierId}
                        className="grid items-center gap-2 sm:grid-cols-[minmax(0,1fr)_10rem]"
                      >
                        <span className="text-sm">{draft.supplierName}</span>
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
                          aria-label={`${draft.supplierName}: ${copy.quantity}`}
                        />
                      </div>
                    );
                  })
                )}
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
    </AppDialog>
  );
}
