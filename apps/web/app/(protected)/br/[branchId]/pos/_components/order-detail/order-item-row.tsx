"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@comtammatu/ui";
import { formatVND } from "@comtammatu/shared/format";
import { getStatusBadgeMeta } from "@/components/status-badge";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Item } from "@comtammatu/ui/components/item";
import { getPosLineItemDisplayName, getPosLineItemSummary } from "../../types";
import type { CartModifier, CartSide } from "../../types";
import { PosLineItemCompact } from "../pos-line-item-compact";

export interface OrderItemRowData {
  id: number;
  item_name: string;
  variant_name: string | null;
  quantity: number;
  unit_price: number;
  subtotal: number;
  discount_amount: number;
  discount_type: "pct" | "vnd" | null;
  discount_value: number | null;
  discount_note: string | null;
  status: string;
  modifiers: CartModifier[];
  sides: CartSide[];
  note: string | null;
  is_priority: boolean;
  /** Optional: only present when SELECT includes them (fetchOrderDetail,
   * fetchActiveOrderForTable). Needed by "Sửa món pending" flow to seed the
   * customizer with current variant + lookup MenuItem. */
  menu_item_id?: number;
  variant_id?: number | null;
}

interface OrderItemRowProps {
  row: OrderItemRowData;
  onTap?: (itemId: number) => void;
}

type RowChangeTone = "content" | "quantity" | "status" | "removed" | null;

function getItemStatusToneClass(status: string): string {
  switch (status) {
    case "pending":
    case "preparing":
      return "border-warning/20 bg-warning/10";
    case "ready":
    case "served":
      return "border-success/20 bg-success/10";
    case "cancelled":
      return "border-destructive/20 bg-destructive/10";
    default:
      return "bg-card";
  }
}

function useOrderItemChangeTone(row: OrderItemRowData): RowChangeTone {
  const signature = useMemo(
    () =>
      JSON.stringify({
        quantity: row.quantity,
        itemName: row.item_name,
        variantName: row.variant_name,
        unitPrice: row.unit_price,
        subtotal: row.subtotal,
        discountAmount: row.discount_amount,
        discountType: row.discount_type,
        discountValue: row.discount_value,
        discountNote: row.discount_note,
        status: row.status,
        modifiers: row.modifiers,
        sides: row.sides,
        note: row.note,
        isPriority: row.is_priority,
      }),
    [
      row.item_name,
      row.modifiers,
      row.note,
      row.quantity,
      row.sides,
      row.status,
      row.subtotal,
      row.discount_amount,
      row.discount_type,
      row.discount_value,
      row.discount_note,
      row.unit_price,
      row.variant_name,
      row.is_priority,
    ],
  );
  const previousRef = useRef<{
    signature: string;
    quantity: number;
    status: string;
  } | null>(null);
  const [tone, setTone] = useState<RowChangeTone>(null);

  useEffect(() => {
    const previous = previousRef.current;
    previousRef.current = {
      signature,
      quantity: row.quantity,
      status: row.status,
    };

    if (!previous || previous.signature === signature) return;

    const nextTone: RowChangeTone =
      row.status === "cancelled"
        ? "removed"
        : row.quantity !== previous.quantity
          ? "quantity"
          : row.status !== previous.status
            ? "status"
            : "content";

    setTone(nextTone);
    const timeout = window.setTimeout(() => setTone(null), 1600);
    return () => window.clearTimeout(timeout);
  }, [row.quantity, row.status, signature]);

  return tone;
}

function getRowChangeToneClass(tone: RowChangeTone): string | false {
  if (tone === "quantity") {
    return "bg-warning/10 ring-2 ring-inset ring-warning/20 motion-safe:animate-pulse";
  }
  if (tone === "removed") {
    return "bg-destructive/10 ring-2 ring-inset ring-destructive/20";
  }
  if (tone === "status") {
    return "bg-success/10 ring-2 ring-inset ring-success/20";
  }
  if (tone === "content") {
    return "bg-info/10 ring-2 ring-inset ring-info/20";
  }
  return false;
}

export function OrderItemRow({ row, onTap }: OrderItemRowProps) {
  const cancelled = row.status === "cancelled";
  const displayName = getPosLineItemDisplayName(row);
  const statusInfo = getStatusBadgeMeta("order-item", row.status);
  const summary = getPosLineItemSummary(row);
  const changeTone = useOrderItemChangeTone(row);
  const discountAmount = Math.max(0, Number(row.discount_amount ?? 0));
  const netSubtotal = Math.max(0, row.subtotal - discountAmount);
  const discountLine =
    discountAmount > 0 ? `Chiết khấu món: -${formatVND(discountAmount)}` : null;

  return (
    <li className="w-full min-w-0 max-w-full">
      <Item
        variant="outline"
        size="sm"
        className={cn(
          "w-full min-w-0 max-w-full rounded-none p-0 transition-colors duration-150",
          getItemStatusToneClass(row.status),
          getRowChangeToneClass(changeTone),
          cancelled && "border-dashed",
        )}
      >
        <Button
          type="button"
          variant="ghost"
          size="touch"
          className="w-full min-w-0 max-w-full justify-start whitespace-normal rounded-none px-2 py-2 text-left hover:bg-transparent sm:px-3"
          aria-label={`${displayName}, ${statusInfo.label}`}
          onClick={() => onTap?.(row.id)}
        >
          <PosLineItemCompact
            quantity={row.quantity}
            title={displayName}
            total={formatVND(netSubtotal)}
            options={summary.options}
            modifiers={summary.modifiers}
            sides={summary.sides}
            discount={discountLine}
            note={summary.note}
            isPriority={summary.isPriority}
            quantityClassName={cancelled ? "opacity-50" : undefined}
            titleClassName={cancelled ? "line-through opacity-60" : undefined}
            totalClassName={
              cancelled
                ? "text-muted-foreground line-through opacity-60"
                : undefined
            }
            optionsClassName={cancelled ? "line-through opacity-60" : undefined}
            noteClassName={cancelled ? "line-through opacity-60" : undefined}
            afterTitle={
              <Badge
                variant={statusInfo.variant}
                className="h-5 shrink-0 px-1.5 py-0 text-xs font-semibold uppercase tracking-wide"
              >
                {statusInfo.label}
              </Badge>
            }
          />
        </Button>
      </Item>
    </li>
  );
}
