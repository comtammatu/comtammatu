"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import { formatVND } from "@comtammatu/shared/format";
import type { PaymentMethod } from "@comtammatu/shared/providers";
import { Button } from "@comtammatu/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@comtammatu/ui/components/dialog";
import { Input } from "@comtammatu/ui/components/input";
import { Skeleton } from "@comtammatu/ui/components/skeleton";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { toast } from "@comtammatu/ui/components/sonner";
import { IconCash, IconCreditCard, IconQrcode } from "@tabler/icons-react";
import { fetchOrderForBill, updateOrderStatus } from "../../actions";
import {
  confirmCashPayment,
  confirmPayment,
  createPayment,
  fetchPaymentMethodsForPos,
} from "../../payment-actions";
import type { OrderData, PendingExtras } from "./bill-receipt-types";

interface BillReceiptProps {
  branchId: number;
  orderId: number | null;
  /**
   * Order data already fetched by an upstream sheet (typically
   * OrderDetailSheet). When this is provided AND its id matches
   * `orderId`, the mount effect skips its own order round-trip —
   * UX shows items + total immediately with no second spinner.
   * When null or mismatched, the effect falls back to
   * fetchOrderForBill(orderId).
   */
  initialOrder?: OrderData | null;
  /**
   * User có `pos:confirm_payment` không. Waiter (không có) sẽ không thấy
   * phương thức "Tiền mặt" — cash chạm két phải do cashier. VietQR/MoMo
   * vẫn hiện cho mọi role có POS_USE (e-wallet không chạm drawer).
   */
  canConfirmCash: boolean;
  onOrderUpdated?: () => void | Promise<void>;
  onClose: () => void;
}

type PaymentStep = "confirm-served" | "payment";

const METHOD_META: Record<
  PaymentMethod,
  {
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }
> = {
  cash: { label: "Tiền mặt", icon: IconCash },
  vietqr: { label: "Chuyển khoản", icon: IconQrcode },
  momo: { label: "MoMo", icon: IconCreditCard },
};

function buildCashSuggestions(totalAmount: number): number[] {
  const total = Math.max(0, Math.round(totalAmount));
  const nextThousand = Math.ceil((total + 1) / 1000) * 1000;
  const nextFiveThousand = Math.ceil(total / 5000) * 5000;
  const nextTenThousand = Math.ceil(total / 10000) * 10000;
  const nextTwentyThousandAfterTen = nextTenThousand + 10000;
  const nextLarge =
    total <= 100000
      ? 100000
      : total <= 200000
        ? 200000
        : Math.ceil(total / 500000) * 500000;

  return Array.from(
    new Set([
      total,
      nextThousand,
      nextFiveThousand,
      nextTenThousand,
      nextTwentyThousandAfterTen,
      nextLarge,
    ]),
  )
    .filter((value) => value >= total && value > 0)
    .sort((a, b) => a - b)
    .slice(0, 6);
}

function PaymentSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
      <div className="space-y-3 rounded-lg border p-3">
        <Skeleton className="h-5 w-36" />
        <Skeleton className="h-10 w-full" />
        <div className="grid grid-cols-2 gap-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
    </div>
  );
}

