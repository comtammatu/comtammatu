"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { formatVND } from "@comtammatu/shared/format";
import { Button } from "@comtammatu/ui/components/button";
import { ScrollArea } from "@comtammatu/ui/components/scroll-area";
import { Separator } from "@comtammatu/ui/components/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@comtammatu/ui/components/sheet";
import { Loader2, Printer } from "lucide-react";
import { fetchOrderForBill } from "./actions";
import type { CartModifier, CartSide } from "./types";

interface OrderItem {
  id: number;
  item_name: string;
  variant_name: string | null;
  quantity: number;
  unit_price: number;
  subtotal: number;
  modifiers: CartModifier[];
  sides: CartSide[];
  note: string | null;
}

interface OrderData {
  id: number;
  order_number: string;
  order_type: string;
  status: string;
  subtotal: number;
  tax_amount: number;
  service_charge: number;
  discount_amount: number;
  total_amount: number;
  customer_count: number;
  note: string | null;
  created_at: string;
  table_id: number | null;
  tables: { number: number } | null;
  branches: { name: string; address: string | null } | null;
  order_items: OrderItem[];
}

interface BillReceiptProps {
  orderId: number | null;
  onClose: () => void;
}

export function BillReceipt({ orderId, onClose }: BillReceiptProps) {
  const [order, setOrder] = useState<OrderData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (orderId === null) {
      setOrder(null);
      setError(null);
      return;
    }

    let cancelled = false;

    startTransition(async () => {
      const result = await fetchOrderForBill(orderId);
      if (cancelled) return;
      if (result.success && result.data) {
        setOrder(result.data as OrderData);
        setError(null);
      } else {
        setError(result.error ?? "Không thể tải đơn hàng");
      }
    });

    return () => {
      cancelled = true;
    };
  }, [orderId]);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        onClose();
        setOrder(null);
      }
    },
    [onClose],
  );

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <Sheet open={orderId !== null} onOpenChange={handleOpenChange}>
      <SheetContent side="right" className="w-[380px] p-0 sm:max-w-[380px]">
        {isPending ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-4">
            <p className="text-sm font-medium text-destructive">{error}</p>
            <Button variant="outline" size="sm" onClick={() => onClose()}>
              Đóng
            </Button>
          </div>
        ) : order ? (
          <div className="flex h-full flex-col">
            <SheetHeader className="px-4 pt-4">
              <SheetTitle className="text-left">Hóa đơn</SheetTitle>
              <SheetDescription className="text-left">
                #{order.order_number}
              </SheetDescription>
            </SheetHeader>

            <ScrollArea className="flex-1">
              {/* Receipt content — printable area */}
              <div id="pos-receipt" className="px-4 py-3">
                {/* Header */}
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

                {/* Order info */}
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
                    <span>
                      {order.order_type === "dine_in" ? "Tại bàn" : "Mang về"}
                    </span>
                  </div>
                  {order.tables && (
                    <div className="flex justify-between">
                      <span>Bàn:</span>
                      <span>{order.tables.number}</span>
                    </div>
                  )}
                </div>

                <Separator className="my-2" />

                {/* Items */}
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
                        <td className="py-1">
                          <span>{item.item_name}</span>
                          {item.variant_name && (
                            <span className="ml-1 text-muted-foreground">
                              ({item.variant_name})
                            </span>
                          )}
                        </td>
                        <td className="py-1 text-center">{item.quantity}</td>
                        <td className="py-1 text-right">
                          {formatVND(item.unit_price)}
                        </td>
                        <td className="py-1 text-right font-medium">
                          {formatVND(item.subtotal)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <Separator className="my-2" />

                {/* Totals */}
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

                <Separator className="my-2" />

                {/* Footer */}
                <p className="text-center text-xs text-muted-foreground">
                  Cảm ơn quý khách!
                </p>
              </div>
            </ScrollArea>

            {/* Print button (hidden in print) */}
            <div className="border-t p-4 print:hidden">
              <Button className="w-full" onClick={handlePrint}>
                <Printer className="mr-2 size-4" />
                In hóa đơn
              </Button>
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
