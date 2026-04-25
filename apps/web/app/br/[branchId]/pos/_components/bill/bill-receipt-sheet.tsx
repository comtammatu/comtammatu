"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import type { ComponentType } from "react";
import { formatVND } from "@comtammatu/shared/format";
import type { PaymentMethod } from "@comtammatu/shared/providers";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@comtammatu/ui/components/alert";
import { Button } from "@comtammatu/ui/components/button";
import { Card, CardContent } from "@comtammatu/ui/components/card";
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
import {
  TriangleAlert as IconAlertTriangle,
  Banknote as IconCash,
  CreditCard as IconCreditCard,
  QrCode as IconQrcode,
} from "lucide-react";
import { AppBoneyardSkeleton } from "../../../../../_components/boneyard-skeleton";
import { fetchOrderForBill } from "../../actions";
import {
  confirmCashPaymentWithInvoice,
  confirmPayment,
  createPayment,
  fetchPaymentMethodsForPos,
} from "../../payment-actions";
import type { OrderData, PendingExtras } from "./bill-receipt-types";
import {
  buildInvoicePayload,
  EMPTY_INVOICE_FORM,
  InvoiceFormSection,
  isInvoiceFormValid,
  type InvoiceFormState,
} from "./invoice-form-section";

interface BillReceiptProps {
  branchId: number;
  orderId: number | null;
  /**
   * Order data already fetched by an upstream sheet. When it matches `orderId`,
   * the bill opens without an extra order fetch.
   */
  initialOrder?: OrderData | null;
  /**
   * `pos:confirm_payment`: only cashier+ can confirm cash. QR/MoMo stay visible
   * for POS users because e-wallet settlement is not physical cash handling.
   */
  canConfirmCash: boolean;
  onOrderUpdated?: () => void | Promise<void>;
  onClose: () => void;
}