export function BillReceipt({
  branchId,
  orderId,
  initialOrder,
  canConfirmCash,
  onOrderUpdated,
  onClose,
}: BillReceiptProps) {
  const [order, setOrder] = useState<OrderData | null>(null);
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<PaymentStep>("confirm-served");
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>("cash");
  const [cashInput, setCashInput] = useState("");
  const [pendingExtras, setPendingExtras] = useState<PendingExtras | null>(
    null,
  );
  const [isPending, startTransition] = useTransition();
  const [actionPending, startActionTransition] = useTransition();
  const [methodPending, startMethodTransition] = useTransition();

  const totalAmount = Number(order?.total_amount ?? 0);
  const cashReceived = Number(cashInput) || 0;
  const cashChange = cashReceived - totalAmount;
  const canConfirmPaid =
    selectedMethod === "cash"
      ? cashReceived >= totalAmount && totalAmount > 0
      : Boolean(pendingExtras?.payment_id);

  const cashSuggestions = useMemo(
    () => buildCashSuggestions(totalAmount),
    [totalAmount],
  );

  useEffect(() => {
    if (orderId === null) {
      setOrder(null);
      setMethods([]);
      setError(null);
      setStep("confirm-served");
      setSelectedMethod("cash");
      setCashInput("");
      setPendingExtras(null);
      return;
    }

    // Seed synchronously from the parent's already-fetched order (e.g.
    // OrderDetailSheet just handed off the same order). Skips the
    // otherwise redundant fetchOrderForBill round-trip and paints
    // items + total on first frame. Methods list is fetched either way
    // — it is independent of the order.
    const seededOrder =
      initialOrder != null && initialOrder.id === orderId
        ? initialOrder
        : null;

    if (seededOrder !== null) {
      setOrder(seededOrder);
      setError(null);
      setCashInput(String(Math.round(Number(seededOrder.total_amount))));
      const isTerminal =
        seededOrder.payment_status === "paid" ||
        seededOrder.status === "completed" ||
        seededOrder.status === "cancelled";
      setStep(isTerminal ? "payment" : "confirm-served");
    }

    let cancelled = false;
    startTransition(async () => {
      const [orderResult, methodsResult] = await Promise.all([
        seededOrder === null
          ? fetchOrderForBill(orderId)
          : Promise.resolve(null),
        fetchPaymentMethodsForPos(branchId),
      ]);
      if (cancelled) return;

      if (orderResult !== null) {
        if (orderResult.success && orderResult.data) {
          const nextOrder = orderResult.data as OrderData;
          setOrder(nextOrder);
          setError(null);
          setCashInput(String(Math.round(Number(nextOrder.total_amount))));
          // Paid / completed orders are already past the serve+pay flow —
          // jump straight to the payment step which renders a read-only
          // paid summary. Avoids the `completed → served` invalid transition
          // that confirm-served would attempt.
          const isTerminal =
            nextOrder.payment_status === "paid" ||
            nextOrder.status === "completed" ||
            nextOrder.status === "cancelled";
          setStep(isTerminal ? "payment" : "confirm-served");
        } else {
          setError(orderResult.error ?? "Không thể tải đơn hàng");
        }
      }

      if (methodsResult.success && methodsResult.data) {
        // Gate phương thức cash theo pos:confirm_payment.
        // Waiter (không có) chỉ thấy QR/MoMo; server cũng reject cash nếu
        // bypass UI (defense in depth).
        const nextMethods = methodsResult.data.methods.filter(
          (m) => m !== "cash" || canConfirmCash,
        );
        setMethods(nextMethods);
        setSelectedMethod(
          nextMethods.includes("cash")
            ? "cash"
            : (nextMethods[0] ?? "vietqr"),
        );
      }
    });

    return () => {
      cancelled = true;
    };
  }, [branchId, canConfirmCash, initialOrder, orderId]);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) onClose();
    },
    [onClose],
  );

  const handleConfirmServed = useCallback(() => {
    if (orderId === null || !order) return;
    startActionTransition(async () => {
      if (order.status !== "served") {
        const result = await updateOrderStatus(orderId, "served");
        if (!result.success) {
          toast.error(result.error ?? "Không thể xác nhận đã phục vụ");
          return;
        }
        await onOrderUpdated?.();
        setOrder((current) =>
          current ? { ...current, status: "served" } : current,
        );
      }
      setStep("payment");
    });
  }, [onOrderUpdated, order, orderId]);

  const handleSelectMethod = useCallback(
    (method: PaymentMethod) => {
      if (!order || orderId === null) return;
      setSelectedMethod(method);

      if (method === "cash") {
        setPendingExtras(null);
        setCashInput(String(Math.round(Number(order.total_amount))));
        return;
      }

      startMethodTransition(async () => {
        const result = await createPayment(
          branchId,
          orderId,
          method,
          Number(order.total_amount),
        );
        if (result.success && result.data) {
          setPendingExtras({
            payment_id: result.data.payment_id,
            provider_ref: result.data.provider_ref,
            qr_data: result.data.qr_data,
            redirect_url: result.data.redirect_url,
            qr_info: result.data.qr_info,
          });
          setOrder((current) =>
            current ? { ...current, payment_method: method } : current,
          );
        } else {
          toast.error(result.error ?? "Không thể tạo thanh toán");
        }
      });
    },
    [branchId, order, orderId],
  );

  const handleConfirmPaid = useCallback(() => {
    if (!order || orderId === null || !canConfirmPaid) return;
    startActionTransition(async () => {
      if (selectedMethod === "cash") {
        const result = await confirmCashPayment(orderId, cashReceived);
        if (result.success) {
          toast.success("Đã thanh toán", {
            description: `Tiền trả khách: ${formatVND(result.data?.cash_change ?? 0)}`,
          });
          await onOrderUpdated?.();
          onClose();
        } else {
          toast.error(result.error ?? "Không thể xác nhận thanh toán");
        }
        return;
      }

      const paymentId = pendingExtras?.payment_id;
      if (!paymentId) return;
      const result = await confirmPayment(
        paymentId,
        pendingExtras.provider_ref ?? "",
      );
      if (result.success) {
        toast.success("Đã thanh toán");
        await onOrderUpdated?.();
        onClose();
      } else {
        toast.error(result.error ?? "Không thể xác nhận thanh toán");
      }
    });
  }, [
    canConfirmPaid,
    cashReceived,
    onClose,
    onOrderUpdated,
    order,
    orderId,
    pendingExtras?.payment_id,
    pendingExtras?.provider_ref,
    selectedMethod,
  ]);

  const MethodIcon = METHOD_META[selectedMethod]?.icon ?? IconCreditCard;

  return (
    <Dialog open={orderId !== null} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {step === "confirm-served" ? (
          <>
            <DialogHeader>
              <DialogTitle>Xác nhận phục vụ</DialogTitle>
              <DialogDescription>
                Xác nhận đã phục vụ đủ món trước khi chuyển sang thanh toán.
              </DialogDescription>
            </DialogHeader>
            {isPending ? (
              <PaymentSkeleton />
            ) : error ? (
              <p className="text-base text-destructive">{error}</p>
            ) : (
              <div className="rounded-lg border bg-card p-3">
                <p className="font-semibold">Đơn #{order?.order_number}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Tổng tạm tính: {formatVND(totalAmount)}
                </p>
              </div>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={actionPending}
              >
                Huỷ
              </Button>
              <Button
                data-testid="bill-confirm-served"
                type="button"
                onClick={handleConfirmServed}
                disabled={isPending || actionPending || Boolean(error)}
              >
                {actionPending ? <Spinner className="mr-2" /> : null}
                Xác nhận đã phục vụ đủ món
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Phương thức thanh toán</DialogTitle>
              <DialogDescription className="sr-only">
                Chọn tiền mặt hoặc chuyển khoản và xác nhận thanh toán.
              </DialogDescription>
            </DialogHeader>

            {isPending ? (
              <PaymentSkeleton />
            ) : error ? (
              <p className="text-base text-destructive">{error}</p>
            ) : order?.payment_status === "paid" ||
              order?.status === "completed" ||
              order?.status === "cancelled" ? (
              <div className="space-y-3">
                <div className="rounded-lg border bg-card p-4">
                  <p className="text-base font-semibold">
                    Đơn #{order.order_number} —{" "}
                    {order.payment_status === "paid"
                      ? "Đã thanh toán"
                      : order.status === "cancelled"
                        ? "Đã huỷ"
                        : "Đã hoàn tất"}
                  </p>
                  <div className="mt-2 flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Tổng đơn</span>
                    <span className="font-semibold tabular-nums">
                      {formatVND(totalAmount)}
                    </span>
                  </div>
                  {order.payment_method && (
                    <div className="mt-1 flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Phương thức</span>
                      <span className="font-medium">
                        {METHOD_META[order.payment_method as PaymentMethod]
                          ?.label ?? order.payment_method}
                      </span>
                    </div>
                  )}
                </div>
                <DialogFooter>
                  <Button type="button" onClick={onClose}>
                    Đóng
                  </Button>
                </DialogFooter>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-2">
                  {methods.map((method) => {
                    const meta = METHOD_META[method] ?? {
                      label: method,
                      icon: IconCreditCard,
                    };
                    const Icon = meta.icon;
                    return (
                      <Button
                        key={method}
                        data-testid={`bill-pay-${method}`}
                        type="button"
                        variant={
                          selectedMethod === method ? "default" : "outline"
                        }
                        className="h-20 flex-col gap-2"
                        onClick={() => handleSelectMethod(method)}
                        disabled={actionPending || methodPending}
                      >
                        <Icon className="size-5" />
                        {meta.label}
                      </Button>
                    );
                  })}
                </div>

                {selectedMethod === "cash" ? (
                  <div className="space-y-4 rounded-lg border p-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm text-muted-foreground">
                        Tổng tạm tính
                      </span>
                      <span className="text-lg font-bold tabular-nums">
                        {formatVND(totalAmount)}
                      </span>
                    </div>

                    <div className="relative">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">
                        Tổng nhận
                      </span>
                      <Input
                        id="cash-received"
                        data-testid="bill-cash-received"
                        type="number"
                        inputMode="numeric"
                        min={0}
                        step={1000}
                        value={cashInput}
                        onChange={(event) => setCashInput(event.target.value)}
                        onFocus={(event) => event.currentTarget.select()}
                        disabled={actionPending}
                        className="h-12 pl-28 pr-3 text-right text-lg font-semibold tabular-nums"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {cashSuggestions.map((amount) => (
                        <Button
                          key={amount}
                          type="button"
                          variant="outline"
                          onClick={() => setCashInput(String(amount))}
                          disabled={actionPending}
                        >
                          {formatVND(amount)}
                        </Button>
                      ))}
                    </div>

                    <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/50 p-3">
                      <span className="text-sm font-medium">
                        Tiền trả khách
                      </span>
                      <span className="text-lg font-bold tabular-nums">
                        {cashReceived < totalAmount
                          ? `Thiếu ${formatVND(totalAmount - cashReceived)}`
                          : formatVND(cashChange)}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4 rounded-lg border p-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm text-muted-foreground">
                        Tổng tạm tính
                      </span>
                      <span className="text-lg font-bold tabular-nums">
                        {formatVND(totalAmount)}
                      </span>
                    </div>

                    {methodPending ? (
                      <div className="space-y-3">
                        <Skeleton className="mx-auto size-48" />
                        <Skeleton className="h-5 w-full" />
                        <Skeleton className="h-5 w-4/5" />
                      </div>
                    ) : (
                      <>
                        {pendingExtras?.qr_data ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={pendingExtras.qr_data}
                            alt="QR chuyển khoản"
                            className="mx-auto max-h-72 w-full max-w-72 object-contain"
                          />
                        ) : (
                          <div className="mx-auto flex size-48 items-center justify-center rounded-lg border bg-muted/40">
                            <MethodIcon className="size-10 text-muted-foreground" />
                          </div>
                        )}
                        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-sm">
                          <dt className="text-muted-foreground">STK:</dt>
                          <dd className="font-mono font-semibold">
                            {pendingExtras?.qr_info?.account_no ?? "Đang tạo"}
                          </dd>
                          <dt className="text-muted-foreground">Nội dung:</dt>
                          <dd className="font-mono">
                            {pendingExtras?.qr_info?.description ??
                              `DH ${order?.order_number ?? ""}`}
                          </dd>
                        </dl>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            <DialogFooter>
              <Button
                data-testid={
                  selectedMethod === "cash" ? "bill-confirm-cash" : undefined
                }
                type="button"
                onClick={handleConfirmPaid}
                disabled={
                  isPending || methodPending || actionPending || !canConfirmPaid
                }
              >
                {actionPending ? <Spinner className="mr-2" /> : null}
                Đã thanh toán
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={actionPending}
              >
                Huỷ
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
