"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { formatVND } from "@comtammatu/shared/format";
import type { PaymentMethod } from "@comtammatu/shared/providers";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Card, CardContent } from "@comtammatu/ui/components/card";
import { Progress } from "@comtammatu/ui/components/progress";
import { ScrollArea } from "@comtammatu/ui/components/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@comtammatu/ui/components/sheet";
import { IconCircleCheck, IconPrinter, IconReceipt } from "@tabler/icons-react";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { toast } from "@comtammatu/ui/components/sonner";
import { fetchOrderForBill, updateOrderStatus } from "../../actions";
import {
  confirmPayment,
  createPayment,
  fetchPaymentForOrder,
  fetchPaymentMethodsForPos,
} from "../../payment-actions";
import { printProvisionalBill, printReceipt } from "../../print-actions";
import { BillReceiptSummary } from "./bill-receipt-summary";
import { CashTenderedDialog } from "./cash-tendered-dialog";
import { BillReceiptPaymentPicker } from "./bill-receipt-payment-picker";
import { BillReceiptPaymentStatus } from "./bill-receipt-payment-status";
import { METHOD_LABELS } from "./bill-receipt-types";
import type { OrderData, PendingExtras } from "./bill-receipt-types";

interface BillReceiptProps {
  branchId: number;
  orderId: number | null;
  onOrderUpdated?: () => void | Promise<void>;
  onClose: () => void;
  onMinimize?: (orderId: number, paymentId: number) => void;
}