const METHOD_META: Record<
  PaymentMethod,
  {
    label: string;
    icon: ComponentType<{ className?: string }>;
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
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
      <Card size="sm">
        <CardContent className="flex flex-col gap-3">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-10 w-full" />
          <div className="grid grid-cols-2 gap-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

const PAYMENT_LOADING_TEXT = {
  cash: "Ti\u1ec1n m\u1eb7t",
  qr: "Chuy\u1ec3n kho\u1ea3n",
  received: "T\u1ed5ng nh\u1eadn",
  total: "T\u1ed5ng t\u1ea1m t\u00ednh",
} as const;

function PaymentLoadingFixture() {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="default" className="h-20 flex-col gap-2">
          <IconCash data-icon="inline-start" />
          {PAYMENT_LOADING_TEXT.cash}
        </Button>
        <Button type="button" variant="outline" className="h-20 flex-col gap-2">
          <IconQrcode data-icon="inline-start" />
          {PAYMENT_LOADING_TEXT.qr}
        </Button>
      </div>
      <Card size="sm">
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-muted-foreground">
              {PAYMENT_LOADING_TEXT.total}
            </span>
            <span className="text-lg font-bold tabular-nums">
              {formatVND(165000)}
            </span>
          </div>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">
              {PAYMENT_LOADING_TEXT.received}
            </span>
            <Input
              readOnly
              value="165000"
              className="h-12 pl-28 pr-3 text-right text-lg font-semibold tabular-nums"
            />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {[165000, 170000, 200000, 500000].map((amount) => (
              <Button key={amount} type="button" variant="outline">
                {formatVND(amount)}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function PaymentQrSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="mx-auto size-48" />
      <Skeleton className="h-5 w-full" />
      <Skeleton className="h-5 w-4/5" />
    </div>
  );
}

function PaymentQrLoadingFixture() {
  return (
    <div className="flex flex-col gap-3">
      <div className="mx-auto flex size-48 items-center justify-center border bg-muted/40">
        <IconQrcode className="text-muted-foreground" />
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
        <dt className="text-muted-foreground">STK:</dt>
        <dd className="font-mono font-semibold">9704 0000 0000 0000</dd>
        <dt className="text-muted-foreground">Noi dung:</dt>
        <dd className="font-mono">DH A001</dd>
      </dl>
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
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>(
    canConfirmCash ? "cash" : "vietqr",
  );
  const [cashInput, setCashInput] = useState("");
  const [pendingExtras, setPendingExtras] = useState<PendingExtras | null>(
    null,
  );
  const [invoiceForm, setInvoiceForm] =
    useState<InvoiceFormState>(EMPTY_INVOICE_FORM);
  const [isPending, startTransition] = useTransition();
  const [actionPending, startActionTransition] = useTransition();
  const [methodPending, startMethodTransition] = useTransition();

  const totalAmount = Number(order?.total_amount ?? 0);
  const cashReceived = Number(cashInput) || 0;
  const cashChange = cashReceived - totalAmount;
  const invoiceValid = isInvoiceFormValid(invoiceForm);
  const canConfirmPaid =
    invoiceValid &&
    (selectedMethod === "cash"
      ? cashReceived >= totalAmount && totalAmount > 0
      : Boolean(pendingExtras?.payment_id));

  const cashSuggestions = useMemo(
    () => buildCashSuggestions(totalAmount),
    [totalAmount],
  );

  useEffect(() => {
    if (orderId === null) {
      setOrder(null);
      setMethods([]);
      setError(null);
      setSelectedMethod(canConfirmCash ? "cash" : "vietqr");
      setCashInput("");
      setPendingExtras(null);
      setInvoiceForm(EMPTY_INVOICE_FORM);
      return;
    }

    const seededOrder =
      initialOrder != null && initialOrder.id === orderId ? initialOrder : null;

    if (seededOrder !== null) {
      setOrder(seededOrder);
      setError(null);
      setCashInput(String(Math.round(Number(seededOrder.total_amount))));
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
        } else {
          setError(orderResult.error ?? "Không thể tải đơn hàng");
        }
      }

      if (methodsResult.success && methodsResult.data) {
        const nextMethods = methodsResult.data.methods.filter(
          (method) => method !== "cash" || canConfirmCash,
        );
        setMethods(nextMethods);
        setSelectedMethod(
          nextMethods.includes("cash") ? "cash" : (nextMethods[0] ?? "vietqr"),
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
    // Freeze invoice payload at click — chống race nếu cashier sửa form
    // trong lúc submit đang chạy.
    const invoicePayload = buildInvoicePayload(invoiceForm);

    startActionTransition(async () => {
      if (selectedMethod === "cash") {
        const result = await confirmCashPaymentWithInvoice(
          orderId,
          cashReceived,
          invoicePayload,
        );
        if (!result.success) {
          toast.error(result.error ?? "Không thể xác nhận thanh toán");
          return;
        }
        const change = result.data?.cash_change ?? 0;
        const inv = result.data?.invoice ?? null;
        if (inv == null) {
          toast.success("Đã thanh toán", {
            description: `Tiền trả khách: ${formatVND(change)}`,
          });
        } else if (inv.status === "failed") {
          toast.warning("Đã thu tiền — HĐĐT chưa xuất được", {
            description: inv.error ?? "Lưu nháp; Finance sẽ xuất lại sau.",
          });
        } else {
          toast.success("Đã thanh toán & xuất HĐĐT", {
            description: `Số HĐ: ${inv.invoiceNumber ?? `#${inv.invoiceId}`} · Tiền trả khách: ${formatVND(change)}`,
          });
        }
        await onOrderUpdated?.();
        onClose();
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
    invoiceForm,
    onClose,
    onOrderUpdated,
    order,
    orderId,
    pendingExtras?.payment_id,
    pendingExtras?.provider_ref,
    selectedMethod,
  ]);

  const MethodIcon = METHOD_META[selectedMethod]?.icon ?? IconCreditCard;
  const isReadOnlyOrder =
    order?.payment_status === "paid" ||
    order?.status === "completed" ||
    order?.status === "cancelled";
  const showUnservedWarning =
    order != null && !isReadOnlyOrder && order.status !== "served";

  return (
    <Dialog open={orderId !== null} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Phương thức thanh toán</DialogTitle>
          <DialogDescription className="sr-only">
            Chọn tiền mặt hoặc chuyển khoản và xác nhận thanh toán.
          </DialogDescription>
        </DialogHeader>

        {isPending ? (
          <AppBoneyardSkeleton
            name="pos-bill-receipt-payment"
            loading
            fixture={<PaymentLoadingFixture />}
            fallback={<PaymentSkeleton />}
            snapshotConfig={{ excludeSelectors: ["svg"] }}
          >
            <PaymentLoadingFixture />
          </AppBoneyardSkeleton>
        ) : error ? (
          <p className="text-base text-destructive">{error}</p>
        ) : isReadOnlyOrder && order ? (
          <div className="flex flex-col gap-3">
            <Card size="sm">
              <CardContent className="flex flex-col gap-2">
                <p className="text-base font-semibold">
                  Đơn #{order.order_number} -{""}
                  {order.payment_status === "paid"
                    ? "Đã thanh toán"
                    : order.status === "cancelled"
                      ? "Đã hủy"
                      : "Đã thanh toán"}
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
              </CardContent>
            </Card>
            <DialogFooter>
              <Button type="button" onClick={onClose}>
                Đóng
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-4">
              {showUnservedWarning ? (
                <Alert className="border-warning/20 bg-warning/10 text-warning">
                  <IconAlertTriangle />
                  <AlertTitle>Đơn chưa đánh dấu đã phục vụ</AlertTitle>
                  <AlertDescription>
                    Có thể thanh toán ngay. Nút"Đã phục vụ" chỉ cập nhật trạng
                    thái phục vụ, không khóa thanh toán.
                  </AlertDescription>
                </Alert>
              ) : null}

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
                      <Icon data-icon="inline-start" />
                      {meta.label}
                    </Button>
                  );
                })}
              </div>

              {selectedMethod === "cash" ? (
                <Card size="sm">
                  <CardContent className="flex flex-col gap-4">
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

                    <div className="flex items-center justify-between gap-3 bg-muted/50 p-3">
                      <span className="text-sm font-medium">
                        Tiền trả khách
                      </span>
                      <span className="text-lg font-bold tabular-nums">
                        {cashReceived < totalAmount
                          ? `Thiếu ${formatVND(totalAmount - cashReceived)}`
                          : formatVND(cashChange)}
                      </span>
                    </div>

                    <InvoiceFormSection
                      state={invoiceForm}
                      totalAmount={totalAmount}
                      disabled={actionPending}
                      onChange={setInvoiceForm}
                    />
                  </CardContent>
                </Card>
              ) : (
                <Card size="sm">
                  <CardContent className="flex flex-col gap-4">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm text-muted-foreground">
                        Tổng tạm tính
                      </span>
                      <span className="text-lg font-bold tabular-nums">
                        {formatVND(totalAmount)}
                      </span>
                    </div>

                    {methodPending ? (
                      <AppBoneyardSkeleton
                        name="pos-bill-receipt-qr"
                        loading
                        fixture={<PaymentQrLoadingFixture />}
                        fallback={<PaymentQrSkeleton />}
                        snapshotConfig={{ excludeSelectors: ["svg"] }}
                      >
                        <PaymentQrLoadingFixture />
                      </AppBoneyardSkeleton>
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
                          <div className="mx-auto flex size-48 items-center justify-center border bg-muted/40">
                            <MethodIcon className="size-10 text-muted-foreground" />
                          </div>
                        )}
                        <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
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
                  </CardContent>
                </Card>
              )}
            </div>

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
                {actionPending ? <Spinner data-icon="inline-start" /> : null}
                Đã thanh toán
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={actionPending}
              >
                Hủy
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
