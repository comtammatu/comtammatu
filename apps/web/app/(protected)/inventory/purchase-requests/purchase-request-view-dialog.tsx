"use client";

import Link from "next/link";
import { ACTIONS_VI } from "@comtammatu/shared/messages";
import { formatVNDate } from "@comtammatu/shared/time";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Item } from "@comtammatu/ui/components/item";
import { AppDialog } from "@/components/form";
import { DescriptionList } from "@/components/surface";
import { type PurchaseRequestRow } from "@lib/inventory/purchase-request-model";
import { messages } from "@lib/messages";
import {
  buildAutomaticPurchaseDemandAllocations,
  type PurchaseOrderSupplier,
} from "./purchase-order-drafts";

const copy = messages.inventory.purchaseRequests;

export function PurchaseRequestViewDialog({
  open,
  selected,
  canCreateRequest,
  canAllocate,
  canReviewSelected,
  isPending,
  pendingId,
  suppliers,
  onOpenChange,
  onEdit,
  onClose,
  onCopyFromSelected,
  onRequestChanges,
  onReject,
  onSupplierDecision,
}: {
  open: boolean;
  selected: PurchaseRequestRow | null;
  canCreateRequest: boolean;
  canAllocate: boolean;
  canReviewSelected: boolean;
  isPending: boolean;
  pendingId: number | null;
  suppliers: PurchaseOrderSupplier[];
  onOpenChange: (open: boolean) => void;
  onEdit: () => void;
  onClose: () => void;
  onCopyFromSelected: () => void;
  onRequestChanges: () => void;
  onReject: () => void;
  onSupplierDecision: () => void;
}) {
  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      variant="document"
      title={selected?.code ?? copy.title}
      description={selected?.branchName}
      footer={
        selected ? (
          <>
            {canReviewSelected ? (
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
            ) : null}
            {canCreateRequest &&
            (selected.status === "draft" ||
              selected.status === "changes_requested" ||
              selected.status === "pending_allocation") ? (
              <Button type="button" variant="outline" onClick={onEdit}>
                {ACTIONS_VI.edit}
              </Button>
            ) : null}
            {canCreateRequest && selected.status === "cancelled" ? (
              <Button type="button" onClick={onCopyFromSelected}>
                {copy.copyToNewAction}
              </Button>
            ) : null}
            <Button type="button" variant="outline" onClick={onClose}>
              {ACTIONS_VI.close}
            </Button>
            {canAllocate &&
            (selected.status === "submitted" ||
              selected.status === "pending_allocation" ||
              selected.status === "partially_ordered") ? (
              <Button
                type="button"
                disabled={isPending || pendingId === selected.id}
                onClick={onSupplierDecision}
              >
                {buildAutomaticPurchaseDemandAllocations(
                  selected.items,
                  suppliers,
                ) == null
                  ? copy.allocateAction
                  : copy.approveAllocationAction}
              </Button>
            ) : null}
          </>
        ) : null
      }
    >
      {selected ? (
        <div className="flex flex-col gap-4">
          {selected.statusReason ? (
            <Item variant="muted" size="sm">
              {selected.statusReason}
            </Item>
          ) : null}
          <DescriptionList
            className="sm:grid sm:grid-cols-3 sm:gap-4"
            items={[
              {
                term: copy.statusColumn,
                description: copy.statusLabel(selected.status),
              },
              {
                term: copy.neededBy,
                description: selected.neededBy
                  ? formatVNDate(selected.neededBy)
                  : "—",
              },
              {
                term: copy.progressColumn,
                description: copy.orderedProgress(
                  selected.orderedLineCount,
                  selected.lineCount,
                ),
              },
            ]}
          />
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">{copy.linesTitle}</p>
            {selected.items.map((item) => (
              <Item
                key={item.id}
                variant="outline"
                size="sm"
                className="grid gap-1 text-sm sm:grid-cols-[minmax(0,1fr)_auto]"
              >
                <span>{item.ingredientName}</span>
                <span className="font-mono tabular-nums">
                  {item.orderedQuantity}/{item.quantity} {item.unitLabel}
                </span>
              </Item>
            ))}
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">{copy.purchaseOrdersTitle}</p>
            {selected.purchaseOrders.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {copy.noPurchaseOrders}
              </p>
            ) : (
              selected.purchaseOrders.map((po) => (
                <Button
                  key={po.id}
                  type="button"
                  variant="outline"
                  className="justify-between"
                  render={
                    <Link
                      href={`/inventory/purchase-orders?tab=orders&poId=${po.id}&mode=view`}
                    />
                  }
                >
                  <span className="font-mono">{po.code}</span>
                  <span>{po.supplierName}</span>
                </Button>
              ))
            )}
          </div>
        </div>
      ) : null}
    </AppDialog>
  );
}
