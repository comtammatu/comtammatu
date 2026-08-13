"use client";

import { useMemo } from "react";

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
import { AppSheet } from "@/components/surface";

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
    <AppSheet
      open={selectedOrder != null}
      onOpenChange={(open) => {
        if (!open) overlay.clearOverlay(RECORDED_ORDER_OVERLAY_KEYS, "replace");
      }}
      title={
        selectedOrder
          ? INVENTORY_VI.recordedOrderDetailTitle(selectedOrder.orderNumber)
          : INVENTORY_VI.recordedOrderDetailTitle("")
      }
      description={
        selectedOrder
          ? `${selectedOrder.recordedAtLabel} · ${selectedOrder.branchName}`
          : undefined
      }
    >
      {selectedOrder ? (
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
                    {line.unitCostLabel ? `${line.unitCostLabel} · ` : ""}
                    {line.totalCostLabel ?? "—"}
                  </p>
                ) : null}
              </ItemContent>
            </Item>
          ))}
        </ItemGroup>
      ) : null}
    </AppSheet>
  );
}

export function useRecordedConsumptionOverlay() {
  return useDocumentOverlayUrl(RECORDED_ORDER_OVERLAY_KEYS);
}
