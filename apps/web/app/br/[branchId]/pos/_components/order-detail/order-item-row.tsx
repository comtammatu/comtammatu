"use client";

import { cn } from "@comtammatu/ui";
import { formatVND } from "@comtammatu/shared/format";
import { Button } from "@comtammatu/ui/components/button";
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

  return (
    <li
      className={cn(
        "rounded-xl border p-3 transition-transform hover:-translate-y-0.5 hover:shadow-md",
        cancelled
          ? "border-dashed bg-muted/40"
          : "border-border bg-card shadow-sm",
      )}
    >
      <div className="flex items-start gap-2">
        <span className="mt-0.5 shrink-0 text-primary" aria-hidden>
          <Icon
            className={
              row.status === "preparing"
                ? "size-4 motion-safe:animate-spin"
                : "size-4"
            }
          />
        </span>
        <span className="sr-only">{meta.ariaLabel}</span>
        <div className="min-w-0 flex-1">
          <p
            className={
              cancelled ? "text-sm line-through opacity-70" : "text-sm font-medium"
            }
          >
            {row.item_name}
            {row.variant_name ? ` — ${row.variant_name}` : ""}
          </p>
          {row.modifiers.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {row.modifiers.map((m) => `+ ${m.name}`).join(", ")}
            </p>
          )}
          {row.sides.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Kèm:{" "}
              {row.sides
                .map((s) =>
                  s.price > 0 ? `${s.name} (${formatVND(s.price)})` : s.name,
                )
                .join(", ")}
            </p>
          )}
          {row.note && (
            <p className="text-xs italic text-muted-foreground">* {row.note}</p>
          )}
          <p className="text-xs text-muted-foreground">
            {meta.label} · x{row.quantity} · {formatVND(row.subtotal)}
          </p>
        </div>
        {canVoid && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 shrink-0 text-xs text-destructive"
            onClick={() => onVoid(row.id)}
          >
            Hủy món
          </Button>
        )}
      </div>
    </li>
  );
}
