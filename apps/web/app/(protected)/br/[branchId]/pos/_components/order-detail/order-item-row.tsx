"use client";

import { cn } from "@comtammatu/ui";
import { formatVND } from "@comtammatu/shared/format";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Item } from "@comtammatu/ui/components/item";
import {
  getPosLineItemDisplayName,
  getPosLineItemSummary,
} from "../../types";
import type { CartModifier, CartSide } from "../../types";
import { PosLineItemCompact } from "../pos-line-item-compact";

export interface OrderItemRowData {
  id: number;
  item_name: string;
  variant_name: string | null;
  quantity: number;
  unit_price: number;
  subtotal: number;
  status: string;
  modifiers: CartModifier[];
  sides: CartSide[];
  note: string | null;
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

type StatusBadgeVariant =
  | "warning"
  | "info"
  | "success"
  | "destructive"
  | "outline";

const ITEM_STATUS_META: Record<
  string,
  { label: string; variant: StatusBadgeVariant }
> = {
  pending: { label: "Chờ", variant: "warning" },
  preparing: { label: "Đang làm", variant: "warning" },
  ready: { label: "Sẵn sàng", variant: "info" },
  served: { label: "Đã phục vụ", variant: "success" },
  cancelled: { label: "Đã hủy", variant: "destructive" },
};

function getItemStatusToneClass(status: string): string {
  switch (status) {
    case "pending":
    case "preparing":
      return "border-warning/30 bg-warning/10";
    case "ready":
      return "border-info/30 bg-info/10";
    case "served":
      return "border-success/30 bg-success/10";
    case "cancelled":
      return "border-destructive/30 bg-destructive/10";
    default:
      return "bg-card";
  }
}

export function OrderItemRow({ row, onTap }: OrderItemRowProps) {
  const cancelled = row.status === "cancelled";
  const displayName = getPosLineItemDisplayName(row);
  const statusInfo =
    ITEM_STATUS_META[row.status] ?? { label: row.status, variant: "outline" };
  const summary = getPosLineItemSummary(row);

  return (
    <li className="w-full min-w-0 max-w-full">
      <Item
        variant="outline"
        size="sm"
        className={cn(
          "h-20 w-full min-w-0 max-w-full overflow-hidden rounded-none p-0 shadow-sm transition-colors",
          getItemStatusToneClass(row.status),
          cancelled && "border-dashed",
        )}
      >
        <Button
          type="button"
          variant="ghost"
          className="h-full w-full min-w-0 max-w-full justify-start whitespace-normal rounded-none px-3 py-2 text-left hover:bg-transparent sm:px-4"
          aria-label={`${displayName}, ${statusInfo.label}`}
          onClick={() => onTap?.(row.id)}
        >
          <PosLineItemCompact
            quantity={row.quantity}
            title={displayName}
            total={formatVND(row.subtotal)}
            options={summary.options}
            note={summary.note}
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
