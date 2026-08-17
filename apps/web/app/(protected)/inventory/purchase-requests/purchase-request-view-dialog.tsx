"use client";

import Link from "next/link";
import { ACTIONS_VI } from "@comtammatu/shared/messages";
import { formatVNDate } from "@comtammatu/shared/time";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Item } from "@comtammatu/ui/components/item";
import { ScrollArea } from "@comtammatu/ui/components/scroll-area";
import { AppDialog } from "@/components/form";
import {
  purchaseRequestStatusVariant,
  type PurchaseRequestRow,
} from "@lib/inventory/purchase-request-model";
import { messages } from "@lib/messages";
import {
  buildAutomaticPurchaseDemandAllocations,
  type PurchaseOrderSupplier,
} from "./purchase-order-drafts";

const copy = messages.inventory.purchaseRequests;
const detailCopy = copy.detail;

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
          copy.title
        )
      }
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
        <div className="flex flex-col gap-6">
          {selected.statusReason ? (
            <Item variant="muted" size="sm">
              {selected.statusReason}
            </Item>
          ) : null}
          <Item
            variant="outline"
            className="grid shrink-0 grid-cols-2 gap-4 p-4 text-xs sm:grid-cols-3 lg:grid-cols-5"
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
                {detailCopy.kpiOrders}
              </span>
              <span className="mt-1 block font-mono text-base font-semibold tabular-nums text-foreground">
                {selected.purchaseOrders.length}
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
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h4 className="text-sm font-semibold">{copy.linesTitle}</h4>
              <p className="text-xs text-muted-foreground">
                {detailCopy.sectionLineCount(selected.items.length)}
              </p>
            </div>
            <ScrollArea className="h-64">
              <div className="flex flex-col gap-2 pr-2">
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
            </ScrollArea>
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h4 className="text-sm font-semibold">
                {copy.purchaseOrdersTitle}
              </h4>
              <p className="text-xs text-muted-foreground">
                {detailCopy.sectionOrderCount(selected.purchaseOrders.length)}
              </p>
            </div>
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
