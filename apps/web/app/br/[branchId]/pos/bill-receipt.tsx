"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { cn } from "@comtammatu/ui";
import { formatVND } from "@comtammatu/shared/format";
import type { PaymentMethod } from "@comtammatu/shared/providers";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Card, CardContent } from "@comtammatu/ui/components/card";
import { Progress } from "@comtammatu/ui/components/progress";
import { ScrollArea } from "@comtammatu/ui/components/scroll-area";
import { Separator } from "@comtammatu/ui/components/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@comtammatu/ui/components/sheet";
import {
  IconCircleCheck,
  IconCurrencyDollar,
  IconExternalLink,
  IconPrinter,
  IconFileInvoice,
  IconQrcode,
} from "@tabler/icons-react";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { toast } from "@comtammatu/ui/components/sonner";
import { fetchOrderForBill, updateOrderStatus } from "./actions";
import {
  confirmPayment,
  createPayment,
  fetchPaymentForOrder,
  fetchPaymentMethodsForPos,
} from "./payment-actions";
import { printReceipt } from "./print-actions";
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
  payment_status: string | null;
  payment_method: string | null;
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

const METHOD_LABELS: Record<string, string> = {
  cash: "Tiền mặt",
  vietqr: "VietQR",
  momo: "MoMo",
};

interface BillReceiptProps {
  branchId: number;
  orderId: number | null;
  onOrderUpdated?: () => void | Promise<void>;
  onClose: () => void;
}

