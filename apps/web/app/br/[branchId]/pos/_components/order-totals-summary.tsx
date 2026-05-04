"use client";

import { formatVND } from "@comtammatu/shared/format";
import { FORM_VI } from "@comtammatu/shared/messages";
import { Separator } from "@comtammatu/ui/components/separator";
import { cn } from "@comtammatu/ui";

export interface OrderTotalsSummaryProps {
  subtotal: number;
  serviceCharge: number;
  discountAmount: number;
  discountType: "pct" | "vnd" | null;
  discountValue: number | null;
  discountNote: string | null;
  totalAmount: number;
  /** Compact = bỏ Separator + giảm font, dùng trong cart footer chật chỗ. */
  variant?: "default" | "compact";
  className?: string;
}

/**
 * Hiển thị breakdown tiền của 1 đơn (tạm tính → phí dịch vụ → chiết khấu →
 * tổng cộng). Dùng chung cho order-detail-sheet (footer trước nút thanh toán)
 * và bill-receipt-sheet (cả cash + QR card) để cashier/phục vụ thấy được
 * khoản chiết khấu đã áp và lý do, tránh hiểu nhầm "Tổng tạm tính" = total.
 *
 * Giữ đồng bộ format với BillReceiptSummary (in giấy) — số liệu trên màn
 * hình và trên hoá đơn phải khớp 1-1 để cashier không phải đối chiếu thủ công.
 */
export function OrderTotalsSummary({
  subtotal,
  serviceCharge,
  discountAmount,
  discountType,
  discountValue,
  discountNote,
  totalAmount,
  variant = "default",
  className,
}: OrderTotalsSummaryProps) {
  const isCompact = variant === "compact";
  const lineClass = cn(
    "flex justify-between gap-2",
    isCompact ? "text-xs" : "text-sm",
  );
  const totalClass = cn(
    "flex justify-between gap-2 font-bold tabular-nums",
    isCompact ? "text-sm" : "text-base",
  );

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div className={cn(lineClass, "text-muted-foreground")}>
        <span>{FORM_VI.subtotal}</span>
        <span className="tabular-nums">{formatVND(subtotal)}</span>
      </div>

      {serviceCharge > 0 && (
        <div className={cn(lineClass, "text-muted-foreground")}>
          <span>Phí dịch vụ</span>
          <span className="tabular-nums">{formatVND(serviceCharge)}</span>
        </div>
      )}

      {discountAmount > 0 && (
        <>
          <div className={cn(lineClass, "text-success")}>
            <span>
              Chiết khấu
              {discountType === "pct" && discountValue != null
                ? ` (${discountValue}%)`
                : ""}
            </span>
            <span className="tabular-nums">-{formatVND(discountAmount)}</span>
          </div>
          {discountNote && (
            <div className="text-xs italic text-muted-foreground">
              Lý do: {discountNote}
            </div>
          )}
        </>
      )}

      <Separator className={isCompact ? "my-0.5" : "my-1"} />

      <div className={totalClass}>
        <span>Tổng cộng</span>
        <span>{formatVND(totalAmount)}</span>
      </div>
    </div>
  );
}