export function BillReceipt({
  branchId,
  orderId,
  onOrderUpdated,
  onClose,
  onMinimize,
}: BillReceiptProps) {
  const [order, setOrder] = useState<OrderData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [payPending, startPayTransition] = useTransition();
  const [completePending, startCompleteTransition] = useTransition();
  const [printPending, startPrintTransition] = useTransition();
  const [provisionalPending, startProvisionalTransition] = useTransition();
  const [cashDialogOpen, setCashDialogOpen] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [pendingExtras, setPendingExtras] = useState<PendingExtras | null>(
    null,
  );
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

  const handlePrintProvisional = useCallback(() => {
    if (orderId === null) return;
    startProvisionalTransition(async () => {
      const result = await printProvisionalBill(orderId);
      if (result.success) {
        toast.success("Đã gửi phiếu tạm tính tới máy in");
      } else {
        toast.error(result.error ?? "Không thể in phiếu tạm tính");
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
      // Cash flow: open dialog to capture tiền nhận + tự động tính tiền
      // trả khách. The dialog calls confirm_cash_payment RPC which handles
      // payment creation + mark-paid + enqueue receipt atomically.
      if (method === "cash") {
        setCashDialogOpen(true);
        return;
      }
      startPayTransition(async () => {
        const result = await createPayment(
          branchId,
          orderId,
          method,
          Number(order.total_amount),
        );
        if (result.success && result.data) {
          if (result.data.status === "pending") {
            toast.message("Đang chờ thanh toán", {
              description: "Quý khách hoàn tất trên app / chuyển khoản.",
            });
            setAwaitingAsyncConfirmation(true);
            setPendingExtras({
              payment_id: result.data.payment_id,
              provider_ref: result.data.provider_ref,
              qr_data: result.data.qr_data,
              redirect_url: result.data.redirect_url,
              qr_info: result.data.qr_info,
            });
            setOrder((current) =>
              current
                ? {
                    ...current,
                    payment_method: method,
                  }
                : current,
            );
          }
        } else {
          toast.error(result.error ?? "Không thể thanh toán");
        }
      });
    },
    [branchId, order, orderId],
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

  const handleRealtimeConfirmed = useCallback(() => {
    toast.success("Đã nhận tiền — thanh toán hoàn tất");
    setAwaitingAsyncConfirmation(false);
    setPendingExtras(null);
    void onOrderUpdated?.();
    setRefreshTick((t) => t + 1);
  }, [onOrderUpdated]);

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

  const handleMinimize = useCallback(() => {
    const paymentId = pendingExtras?.payment_id;
    if (!onMinimize || orderId === null || !paymentId) return;
    onMinimize(orderId, paymentId);
  }, [onMinimize, orderId, pendingExtras?.payment_id]);

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

  // Reopen: if order already has a pending payment record, fetch it once so
  // the confirm button has the payment_id + provider_ref it needs. Realtime
  // subscription on payments table replaces prior interval polling.
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
    <>
      <Sheet open={orderId !== null} onOpenChange={handleOpenChange}>
        <SheetContent
          side="right"
          className="h-dvh max-h-dvh w-full overflow-hidden p-0 sm:max-w-sm"
        >
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
            <div className="flex h-full min-h-0 flex-col overflow-hidden">
              <div className="shrink-0 px-4 pt-4">
                <h2 className="text-left text-base font-semibold">Hóa đơn</h2>
                <p className="text-left text-sm text-muted-foreground">
                  #{order.order_number}
                </p>
              </div>

              <div className="shrink-0 border-b px-4 py-3 print:hidden">
                <Card className="shadow-sm">
                  <CardContent className="space-y-3 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant={
                          isPaid
                            ? "success"
                            : pendingExtras
                              ? "warning"
                              : "outline"
                        }
                      >
                        {isPaid
                          ? "Đã thanh toán"
                          : pendingExtras
                            ? "Chờ khách"
                            : "Chờ thu ngân"}
                      </Badge>
                      <Badge variant="outline">
                        {order.order_type === "dine_in"
                          ? `Bàn ${order.tables?.number ?? "—"}`
                          : "Mang về"}
                      </Badge>
                      <Badge variant="outline">
                        {order.order_items.length} món
                      </Badge>
                      {(METHOD_LABELS[order.payment_method ?? ""] ||
                        pendingExtras) && (
                        <Badge variant="outline">
                          {METHOD_LABELS[order.payment_method ?? ""] ?? "—"}
                        </Badge>
                      )}
                    </div>

                    <div className="flex items-baseline justify-between gap-3 rounded-lg border bg-card px-3 py-2">
                      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Tổng
                      </span>
                      <span className="text-xl font-bold text-primary tabular-nums">
                        {formatVND(order.total_amount)}
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      <Progress
                        value={payPending ? undefined : paymentProgressPercent}
                        className="h-1.5"
                      />
                      {hasPendingRemotePayment && (
                        <p className="text-xs text-muted-foreground">
                          Đồng bộ realtime giữa các thiết bị.
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>

              <ScrollArea className="min-h-0 flex-1 overflow-hidden">
                <BillReceiptSummary order={order} />

                {showPaySection && (
                  <div className="border-t px-4 py-3 print:hidden">
                    <BillReceiptPaymentPicker
                      methods={methods}
                      onPay={handlePay}
                      payPending={payPending}
                      hasPendingRemotePayment={hasPendingRemotePayment}
                      pendingExtras={pendingExtras}
                    />
                    {pendingExtras?.qr_data && (
                      <div className="mt-3">
                        <BillReceiptPaymentStatus
                          pendingExtras={pendingExtras}
                          confirmPending={confirmPending}
                          onConfirm={handleConfirmPayment}
                          onRealtimeConfirmed={handleRealtimeConfirmed}
                          onMinimize={
                            onMinimize && pendingExtras.payment_id
                              ? handleMinimize
                              : undefined
                          }
                        />
                      </div>
                    )}
                  </div>
                )}
              </ScrollArea>

              <div className="shrink-0 border-t p-4 print:hidden">
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
                      {order.order_type === "dine_in"
                        ? "Hoàn tất và trả bàn"
                        : "Hoàn tất đơn"}
                    </Button>
                  )}
                  {!isPaid && (
                    <Button
                      variant="outline"
                      className="w-full rounded-lg shadow-sm transition-transform hover:-translate-y-0.5"
                      onClick={handlePrintProvisional}
                      disabled={provisionalPending}
                    >
                      {provisionalPending ? (
                        <Spinner className="mr-2" />
                      ) : (
                        <IconReceipt className="mr-2 size-4" />
                      )}
                      In phiếu tạm tính
                    </Button>
                  )}
                  <Button
                    variant={canCompleteOrder ? "outline" : "default"}
                    className="w-full rounded-lg shadow-sm transition-transform hover:-translate-y-0.5"
                    onClick={handlePrint}
                    disabled={printPending || !isPaid}
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

      {order && orderId !== null && (
        <CashTenderedDialog
          open={cashDialogOpen}
          onOpenChange={setCashDialogOpen}
          orderId={orderId}
          totalAmount={Number(order.total_amount)}
          onSuccess={async () => {
            await onOrderUpdated?.();
            setRefreshTick((t) => t + 1);
          }}
        />
      )}
    </>
  );
}