export function BillReceipt({
  branchId,
  orderId,
  onOrderUpdated,
  onClose,
}: BillReceiptProps) {
  const [order, setOrder] = useState<OrderData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [payPending, startPayTransition] = useTransition();
  const [completePending, startCompleteTransition] = useTransition();
  const [printPending, startPrintTransition] = useTransition();
  const [refreshTick, setRefreshTick] = useState(0);
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [pendingExtras, setPendingExtras] = useState<{
    payment_id?: number;
    provider_ref?: string;
    qr_data?: string;
    redirect_url?: string;
    qr_info?: {
      bank_code?: string;
      bank_bin?: string;
      account_no?: string;
      account_name?: string;
      amount?: string;
      description?: string;
    };
  } | null>(null);
  const [confirmPending, startConfirmTransition] = useTransition();
  const [awaitingAsyncConfirmation, setAwaitingAsyncConfirmation] =
    useState(false);

  useEffect(() => {
    if (orderId === null) {
      setOrder(null);
      setError(null);
      setPendingExtras(null);
      setAwaitingAsyncConfirmation(false);
      return;
    }

    let cancelled = false;

    startTransition(async () => {
      const result = await fetchOrderForBill(orderId);
      if (cancelled) return;
      if (result.success && result.data) {
        const nextOrder = result.data as OrderData;
        setOrder(nextOrder);
        setError(null);
        setPendingExtras((current) =>
          nextOrder.payment_status === "paid" ? null : current,
        );
      } else {
        setError(result.error ?? "Không thể tải đơn hàng");
      }
    });

    return () => {
      cancelled = true;
    };
  }, [orderId, refreshTick]);

  useEffect(() => {
    if (orderId === null) {
      setMethods([]);
      return;
    }
    void fetchPaymentMethodsForPos(branchId).then((r) => {
      if (r.success && r.data) {
        setMethods(r.data.methods);
      }
    });
  }, [branchId, orderId]);

  const handlePrint = useCallback(() => {
    if (orderId === null) return;
    startPrintTransition(async () => {
      const result = await printReceipt(orderId);
      if (result.success) {
        toast.success("Đã gửi hoá đơn tới máy in");
      } else {
        toast.error(result.error ?? "Không thể in hoá đơn");
      }
    });
  }, [orderId]);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        onClose();
        setOrder(null);
        setPendingExtras(null);
      }
    },
    [onClose],
  );

  const handlePay = useCallback(
    (method: PaymentMethod) => {
      if (orderId === null || !order) return;
      startPayTransition(async () => {
        const result = await createPayment(
          branchId,
          orderId,
          method,
          Number(order.total_amount),
        );
        if (result.success && result.data) {
          if (method === "cash") {
            toast.success("Đã thanh toán tiền mặt");
            await onOrderUpdated?.();
            setRefreshTick((t) => t + 1);
            return;
          }
          if (result.data.status === "pending") {
            toast.message("Đang chờ thanh toán", {
              description: "Quý khách hoàn tất trên app / chuyển khoản.",
            });
            await onOrderUpdated?.();
            setAwaitingAsyncConfirmation(true);
            setPendingExtras({
              payment_id: result.data.payment_id,
              provider_ref: result.data.provider_ref,
              qr_data: result.data.qr_data,
              redirect_url: result.data.redirect_url,
              qr_info: result.data.qr_info,
            });
            setRefreshTick((t) => t + 1);
          }
        } else {
          toast.error(result.error ?? "Không thể thanh toán");
        }
      });
    },
    [branchId, onOrderUpdated, order, orderId],
  );

  const handleConfirmPayment = useCallback(() => {
    const paymentId = pendingExtras?.payment_id;
    if (!paymentId) return;
    const providerRef = pendingExtras?.provider_ref ?? "";
    startConfirmTransition(async () => {
      const result = await confirmPayment(paymentId, providerRef);
      if (result.success) {
        toast.success("Đã xác nhận thanh toán");
        setAwaitingAsyncConfirmation(false);
        setPendingExtras(null);
        await onOrderUpdated?.();
        setRefreshTick((t) => t + 1);
      } else {
        toast.error(result.error ?? "Không thể xác nhận thanh toán");
      }
    });
  }, [onOrderUpdated, pendingExtras?.payment_id, pendingExtras?.provider_ref]);

  const handleCompleteOrder = useCallback(() => {
    if (orderId === null) return;
    startCompleteTransition(async () => {
      const result = await updateOrderStatus(orderId, "completed");
      if (result.success) {
        toast.success("Đã hoàn tất đơn");
        await onOrderUpdated?.();
        onClose();
      } else {
        toast.error(result.error ?? "Không thể hoàn tất đơn");
      }
    });
  }, [onClose, onOrderUpdated, orderId]);

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

  const isPaid = order?.payment_status === "paid";
  const hasPendingRemotePayment =
    !isPaid &&
    (pendingExtras !== null ||
      order?.payment_method === "vietqr" ||
      order?.payment_method === "momo");
  const showPaySection = order && !isPaid && methods.length > 0;
  const canCompleteOrder = order?.status === "served" && isPaid;
  const paymentProgressPercent = isPaid
    ? 100
    : payPending
      ? 72
      : pendingExtras
        ? 84
        : methods.length > 0
          ? 46
          : 24;

  useEffect(() => {
    if (!awaitingAsyncConfirmation || !isPaid) return;
    toast.success("Đã xác nhận thanh toán");
    void onOrderUpdated?.();
    setAwaitingAsyncConfirmation(false);
  }, [awaitingAsyncConfirmation, isPaid, onOrderUpdated]);

  // VietQR has no webhook/API back-channel — cashier checks the banking app
  // on their phone and presses "Đã nhận tiền" to confirm manually. When the
  // bill is reopened on an order that already has a pending payment record
  // (e.g. after page reload), fetch that record ONCE so the confirm button
  // has the payment_id + provider_ref it needs. No interval polling.
  useEffect(() => {
    if (
      orderId === null ||
      isPaid ||
      !hasPendingRemotePayment ||
      pendingExtras?.payment_id
    )
      return;
    let cancelled = false;
    void fetchPaymentForOrder(orderId).then((result) => {
      if (cancelled) return;
      if (!result.success || !result.data) return;
      if (result.data.status !== "pending") return;
      setPendingExtras((current) => ({
        ...current,
        payment_id: result.data!.id,
        provider_ref: result.data!.provider_ref ?? undefined,
      }));
    });
    return () => {
      cancelled = true;
    };
  }, [hasPendingRemotePayment, isPaid, orderId, pendingExtras?.payment_id]);

  return (
    <Sheet open={orderId !== null} onOpenChange={handleOpenChange}>
      <SheetContent side="right" className="w-95 p-0 sm:max-w-95">
        <SheetHeader className="sr-only">
          <SheetTitle>Hóa đơn</SheetTitle>
          <SheetDescription>
            Xem chi tiết và thanh toán đơn hàng.
          </SheetDescription>
        </SheetHeader>
        {isPending && !order ? (
          <div className="flex h-full items-center justify-center">
            <Spinner className="size-6 text-muted-foreground" />
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
            <div className="px-4 pt-4">
              <h2 className="text-left text-base font-semibold">Hóa đơn</h2>
              <p className="text-left text-sm text-muted-foreground">
                #{order.order_number}
              </p>
            </div>

            <div className="border-b px-4 py-3 print:hidden">
              <Card className="shadow-sm">
                <CardContent className="space-y-4 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Thanh toán</p>
                      <h3 className="text-lg font-semibold tracking-tight">
                        {isPaid
                          ? "Hóa đơn đã hoàn tất, có thể in hoặc gửi khách."
                          : pendingExtras
                            ? "Thanh toán đã được khởi tạo, đang chờ khách xác nhận."
                            : "Chọn phương thức và hoàn tất thanh toán ngay tại quầy."}
                      </h3>
                      <p className="text-sm leading-6 text-muted-foreground">
                        Thu ngân có thể chốt tiền mặt, mở QR hoặc kiểm tra lại hóa đơn ngay tại đây.
                      </p>
                    </div>
                    <Badge
                      variant={
                        isPaid ? "success" : pendingExtras ? "warning" : "outline"
                      }
                    >
                      {isPaid
                        ? "Đã thanh toán"
                        : pendingExtras
                          ? "Đang chờ khách"
                          : "Chờ thu ngân"}
                    </Badge>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">
                      {order.order_type === "dine_in"
                        ? `Bàn ${order.tables?.number ?? "—"}`
                        : "Mang về"}
                    </Badge>
                    <Badge variant="outline">
                      {order.order_items.length} món
                    </Badge>
                    <Badge variant="outline">
                      {METHOD_LABELS[order.payment_method ?? ""] ??
                        (pendingExtras ? "Đã chọn phương thức" : "Chưa chọn phương thức")}
                    </Badge>
                  </div>

                  <div className="flex items-end justify-between gap-3 rounded-lg border bg-card p-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Tổng cần thu
                      </p>
                      <p className="mt-1 text-2xl font-bold text-primary tabular-nums">
                        {formatVND(order.total_amount)}
                      </p>
                    </div>
                    <p className="text-right text-xs leading-5 text-muted-foreground">
                      {isPaid
                        ? "Đơn đã thanh toán xong."
                        : pendingExtras
                          ? "Đang chờ khách xác nhận giao dịch."
                          : "Chưa ghi nhận thanh toán."}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2 text-xs font-medium text-muted-foreground">
                      <span>Tiến độ thanh toán</span>
                      <span>{String(Math.round(paymentProgressPercent))}%</span>
                    </div>
                    <Progress
                      value={payPending ? undefined : paymentProgressPercent}
                      className="h-2"
                    />
                    {hasPendingRemotePayment && (
                      <p className="text-xs text-muted-foreground">
                        Tự động kiểm tra thanh toán mỗi 4 giây.
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

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
                        <td className="py-1 align-top">
                          <span>{item.item_name}</span>
                          {item.variant_name && (
                            <span className="ml-1 text-muted-foreground">
                              ({item.variant_name})
                            </span>
                          )}
                          {item.modifiers.length > 0 && (
                            <div className="text-[11px] text-muted-foreground">
                              {item.modifiers
                                .map((m) => `+ ${m.name}`)
                                .join(", ")}
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

                {/* Footer */}
                <p className="text-center text-xs text-muted-foreground">
                  Cảm ơn quý khách!
                </p>
              </div>

              {/* Payment actions — not printed */}
              {showPaySection && (
                <div className="border-t px-4 py-3 print:hidden">
                  <Card className="shadow-sm">
                    <CardContent className="space-y-4 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Thu ngân</p>
                          <h4 className="mt-1 text-base font-semibold">
                            Chọn phương thức xử lý ngay tại quầy
                          </h4>
                        </div>
                        <Badge variant="outline">
                          {methods.length} phương thức
                        </Badge>
                      </div>

                      <div className="grid gap-2">
                        {methods.map((m) => (
                          <Button
                            key={m}
                            data-testid={`bill-pay-${m}`}
                            type="button"
                            variant={m === "cash" ? "default" : "secondary"}
                            disabled={payPending || hasPendingRemotePayment}
                            className={cn(
                              "h-12 w-full justify-between rounded-lg px-4 text-sm font-semibold shadow-sm transition-transform hover:-translate-y-0.5",
                              m === "cash" && "shadow-md",
                            )}
                            onClick={() => handlePay(m)}
                          >
                            <span className="flex items-center gap-2">
                              {m === "cash" ? (
                                <IconCurrencyDollar className="size-4" />
                              ) : (
                                <IconQrcode className="size-4" />
                              )}
                              {METHOD_LABELS[m] ?? m}
                            </span>
                            {payPending ? (
                              <Spinner />
                            ) : (
                              <IconFileInvoice className="size-4 opacity-70" />
                            )}
                          </Button>
                        ))}
                      </div>

                      {pendingExtras?.redirect_url && (
                        <Button
                          type="button"
                          variant="outline"
                          className="w-full rounded-lg"
                          asChild
                        >
                          <a
                            href={pendingExtras.redirect_url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <IconExternalLink className="mr-2 size-4" />
                            Mở trang thanh toán MoMo
                          </a>
                        </Button>
                      )}
                      {pendingExtras?.qr_data && (
                        <div className="rounded-lg border border-border/70 bg-card p-3">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={pendingExtras.qr_data}
                            alt="QR thanh toán VietQR"
                            className="mx-auto max-h-72 w-full max-w-72 object-contain"
                          />
                          <p className="mt-2 text-center text-xs text-muted-foreground">
                            Khách quét bằng app ngân hàng để chuyển khoản.
                          </p>
                          {pendingExtras.qr_info && (
                            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-md bg-muted/50 p-2 text-xs">
                              {pendingExtras.qr_info.bank_code && (
                                <>
                                  <dt className="text-muted-foreground">
                                    Ngân hàng
                                  </dt>
                                  <dd className="font-medium">
                                    {pendingExtras.qr_info.bank_code}
                                  </dd>
                                </>
                              )}
                              {pendingExtras.qr_info.account_no && (
                                <>
                                  <dt className="text-muted-foreground">
                                    Số TK
                                  </dt>
                                  <dd className="font-mono font-medium">
                                    {pendingExtras.qr_info.account_no}
                                  </dd>
                                </>
                              )}
                              {pendingExtras.qr_info.account_name && (
                                <>
                                  <dt className="text-muted-foreground">
                                    Chủ TK
                                  </dt>
                                  <dd className="font-medium uppercase">
                                    {pendingExtras.qr_info.account_name}
                                  </dd>
                                </>
                              )}
                              {pendingExtras.qr_info.amount && (
                                <>
                                  <dt className="text-muted-foreground">
                                    Số tiền
                                  </dt>
                                  <dd className="font-semibold">
                                    {formatVND(
                                      Number(pendingExtras.qr_info.amount),
                                    )}
                                  </dd>
                                </>
                              )}
                              {pendingExtras.qr_info.description && (
                                <>
                                  <dt className="text-muted-foreground">
                                    Nội dung
                                  </dt>
                                  <dd className="font-mono">
                                    {pendingExtras.qr_info.description}
                                  </dd>
                                </>
                              )}
                            </dl>
                          )}
                          <Button
                            data-testid="bill-confirm-transfer"
                            type="button"
                            variant="default"
                            className="mt-3 h-11 w-full rounded-lg shadow-sm transition-transform hover:-translate-y-0.5"
                            disabled={
                              confirmPending || !pendingExtras.payment_id
                            }
                            onClick={handleConfirmPayment}
                          >
                            {confirmPending ? (
                              <Spinner className="mr-2" />
                            ) : (
                              <IconCircleCheck className="mr-2 size-4" />
                            )}
                            Đã nhận tiền — xác nhận thanh toán
                          </Button>
                          <p className="mt-2 text-center text-[11px] text-muted-foreground">
                            Mở app ngân hàng kiểm tra đã có tiền về rồi bấm xác
                            nhận.
                          </p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              )}
            </ScrollArea>

            {/* Print button (hidden in print) */}
            <div className="border-t p-4 print:hidden">
              <div className="space-y-2">
                {canCompleteOrder && (
                  <Button
                    data-testid="bill-complete-order"
                    className="w-full rounded-lg shadow-sm transition-transform hover:-translate-y-0.5"
                    onClick={handleCompleteOrder}
                    disabled={completePending}
                  >
                    {completePending ? (
                      <Spinner className="mr-2" />
                    ) : (
                      <IconCircleCheck className="mr-2 size-4" />
                    )}
                    {order?.order_type === "dine_in"
                      ? "Hoàn tất và trả bàn"
                      : "Hoàn tất đơn"}
                  </Button>
                )}
                <Button
                  variant={canCompleteOrder ? "outline" : "default"}
                  className="w-full rounded-lg shadow-sm transition-transform hover:-translate-y-0.5"
                  onClick={handlePrint}
                  disabled={printPending}
                >
                {printPending ? (
                  <Spinner className="mr-2" />
                ) : isPaid ? (
                  <IconCircleCheck className="mr-2 size-4" />
                ) : (
                  <IconPrinter className="mr-2 size-4" />
                )}
                In hóa đơn
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
