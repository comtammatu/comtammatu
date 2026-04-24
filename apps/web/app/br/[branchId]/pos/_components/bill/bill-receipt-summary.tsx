"use client";

import { formatVND } from "@comtammatu/shared/format";
import { Separator } from "@comtammatu/ui/components/separator";
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
  const isPaid = order.payment_status === "paid";

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
          <span className="font-medium">
            {isPaid
              ? (METHOD_LABELS[order.payment_method ?? ""] ??
                order.payment_method ??
                "Đã thanh toán")
              : "Chưa thanh toán"}
          </span>
        </div>
      </div>

      <Separator className="my-2" />

      <table className="w-full text-xs">
        <thead>
          <tr className="border-b text-left">
            <th className="pb-1 font-medium">Món</th>
            <th className="pb-1 text-center font-medium">SL</th>
            <th className="pb-1 text-right font-medium">Giá</th>
            <th className="pb-1 text-right font-medium">TT</th>
          </tr>
        </thead>
        <tbody>
          {order.order_items.map((item) => (
            <tr key={item.id} className="border-b border-dashed">
              <td className="py-1 align-top">
                <span>{item.item_name}</span>
                {item.variant_name && (
                  <span className="ml-1 text-muted-foreground">
                    ({item.variant_name})
                  </span>
                )}
                {item.modifiers.length > 0 && (
                  <div className="text-[11px] text-muted-foreground">
                    {item.modifiers.map((m) => `+ ${m.name}`).join(", ")}
                  </div>
                )}
                {item.sides.length > 0 && (
                  <div className="text-[11px] text-muted-foreground">
                    Kèm:{" "}
                    {item.sides
                      .map((s) =>
                        s.price > 0
                          ? `${s.name} (${formatVND(s.price)})`
                          : s.name,
                      )
                      .join(", ")}
                  </div>
                )}
                {item.note && (
                  <div className="text-[11px] italic text-muted-foreground">
                    * {item.note}
                  </div>
                )}
              </td>
              <td className="py-1 text-center align-top">{item.quantity}</td>
              <td className="py-1 text-right align-top">
                {formatVND(item.unit_price)}
              </td>
              <td className="py-1 text-right align-top font-medium">
                {formatVND(item.subtotal)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

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
            <span>Giảm giá</span>
            <span>-{formatVND(order.discount_amount)}</span>
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
