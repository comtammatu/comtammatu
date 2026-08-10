"use client";

import { useMemo } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@comtammatu/ui/components/sheet";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { useDocumentOverlayUrl } from "@lib/navigation/use-document-overlay-url";
import { INVENTORY_VI } from "@comtammatu/shared/messages";
import type { RecordedConsumptionRow } from "./issue-list-types";

const RECORDED_ORDER_OVERLAY_KEYS = ["recordedOrderId"] as const;

export function RecordedConsumptionSheet({
  orders,
  canViewMonetary,
}: {
  orders: RecordedConsumptionRow[];
  canViewMonetary: boolean;
}) {
  const overlay = useDocumentOverlayUrl(RECORDED_ORDER_OVERLAY_KEYS);
  const recordedOrderId = overlay.get("recordedOrderId");
  const selectedOrder = useMemo(() => {
    if (!recordedOrderId) return null;
    return (
      orders.find((order) => String(order.orderId) === recordedOrderId) ??
      null
    );
  }, [orders, recordedOrderId]);

  return (
    <Sheet
      open={selectedOrder != null}
      onOpenChange={(open) => {
        if (!open) overlay.clearOverlay(RECORDED_ORDER_OVERLAY_KEYS, "replace");
      }}
    >
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        {selectedOrder ? (
          <>
            <SheetHeader>
              <SheetTitle>
                {INVENTORY_VI.recordedOrderDetailTitle(
                  selectedOrder.orderNumber,
                )}
              </SheetTitle>
              <p className="text-sm text-muted-foreground">
                {selectedOrder.recordedAtLabel} · {selectedOrder.branchName}
              </p>
            </SheetHeader>
            <div className="flex flex-col gap-3 px-4 pb-4">
              <ItemGroup className="flex flex-col gap-2">
                {selectedOrder.lines.map((line) => (
                  <Item key={line.id} variant="outline" size="sm">
                    <ItemContent className="min-w-0 gap-1">
                      <ItemTitle>{line.ingredientName}</ItemTitle>
                      <ItemDescription className="line-clamp-none">
                        {line.quantityLabel} · {line.locationName}
                      </ItemDescription>
                      {canViewMonetary ? (
                        <p className="font-mono text-sm tabular-nums">
                          {line.unitCostLabel
                            ? `${line.unitCostLabel} · `
                            : ""}
                          {line.totalCostLabel ?? "—"}
                        </p>
                      ) : null}
                    </ItemContent>
                  </Item>
                ))}
              </ItemGroup>
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

export function useRecordedConsumptionOverlay() {
  return useDocumentOverlayUrl(RECORDED_ORDER_OVERLAY_KEYS);
}
