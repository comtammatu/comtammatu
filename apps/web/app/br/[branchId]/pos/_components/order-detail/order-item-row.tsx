"use client";

import { cn } from "@comtammatu/ui";
import { formatVND } from "@comtammatu/shared/format";
import { Button } from "@comtammatu/ui/components/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import {
  IconCircle,
  IconCircleCheck,
  IconLoader2,
  IconToolsKitchen,
} from "@tabler/icons-react";
import type { CartModifier, CartSide } from "../../types";

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
}

function itemStatusMeta(status: string): {
  label: string;
  Icon: typeof IconCircle;
  ariaLabel: string;
} {
  switch (status) {
    case "pending":
      return {
        label: "Chờ",
        Icon: IconCircle,
        ariaLabel: "Trạng thái món: chờ xử lý",
      };
    case "preparing":
      return {
        label: "Đang làm",
        Icon: IconLoader2,
        ariaLabel: "Trạng thái món: đang làm",
      };
    case "ready":
      return {
        label: "Sẵn sàng",
        Icon: IconCircleCheck,
        ariaLabel: "Trạng thái món: sẵn sàng",
      };
    case "served":
      return {
        label: "Đã phục vụ",
        Icon: IconToolsKitchen,
        ariaLabel: "Trạng thái món: đã phục vụ",
      };
    case "cancelled":
      return {
        label: "Đã hủy",
        Icon: IconCircle,
        ariaLabel: "Trạng thái món: đã hủy",
      };
    default:
      return {
        label: status,
        Icon: IconCircle,
        ariaLabel: `Trạng thái món: ${status}`,
      };
  }
}

interface OrderItemRowProps {
  row: OrderItemRowData;
  canManage: boolean;
  onVoid: (itemId: number) => void;
}

export function OrderItemRow({ row, canManage, onVoid }: OrderItemRowProps) {
  const meta = itemStatusMeta(row.status);
  const Icon = meta.Icon;
  const cancelled = row.status === "cancelled";
  const canVoid =
    canManage &&
    !cancelled &&
    ["pending", "preparing", "ready"].includes(row.status);
  const lineDetails = [
    row.modifiers.map((m) => `+ ${m.name}`).join(", "),
    row.sides.length > 0
      ? `Kèm: ${row.sides
          .map((s) =>
            s.price > 0 ? `${s.name} (${formatVND(s.price)})` : s.name,
          )
          .join(", ")}`
      : "",
    row.note ? `* ${row.note}` : "",
  ].filter(Boolean);

  return (
    <Item
      asChild
      variant="outline"
      size="xs"
      className={cn(
        "items-start bg-card",
        cancelled && "border-dashed bg-muted/40",
      )}
    >
      <li>
        <ItemMedia variant="icon" className="text-primary" aria-hidden>
          <Icon
            className={
              row.status === "preparing"
                ? "motion-safe:animate-spin"
                : undefined
            }
          />
        </ItemMedia>
        <span className="sr-only">{meta.ariaLabel}</span>
        <ItemContent className="min-w-0">
          <ItemTitle
            className={cn("max-w-full", cancelled && "line-through opacity-70")}
          >
            {row.item_name}
            {row.variant_name ? ` — ${row.variant_name}` : ""}
          </ItemTitle>
          {lineDetails.length > 0 && (
            <ItemDescription>{lineDetails.join(" · ")}</ItemDescription>
          )}
          <ItemDescription>
            {meta.label} · x{row.quantity} · {formatVND(row.subtotal)}
          </ItemDescription>
        </ItemContent>
        <ItemActions className="shrink-0 self-start">
          {canVoid && (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className="text-destructive"
              onClick={() => onVoid(row.id)}
            >
              Hủy
            </Button>
          )}
        </ItemActions>
      </li>
    </Item>
  );
}
