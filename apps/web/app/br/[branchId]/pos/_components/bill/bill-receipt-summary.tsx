"use client";

import { formatVND } from "@comtammatu/shared/format";
import { Separator } from "@comtammatu/ui/components/separator";
import {
  getPosLineItemDisplayName,
  getPosLineItemOptionLines,
} from "../../types";
import { METHOD_LABELS } from "./bill-receipt-types";
import type { OrderData } from "./bill-receipt-types";

interface BillReceiptSummaryProps {
  order: OrderData;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function BillReceiptSummary({ order }: BillReceiptSummaryProps) {
  const isPaid =
    order.payment_status === "paid" || order.status === "completed";
  const paymentLabel =
    order.status === "cancelled"
      ? "Đã hủy"
      : isPaid
        ? (METHOD_LABELS[order.payment_method ?? ""] ??
          order.payment_method ??
          "Đã thanh toán")
        : "Chưa thanh toán";

  return (
    <div id="pos-receipt" className="px-4 py-3">
      <div className="text-center">
        <h2 className="text-base font-bold">CƠM TẤM MÁ TƯ</h2>
        {order.branches && (
          <>
            <p className="text-xs">{order.branches.name}</p>
            {order.branches.address && (
              <p className="text-xs text-muted-foreground">
                {order.branches.address}
              </p>
            )}
          </>
        )}
      </div>

      <Separator className="my-2" />

      <div className="flex flex-col gap-0.5 text-xs">
        <div className="flex justify-between">
          <span>Đơn hàng:</span>
          <span className="font-medium">#{order.order_number}</span>
        </div>
        <div className="flex justify-between">
          <span>Ngày:</span>
          <span>{formatDate(order.created_at)}</span>
        </div>
        <div className="flex justify-between">
          <span>Loại:</span>
          <span>{order.order_type === "dine_in" ? "Tại bàn" : "Mang về"}</span>
        </div>
        {order.tables && (
          <div className="flex justify-between">
            <span>Bàn:</span>
            <span>{order.tables.number}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span>Thanh toán:</span>
          <span className="font-medium">{paymentLabel}</span>
        </div>
      </div>

      <Separator className="my-2" />

      <div className="text-xs">
        <div className="flex items-center justify-between border-b pb-1 font-medium text-muted-foreground">
          <span>Món</span>
          <span className="text-right">Thành tiền</span>
        </div>
        <div className="divide-y divide-dashed">
          {order.order_items.map((item) => {
            const displayName = getPosLineItemDisplayName(item);
            const optionLines = getPosLineItemOptionLines(item);

            return (
              <div key={item.id} className="flex gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="break-words font-medium leading-snug">
                    {displayName}
                  </div>
                  {optionLines.map((line) => (
                    <div
                      key={line}
                      className="mt-0.5 break-words leading-4 text-muted-foreground"
                    >
                      {line}
                    </div>
                  ))}
                </div>
                <div className="shrink-0 whitespace-nowrap text-right tabular-nums">
                  <div className="font-semibold">
                    {formatVND(item.subtotal)}
                  </div>
                  <div className="mt-0.5 text-muted-foreground">
                    {item.quantity} × {formatVND(item.unit_price)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <Separator className="my-2" />

      <div className="flex flex-col gap-1 text-xs">
        <div className="flex justify-between">
          <span>Tạm tính</span>
          <span>{formatVND(order.subtotal)}</span>
        </div>
        {order.tax_amount > 0 && (
          <div className="flex justify-between">
            <span>Thuế</span>
            <span>{formatVND(order.tax_amount)}</span>
          </div>
        )}
        {order.service_charge > 0 && (
          <div className="flex justify-between">
            <span>Phí dịch vụ</span>
            <span>{formatVND(order.service_charge)}</span>
          </div>
        )}
        {order.discount_amount > 0 && (
          <div className="flex justify-between">
            <span>
              Giảm giá
              {order.discount_type === "pct" && order.discount_value != null
                ? ` (${order.discount_value}%)`
                : ""}
            </span>
            <span>-{formatVND(order.discount_amount)}</span>
          </div>
        )}
        {order.discount_amount > 0 && order.discount_note && (
          <div className="text-[11px] italic text-muted-foreground">
            Lý do: {order.discount_note}
          </div>
        )}
        <Separator className="my-1" />
        <div className="flex justify-between text-sm font-bold">
          <span>TỔNG CỘNG</span>
          <span>{formatVND(order.total_amount)}</span>
        </div>
      </div>

      {order.note && (
        <>
          <Separator className="my-2" />
          <div className="text-xs">
            <span className="font-medium">Ghi chú: </span>
            <span className="text-muted-foreground">{order.note}</span>
          </div>
        </>
      )}

      <Separator className="my-2" />

      <p className="text-center text-xs text-muted-foreground">
        Cảm ơn quý khách!
      </p>
    </div>
  );
}
