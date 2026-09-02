"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRealtimeChannel } from "@/_hooks/use-realtime-channel";
import { makeRealtimeCoalescer } from "@/_utils/realtime-scheduler";
import type { ComponentType } from "react";
import { formatVND } from "@comtammatu/shared/format";
import { PAYMENT_METHOD_LABELS_VI } from "@comtammatu/shared/labels";
import { type PaymentMethod } from "@comtammatu/shared/providers";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@comtammatu/ui/components/alert";
import { Button } from "@comtammatu/ui/components/button";
import { Kbd } from "@comtammatu/ui/components/kbd";
import { confirm } from "@/components/confirm-dialog";
import { StationSection, StationSheet } from "@/components/surface";
import { Frame } from "@comtammatu/ui/components/frame";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@comtammatu/ui/components/input-group";
import { Skeleton } from "@comtammatu/ui/components/skeleton";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { toast } from "@comtammatu/ui/components/sonner";
import { cn } from "@comtammatu/ui";
import {
  TriangleAlert as IconAlertTriangle,
  Banknote as IconCash,
  CreditCard as IconCreditCard,
  Printer as IconPrinter,
  QrCode as IconQrcode,
  Receipt as IconReceipt,
} from "lucide-react";
import { AppBoneyardSkeleton } from "@/_components/boneyard-skeleton";
import { WholeVndInput } from "@/components/form";
import { QrCodeImage as PaymentQrCode } from "@/components/qr-code-image";
import { useIsOnline } from "@/components/pwa-runtime";
import { messages } from "@lib/messages";
import { fetchOrderForBill } from "../../actions";
import type { SessionOrder } from "../../order-history";
import {
  confirmCashPaymentWithInvoice,
  confirmPlatformPaymentWithInvoice,
  cancelPendingPayment,
  createPayment,
  fetchPendingRemotePaymentForBill,
  type VietQrConfig,
} from "../../payment-actions";
import { cancelSelfOrderPaymentRequest } from "../../self-order-actions";
import { printProvisionalBill, printReceipt } from "../../print-actions";
import { DeliveryPlatformMark } from "@/components/delivery-platform-mark";
import { BillReceiptSummary } from "./bill-receipt-summary";
import { OrderTotalsSummary } from "../order-totals-summary";
import type {
  BillReceiptIntent,
  OrderData,
  PendingExtras,
} from "./bill-receipt-types";
import {
  canConvertPosCashToVietQr,
  canPrintPosVietQrPayment,
} from "../../_lib/cash-to-vietqr";
import {
  confirmConvertCashToVietQr,
  convertCashToVietQrAndPrint,
  printPaidVietQr,
} from "../../_lib/cash-to-vietqr-flow";

import { ACTIONS_VI, SELF_ORDER_VI } from "@comtammatu/shared/messages";
interface BillReceiptProps {
  branchId: number;
  orderId: number | null;
  intent?: BillReceiptIntent;
  /**
   * Order data already fetched by an upstream sheet. When it matches `orderId`,
   * the bill opens without an extra order fetch.
   */
  initialOrder?: OrderData | null;
  /**
   * `pos:confirm_payment`: only cashier+ can confirm cash. VietQR stays visible
   * for POS users because e-wallet settlement is not physical cash handling.
   */
  canConfirmCash: boolean;
  /**
   * Cashier-counter `pos:print`. Waiter (`branch_staff`) must not see
   * "In tạm tính" even when a stale grant remains.
   */
  canPrintProvisional: boolean;
  /**
   * Tenant-stable payment methods (cash + enabled e-wallets) seeded from RSC
   * `fetchPaymentMethodsForPos`. Stable for the entire shift — admin changes
   * trigger `revalidatePath('/br/[branchId]/pos', 'page')` to refresh seeds.
   */
  initialPaymentMethods: readonly PaymentMethod[];
  /**
   * Tenant-stable VietQR bank config seeded from RSC `fetchVietQrConfig`.
   * `null` when VietQR is disabled or not configured.
   */
  initialVietQrConfig: VietQrConfig | null;
  /**
   * Header-only snapshot từ `usePosOrders()` — đủ để hiển thị `#order_number`
   * + total trên dialog title trong khi `fetchOrderForBill` chạy nền. Chỉ
   * dùng cho path không có `initialOrder` (F9 / OrderListPane / picker /
   * post-submit toast). Khi `initialOrder` match `orderId`, prop này
   * không có hiệu lực vì full seed đã render bill ngay.
   */
  initialHeaderSeed?: SessionOrder | null;
  /** Active guest payment request tied to this exact order, if any. */
  selfOrderPaymentRequestId?: number | null;
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
  cash: { label: PAYMENT_METHOD_LABELS_VI.cash, icon: IconCash },
  vietqr: { label: PAYMENT_METHOD_LABELS_VI.vietqr, icon: IconQrcode },
};

const REMOTE_PAYMENT_COPY = {
  accountLabel: "STK:",
  descriptionLabel: "Nội dung:",
  creating: "Đang tạo",
  unavailable: "Chưa có",
  qrCreateFailedTitle: "Không tạo được QR",
  qrUnavailableDescription:
    "Phiên thanh toán đang chờ nhưng thiếu dữ liệu QR. Tạo lại QR để lấy mã mới.",
  retryCreate: "Tạo lại QR",
  createQr: "Tạo mã QR",
  qrAltFallback: "thanh toán",
} as const;

const VND_DENOMINATIONS = [
  500_000, 200_000, 100_000, 50_000, 20_000, 10_000, 5_000, 2_000, 1_000, 500,
] as const;

// The confirm RPCs surface a stale-total failure as a localized message
// (no structured code crosses the action boundary). Match the stable phrases
// the server returns so the cashier can re-pull the order total and re-confirm
// in place instead of hitting a dead-end toast.
function isAmountMismatchError(message: string | undefined | null): boolean {
  if (!message) return false;
  return (
    message.includes("Tổng tiền đơn đã thay đổi") ||
    message.includes("Số tiền không khớp")
  );
}

function greedyNoteCount(amount: number): number {
  let count = 0;
  let rest = Math.round(amount);
  for (const note of VND_DENOMINATIONS) {
    if (rest <= 0) break;
    const k = Math.floor(rest / note);
    count += k;
    rest -= k * note;
  }
  return count + (rest > 0 ? 1 : 0);
}

function buildCashSuggestions(totalAmount: number): number[] {
  const total = Math.max(0, Math.round(totalAmount));
  if (!Number.isFinite(total) || total === 0) return [];

  const HIGHEST_NOTE = 500_000;
  const exactNotes = greedyNoteCount(total);
  const candidates = new Set<number>([total]);

  if (total < HIGHEST_NOTE) {
    candidates.add(Math.ceil(total / 10_000) * 10_000);
    candidates.add(Math.ceil(total / 50_000) * 50_000);
    candidates.add(Math.ceil(total / 100_000) * 100_000);
    for (const note of [50_000, 100_000, 200_000, HIGHEST_NOTE]) {
      if (note >= total) candidates.add(note);
    }
  } else {
    candidates.add(Math.ceil(total / 50_000) * 50_000);
    candidates.add(Math.ceil(total / 100_000) * 100_000);
    for (let k = Math.ceil(total / HIGHEST_NOTE); k <= exactNotes + 1; k++) {
      candidates.add(k * HIGHEST_NOTE);
    }
  }

  return Array.from(candidates)
    .filter(
      (value) =>
        value >= total && value > 0 && greedyNoteCount(value) <= exactNotes,
    )
    .sort((a, b) => a - b)
    .slice(0, 6);
}

function PaymentPendingPreview() {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
      <StationSection size="sm" contentClassName="gap-3">
        <>
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-10 w-full" />
          <div className="grid grid-cols-2 gap-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        </>
      </StationSection>
    </div>
  );
}

const PAYMENT_LOADING_TEXT = {
  cash: "Ti\u1ec1n m\u1eb7t",
  qr: "Chuy\u1ec3n kho\u1ea3n",
  received: "T\u1ed5ng nh\u1eadn",
} as const;

function PaymentLoadingFixture() {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant="outline"
          size="touch-lg"
          aria-pressed
          className="flex-col gap-2 border-foreground bg-muted"
        >
          <IconCash data-icon="inline-start" />
          {PAYMENT_LOADING_TEXT.cash}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="touch-lg"
          className="flex-col gap-2"
        >
          <IconQrcode data-icon="inline-start" />
          {PAYMENT_LOADING_TEXT.qr}
        </Button>
      </div>
      <StationSection size="sm" contentClassName="gap-3">
        <>
          <InputGroup className="h-10">
            <InputGroupAddon>{PAYMENT_LOADING_TEXT.received}</InputGroupAddon>
            <InputGroupInput
              readOnly
              value="165000"
              className="text-right text-lg font-mono font-semibold tabular-nums"
            />
          </InputGroup>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {[165000, 170000, 200000, 500000].map((amount) => (
              <Button key={amount} type="button" variant="outline">
                {formatVND(amount)}
              </Button>
            ))}
          </div>
        </>
      </StationSection>
    </div>
  );
}

function PaymentQrPendingPreview() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="mx-auto size-36" />
      <Skeleton className="h-5 w-full" />
      <Skeleton className="h-5 w-4/5" />
    </div>
  );
}

function PaymentQrPlaceholder({
  Icon,
}: {
  Icon: ComponentType<{ className?: string }>;
}) {
  return (
    <Frame className="mx-auto flex size-36 items-center justify-center bg-muted/50">
      <Icon className="size-8 text-muted-foreground" />
    </Frame>
  );
}

function PaymentQrLoadingFixture() {
  return (
    <div className="flex flex-col gap-3">
      <PaymentQrPlaceholder Icon={IconQrcode} />
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
        <dt className="text-muted-foreground">STK:</dt>
        <dd className="font-mono font-semibold">9704 0000 0000 0000</dd>
        <dt className="text-muted-foreground">Noi dung:</dt>
        <dd className="font-mono">DH A001</dd>
      </dl>
    </div>
  );
}

const RECEIPT_LOADING_ORDER: OrderData = {
  id: 0,
  order_number: "TC-000000-000",
  order_type: "dine_in",
  status: "completed",
  payment_status: "paid",
  payment_method: "cash",
  subtotal: 138000,
  tax_amount: 0,
  service_charge: 0,
  discount_amount: 0,
  order_discount_amount: 0,
  item_discount_amount: 0,
  discount_type: null,
  discount_value: null,
  discount_note: null,
  total_amount: 138000,
  note: null,
  is_priority: false,
  created_at: "2026-04-26T00:00:00.000Z",
  table_id: 2,
  split_from_order_id: null,
  merged_into_order_id: null,
  cash_received: null,
  cash_change: null,
  tables: { number: 2 },
  branches: {
    name: "Chi nhánh",
    address: "Địa chỉ chi nhánh",
    phone: null,
  },
  order_items: [
    {
      id: 0,
      item_name: "Sườn Cây",
      variant_name: null,
      quantity: 2,
      unit_price: 69000,
      subtotal: 138000,
      discount_amount: 0,
      discount_type: null,
      discount_value: null,
      discount_note: null,
      modifiers: [],
      sides: [],
      note: null,
    },
  ],
};

function ReceiptLoadingFixture() {
  return <BillReceiptSummary order={RECEIPT_LOADING_ORDER} />;
}

function RemotePaymentDetails({
  pendingExtras,
  isCreating,
}: {
  pendingExtras: PendingExtras | null;
  isCreating: boolean;
}) {
  return (
    <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
      <dt className="text-muted-foreground">
        {REMOTE_PAYMENT_COPY.accountLabel}
      </dt>
      <dd className="font-mono font-semibold">
        {pendingExtras?.qr_info?.account_no ??
          (isCreating
            ? REMOTE_PAYMENT_COPY.creating
            : REMOTE_PAYMENT_COPY.unavailable)}
      </dd>
      <dt className="text-muted-foreground">
        {REMOTE_PAYMENT_COPY.descriptionLabel}
      </dt>
      <dd className="font-mono">
        {pendingExtras?.qr_info?.description ??
          pendingExtras?.provider_ref ??
          (isCreating
            ? REMOTE_PAYMENT_COPY.creating
            : REMOTE_PAYMENT_COPY.unavailable)}
      </dd>
    </dl>
  );
}

export function BillReceipt({
  branchId,
  orderId,
  intent = "payment",
  initialOrder,
  canConfirmCash,
  canPrintProvisional,
  initialPaymentMethods,
  initialHeaderSeed,
  selfOrderPaymentRequestId = null,
  onOrderUpdated,
  onClose,
}: BillReceiptProps) {
  const [order, setOrder] = useState<OrderData | null>(null);
  // Methods + VietQR config are tenant-stable for the entire shift; seeded
  // from RSC props so opening the bill no longer waits on 2 settings round-
  // trips. Owner saves trigger `revalidatePath('/br/[branchId]/pos', 'page')`
  // so a config change refreshes the seed on next navigation.
  const methods = useMemo<PaymentMethod[]>(
    () =>
      initialPaymentMethods.filter(
        (method) => method !== "cash" || canConfirmCash,
      ),
    [initialPaymentMethods, canConfirmCash],
  );
  const [error, setError] = useState<string | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>(
    canConfirmCash ? "cash" : "vietqr",
  );
  const [cashInput, setCashInput] = useState("");
  const [pendingExtras, setPendingExtras] = useState<PendingExtras | null>(
    null,
  );
  const [isPending, startTransition] = useTransition();
  const [actionPending, startActionTransition] = useTransition();
  const [methodPending, setMethodPending] = useState(false);
  const [printPending, startPrintTransition] = useTransition();
  const [paymentCreateError, setPaymentCreateError] = useState<string | null>(
    null,
  );
  const isOnline = useIsOnline();
  // When the cashier taps a non-cash method while offline, remember the
  // intent so we can auto-restore it on reconnect. Without this, every
  // wifi flicker forces a re-tap. Cleared on: explicit method pick (any
  // method including cash), sheet close, orderId change.
  const [pendingOfflineMethod, setPendingOfflineMethod] =
    useState<PaymentMethod | null>(null);
  const hydratedPaymentOrderRef = useRef<number | null>(null);
  // Tracks orderId we've already defaulted selectedMethod for. Without this,
  // any dep churn (router.refresh from realtime / visibilitychange / phone
  // rotate causing an RSC re-render with a new initialPaymentMethods array ref)
  // re-runs the bill-open effect and clobbers the cashier's
  // VietQR pick back to cash. Reset on orderId=null in the close branch.
  const methodDefaultedOrderRef = useRef<number | null>(null);

  const totalAmount = Number(order?.total_amount ?? 0);
  const cashReceived = Number(cashInput) || 0;
  const cashChange = cashReceived - totalAmount;
  const isDeliveryOrder = order?.order_type === "delivery";
  // Cash is the only cashier-confirmable payment. VietQR settles only through
  // the verified SePay webhook.
  const canConfirmPaid =
    isOnline &&
    (isDeliveryOrder
      ? canConfirmCash
      : selectedMethod === "cash" && cashReceived >= totalAmount);

  // Tooltip explaining why the button is disabled — a dimmed button must
  // tell the cashier what is missing (offline, bad tax code, not enough
  // cash, QR not created). Native `title=` is enough; no Tooltip component.
  const disabledReason = canConfirmPaid
    ? null
    : !isOnline
      ? "Mất kết nối — không thể thanh toán khi mất mạng"
      : isDeliveryOrder
        ? "Không có quyền xác nhận thu nền tảng"
        : selectedMethod === "cash"
          ? "Khách chưa thanh toán đủ tổng đơn"
          : "Chưa tạo mã chuyển khoản";

  const cashSuggestions = useMemo(
    () => buildCashSuggestions(totalAmount),
    [totalAmount],
  );
  const orderIdRef = useRef(orderId);
  const intentRef = useRef(intent);
  const onCloseRef = useRef(onClose);
  const onOrderUpdatedRef = useRef(onOrderUpdated);
  useEffect(() => {
    orderIdRef.current = orderId;
    intentRef.current = intent;
    onCloseRef.current = onClose;
    onOrderUpdatedRef.current = onOrderUpdated;
  }, [intent, onClose, onOrderUpdated, orderId]);

  useEffect(() => {
    if (orderId === null) {
      setOrder(null);
      setError(null);
      setSelectedMethod(canConfirmCash ? "cash" : "vietqr");
      setCashInput("");
      setPendingExtras(null);
      setMethodPending(false);
      setPaymentCreateError(null);
      setPendingOfflineMethod(null);
      hydratedPaymentOrderRef.current = null;
      methodDefaultedOrderRef.current = null;
      return;
    }

    // Methods are tenant-stable (props-derived) — re-default selectedMethod
    // immediately on bill open so cashier sees a sensible pick before any
    // fetch starts. Gate with methodDefaultedOrderRef so dep churn (e.g.
    // RSC re-render handing back a new initialPaymentMethods array ref on
    // phone rotate / visibilitychange) doesn't clobber the cashier's pick.
    if (methodDefaultedOrderRef.current !== orderId) {
      methodDefaultedOrderRef.current = orderId;
      setSelectedMethod(
        methods.includes("cash") ? "cash" : (methods[0] ?? "vietqr"),
      );
    }

    const seededOrder =
      initialOrder != null && initialOrder.id === orderId ? initialOrder : null;

    if (seededOrder !== null) {
      setOrder(seededOrder);
      setError(null);
      setCashInput(String(Math.round(Number(seededOrder.total_amount))));
      return;
    }

    let cancelled = false;
    startTransition(async () => {
      const orderResult = await fetchOrderForBill(orderId);
      if (cancelled) return;

      if (orderResult.success && orderResult.data) {
        const nextOrder = orderResult.data as OrderData;
        if (
          intentRef.current !== "receipt" &&
          (nextOrder.status === "completed" ||
            nextOrder.payment_status === "paid" ||
            nextOrder.status === "cancelled")
        ) {
          if (nextOrder.status === "cancelled") {
            toast.warning("Đơn đã bị huỷ — đóng thanh toán.");
          } else {
            toast.success("Đơn đã hoàn tất thanh toán.");
          }
          void onOrderUpdatedRef.current?.();
          onCloseRef.current();
          return;
        }
        setOrder(nextOrder);
        setError(null);
        setCashInput(String(Math.round(Number(nextOrder.total_amount))));
      } else {
        setError(orderResult.error ?? messages.pos.order.loadFailed);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [canConfirmCash, initialOrder, methods, orderId]);

  // Cross-terminal realtime sync. Without this, when cashier on tablet
  // A confirms cash payment for an order, tablet B with the same bill
  // open keeps showing "đang chờ khách xác nhận" until manual refresh
  // — exactly the symptom described in the original payment-realtime
  // migration that this sheet's predecessor (`bill-receipt-payment-status`)
  // used to handle. Subscribe to:
  //   - orders:id=eq.{orderId} for `payment_status` UPDATE (cross-tablet
  //     confirm sync) and `status='completed'` (auto-close on payment).
  //   - payments:order_id=eq.{orderId} for any payment row change
  //     (covers VietQR webhook callbacks confirming a pending
  //     e-wallet payment in real time).
  // Refetches the full order on any event — `fetchOrderForBill` is the
  // single source of truth and the response includes `payment_status`,
  // payment_method and total totals. Coalesce orders + payments events so
  // one payment transition does not trigger duplicate bill RPCs in a tab.
  const refetchOrderNow = useCallback(async (): Promise<void> => {
    const targetOrderId = orderIdRef.current;
    if (targetOrderId === null) return;
    const result = await fetchOrderForBill(targetOrderId);
    if (orderIdRef.current !== targetOrderId) return;
    if (result.success && result.data) {
      const nextOrder = result.data as OrderData;
      if (
        intentRef.current !== "receipt" &&
        (nextOrder.status === "completed" ||
          nextOrder.payment_status === "paid" ||
          nextOrder.status === "cancelled")
      ) {
        if (nextOrder.status === "cancelled") {
          toast.warning("Đơn đã bị huỷ — đóng thanh toán.");
        } else {
          toast.success("Đơn đã hoàn tất thanh toán.");
        }
        await onOrderUpdatedRef.current?.();
        onCloseRef.current();
        return;
      }
      setOrder(nextOrder);
    }
  }, []);
  const refetchOrder = useMemo(
    () =>
      makeRealtimeCoalescer(refetchOrderNow, undefined, {
        metricName: "pos.bill-receipt.refresh",
      }),
    [refetchOrderNow],
  );

  const refetchOrderRef = useRef(refetchOrder);
  useEffect(() => {
    refetchOrderRef.current = refetchOrder;
  }, [refetchOrder]);

  // Reconnect-resync: see REALTIME-SUBSCRIBE-NEEDS-STATUS-CALLBACK. Supabase
  // Realtime is at-most-once — events fired while disconnected are lost.
  // Skip the FIRST `SUBSCRIBED` (initial subscribe — order is already seeded
  // by the load effect above); on every later `SUBSCRIBED` (genuine
  // reconnect) refetch so missed payment / append events catch up.
  const initialSubscribeSeenRef = useRef(false);
  useEffect(() => {
    initialSubscribeSeenRef.current = false;
  }, [orderId]);

  useRealtimeChannel(
    (supabase) => {
      if (orderId === null) return null;
      return supabase
        .channel(`pos-bill-${String(orderId)}`)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "orders",
            filter: `id=eq.${String(orderId)}`,
          },
          (payload) => {
            if (intentRef.current !== "receipt") {
              const updated = payload.new as Record<string, unknown> | null;
              if (updated) {
                const status =
                  typeof updated.status === "string" ? updated.status : null;
                const paymentStatus =
                  typeof updated.payment_status === "string"
                    ? updated.payment_status
                    : null;
                if (status === "cancelled") {
                  toast.warning("Đơn đã bị huỷ — đóng thanh toán.");
                  onCloseRef.current();
                  return;
                }
                if (status === "completed" || paymentStatus === "paid") {
                  toast.success("Đơn đã hoàn tất thanh toán.");
                  void onOrderUpdatedRef.current?.();
                  onCloseRef.current();
                  return;
                }
              }
            }
            refetchOrderRef.current();
          },
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "payments",
            filter: `order_id=eq.${String(orderId)}`,
          },
          () => {
            refetchOrderRef.current();
          },
        )
        .subscribe((status) => {
          if (status !== "SUBSCRIBED") return;
          if (!initialSubscribeSeenRef.current) {
            initialSubscribeSeenRef.current = true;
            return;
          }
          refetchOrderRef.current();
        });
    },
    [orderId],
  );

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) onClose();
    },
    [onClose],
  );

  const handleSelectMethod = useCallback(
    (method: PaymentMethod) => {
      if (!order || orderId === null) return;

      const isAmountStale =
        pendingExtras?.qr_info?.amount != null &&
        Number(pendingExtras.qr_info.amount) !== Number(order.total_amount);
      const existingPaymentId = pendingExtras?.payment_id ?? null;

      if (
        method === selectedMethod &&
        pendingExtras?.payment_id !== undefined &&
        (pendingExtras.qr_data || pendingExtras.redirect_url) &&
        !isAmountStale
      ) {
        return;
      }

      setSelectedMethod(method);
      setPaymentCreateError(null);
      setPendingExtras(null);
      setPendingOfflineMethod(null);

      if (method === "cash") {
        setCashInput(String(Math.round(Number(order.total_amount))));
        if (existingPaymentId != null && !selfOrderPaymentRequestId) {
          void (async () => {
            const result = await cancelPendingPayment(
              branchId,
              existingPaymentId,
            );
            if (!result.success) {
              toast.error(
                result.error ?? messages.pos.payment.cancelPendingFailed,
              );
              return;
            }
            setOrder((current) =>
              current
                ? {
                    ...current,
                    payment_method: null,
                    payment_status: "unpaid",
                  }
                : current,
            );
            await onOrderUpdated?.();
          })();
        }
        return;
      }

      // When cashier explicitly selects a remote method, create the matching
      // payment row; provisional bill QR only needs the order payment code.
      if (!isOnline) {
        setPendingOfflineMethod(method);
        toast.error("Mất kết nối — sẽ tự thử lại khi có mạng.");
        return;
      }

      setMethodPending(true);
      void (async () => {
        try {
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
            const message = result.error ?? "Không thể tạo thanh toán";
            setPaymentCreateError(message);
            toast.error(message);
          }
        } catch {
          setPaymentCreateError("Không thể tạo thanh toán");
          toast.error("Không thể tạo thanh toán");
        } finally {
          setMethodPending(false);
        }
      })();
    },
    [
      branchId,
      isOnline,
      onOrderUpdated,
      order,
      orderId,
      pendingExtras?.payment_id,
      pendingExtras?.qr_data,
      pendingExtras?.qr_info?.amount,
      pendingExtras?.redirect_url,
      selectedMethod,
      selfOrderPaymentRequestId,
    ],
  );

  useEffect(() => {
    if (orderId === null || !order) return;
    // Remote orders stay 'unpaid' while the payment row is pending. Guard:
    // skip paid orders and non-remote methods.
    if (order.payment_status === "paid") return;
    if (order.payment_method !== "vietqr") {
      return;
    }
    if (!methods.includes(order.payment_method)) return;
    if (pendingExtras !== null) return;
    if (hydratedPaymentOrderRef.current === orderId) return;

    setSelectedMethod(order.payment_method);
    hydratedPaymentOrderRef.current = orderId;
    setMethodPending(true);
    setPaymentCreateError(null);

    let cancelled = false;
    void fetchPendingRemotePaymentForBill(branchId, orderId)
      .then((result) => {
        if (cancelled) return;
        if (result.success && result.data) {
          setPendingExtras({
            payment_id: result.data.payment_id,
            provider_ref: result.data.provider_ref,
            qr_data: result.data.qr_data,
            redirect_url: result.data.redirect_url,
            qr_info: result.data.qr_info,
          });
          if (!result.data.qr_data && !result.data.redirect_url) {
            setPaymentCreateError(REMOTE_PAYMENT_COPY.qrUnavailableDescription);
          }
        } else if (!result.success) {
          setPaymentCreateError(
            result.error ?? REMOTE_PAYMENT_COPY.qrUnavailableDescription,
          );
        }
      })
      .finally(() => {
        if (!cancelled) setMethodPending(false);
      });

    return () => {
      cancelled = true;
    };
  }, [branchId, methods, order, orderId, pendingExtras]);

  // Auto-restore the offline-blocked method when the network comes back.
  // Re-uses handleSelectMethod so the offline guard is the single
  // enforcement point (regression PWA-OFFLINE-GATE-CASH-ONLY): if isOnline
  // flipped back to false in the same tick, the call short-circuits and
  // pending stays set.
  useEffect(() => {
    if (pendingOfflineMethod === null) return;
    if (!isOnline) return;
    handleSelectMethod(pendingOfflineMethod);
  }, [isOnline, pendingOfflineMethod, handleSelectMethod]);

  // Auto-refresh QR when order total changes while VietQR is selected
  useEffect(() => {
    if (orderId === null || !order) return;
    if (selectedMethod !== "vietqr" || !isOnline) return;
    if (
      order.payment_status === "paid" ||
      order.status === "completed" ||
      order.status === "cancelled"
    ) {
      return;
    }
    if (
      pendingExtras?.qr_info?.amount != null &&
      Number(pendingExtras.qr_info.amount) !== Number(order.total_amount)
    ) {
      handleSelectMethod("vietqr");
    }
  }, [
    orderId,
    order,
    selectedMethod,
    isOnline,
    pendingExtras?.qr_info?.amount,
    handleSelectMethod,
  ]);

  const handleConfirmPaid = useCallback(async () => {
    if (!order || orderId === null || !canConfirmPaid) return;

    startActionTransition(async () => {
      if (isDeliveryOrder) {
        const result = await confirmPlatformPaymentWithInvoice(branchId, orderId);
        if (!result.success) {
          toast.error(
            result.error ?? messages.pos.payment.platformConfirmFailed,
          );
          if (isAmountMismatchError(result.error)) {
            await onOrderUpdated?.();
          }
          return;
        }
        const inv = result.data?.invoice ?? null;
        const printWarning = result.data?.print_warning;
        const successTitle =
          inv?.status === "queued"
            ? messages.pos.payment.platformConfirmSuccessInvoice
            : messages.pos.payment.platformConfirmSuccess;
        if (printWarning) {
          toast.warning(`${successTitle} — không in được hóa đơn`, {
            description: printWarning,
            duration: 8000,
          });
        } else {
          toast.success(successTitle);
        }
        await onOrderUpdated?.();
        onClose();
        return;
      }

      if (selectedMethod === "cash") {
        const result = await confirmCashPaymentWithInvoice(
          branchId,
          orderId,
          cashReceived,
        );
          if (!result.success) {
            toast.error(result.error ?? "Không thể xác nhận thanh toán");
            // Stale total: re-pull the order so the cashier sees the new
            // amount and can re-confirm in one tap. Keep the sheet open.
            if (isAmountMismatchError(result.error)) {
              await onOrderUpdated?.();
            }
            return;
          }
          const change = result.data?.cash_change ?? 0;
          const inv = result.data?.invoice ?? null;
          const printWarning = result.data?.print_warning;
          const invoiceQueued = inv?.status === "queued";
          const invoiceNeedsReconcile = inv?.status === "reconcile_required";
          const successTitle =
            inv == null
              ? "Đã thanh toán"
              : invoiceQueued
                ? "Đã thu tiền — HĐĐT đang xử lý"
                : "Đã thu tiền — HĐĐT cần đối soát";
          const successDescription =
            inv == null
              ? `Tiền trả khách: ${formatVND(change)}`
              : invoiceQueued
                ? `Tiền trả khách: ${formatVND(change)} · Bộ phận tài chính sẽ đối soát nếu cần.`
                : invoiceNeedsReconcile
                  ? "HĐĐT đã được chuyển sang bộ phận tài chính để đối soát với Viettel."
                  : "HĐĐT đang chờ bộ phận tài chính kiểm tra.";
          // Receipt enqueue is fail-soft inside confirm_cash_payment. With a
          // 1-slot toaster a separate print warning would evict the success
          // toast, so fold the printer error into one warning that supersedes
          // and stays longer; otherwise keep the plain success/warning toast.
          if (printWarning) {
            toast.warning(`${successTitle} — không in được hóa đơn`, {
              description: `${successDescription} · ${printWarning} — bấm "in lại" sau khi sửa máy in.`,
              duration: 8000,
            });
          } else if (invoiceNeedsReconcile) {
            toast.warning(successTitle, { description: successDescription });
          } else {
            toast.success(successTitle, { description: successDescription });
          }
          await onOrderUpdated?.();
          onClose();
          return;
        }
      });
    },
    [
      branchId,
      cashReceived,
      isDeliveryOrder,
      isOnline,
      onClose,
      onOrderUpdated,
      order,
      orderId,
      selectedMethod,
      totalAmount,
    ],
  );

  const handleWaitingForVietQrClose = useCallback(() => {
    toast.info(messages.pos.payment.paymentReconcileToast);
    void onOrderUpdated?.();
    onClose();
  }, [onClose, onOrderUpdated]);

  useEffect(() => {
    if (orderId === null || !order || order.payment_status === "paid") return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "F9") {
        e.preventDefault();
        if (isOnline && !actionPending) {
          if (selectedMethod !== "cash") setSelectedMethod("cash");
          setCashInput(String(totalAmount));
        }
      } else if (
        e.key === "Enter" &&
        selectedMethod === "cash" &&
        canConfirmPaid &&
        !actionPending
      ) {
        e.preventDefault();
        void handleConfirmPaid();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    orderId,
    order,
    canConfirmPaid,
    isOnline,
    actionPending,
    selectedMethod,
    totalAmount,
    handleConfirmPaid,
  ]);

  const handleCancelPendingPayment = useCallback(async () => {
    const paymentId = pendingExtras?.payment_id;
    if (!paymentId && !selfOrderPaymentRequestId) return;

    if (selfOrderPaymentRequestId) {
      const confirmed = await confirm({
        title: SELF_ORDER_VI.staffCancelPaymentTitle,
        description: SELF_ORDER_VI.staffCancelPaymentDescription,
        confirmText: SELF_ORDER_VI.staffCancelPayment,
        cancelText: "Đóng",
        variant: "destructive",
      });
      if (!confirmed) return;
    }

    startActionTransition(async () => {
      if (selfOrderPaymentRequestId) {
        const result = await cancelSelfOrderPaymentRequest({
          requestId: selfOrderPaymentRequestId,
          reason: "staff_cancelled_from_bill",
        });
        if (!result.success) {
          toast.error(result.error ?? "Không thể hủy yêu cầu thanh toán");
          return;
        }
        if (result.data?.paymentCompleted) {
          toast.warning(SELF_ORDER_VI.paymentCompletedBlocked);
          await onOrderUpdated?.();
          return;
        }
      } else if (paymentId) {
        const result = await cancelPendingPayment(branchId, paymentId);
        if (!result.success) {
          toast.error(result.error ?? messages.pos.payment.cancelPendingFailed);
          return;
        }
      }

      setPendingExtras(null);
      setPaymentCreateError(null);
      setOrder((current) =>
        current
          ? { ...current, payment_method: null, payment_status: "unpaid" }
          : current,
      );
      if (methods.includes("cash")) setSelectedMethod("cash");
      toast.success(messages.pos.payment.pendingCancelled);
      await onOrderUpdated?.();
    });
  }, [
    branchId,
    methods,
    onOrderUpdated,
    orderId,
    pendingExtras?.payment_id,
    selfOrderPaymentRequestId,
  ]);

  const handlePrintProvisional = useCallback(() => {
    if (orderId === null) return;
    startPrintTransition(async () => {
      const result = await printProvisionalBill(orderId);
      refetchOrderRef.current();
      if (result.success) {
        if (result.data?.agent_offline) {
          toast.warning(
            "Máy in đang mất kết nối — phiếu tạm tính sẽ in khi kết nối lại",
          );
        }
      } else {
        toast.error(result.error ?? "Không thể in phiếu tạm tính");
      }
    });
  }, [orderId]);

  // Reprint the receipt for a paid/cancelled order. Reuses printPending
  // state — the two actions never run together (provisional print is for
  // unpaid orders only; reprint is for read-only orders only).
  const handleReprintReceipt = useCallback(() => {
    if (orderId === null) return;
    startPrintTransition(async () => {
      const result = await printReceipt(orderId);
      if (result.success) {
        if (result.data?.agent_offline) {
          toast.warning("Máy in đang mất kết nối — hóa đơn sẽ in khi kết nối lại");
        }
      } else {
        toast.error(result.error ?? "Không thể in hóa đơn");
      }
    });
  }, [orderId]);

  const handleConvertCashToVietQr = useCallback(() => {
    if (orderId === null || !order) return;
    // Confirm must stay outside useTransition. ConfirmDialogProvider setState
    // in the same transition as printPending never paints, so the button
    // spins and the dialog never appears.
    void (async () => {
      const confirmed = await confirmConvertCashToVietQr({
        orderNumber: order.order_number,
        amount: Number(order.total_amount),
      });
      if (!confirmed) return;
      startPrintTransition(async () => {
        const result = await convertCashToVietQrAndPrint(branchId, orderId);
        if (result.type === "warning") toast.warning(result.message);
        else if (result.type === "error") toast.error(result.message);
        refetchOrderRef.current();
        await onOrderUpdated?.();
      });
    })();
  }, [branchId, onOrderUpdated, order, orderId]);

  const handlePrintVietQr = useCallback(() => {
    if (orderId === null) return;
    startPrintTransition(async () => {
      const result = await printPaidVietQr(orderId);
      if (result.type === "warning") toast.warning(result.message);
      else if (result.type === "error") toast.error(result.message);
    });
  }, [orderId]);

  const MethodIcon = METHOD_META[selectedMethod]?.icon ?? IconCreditCard;
  const isReceiptIntent = intent === "receipt";
  const isReadOnlyOrder =
    isReceiptIntent ||
    order?.payment_status === "paid" ||
    order?.status === "completed" ||
    order?.status === "cancelled";
  const canConvertCashToVietQr =
    order != null &&
    canConvertPosCashToVietQr({
      status: order.status,
      paymentStatus: order.payment_status,
      paymentMethod: order.payment_method,
      canConfirmCash,
      vietQrEnabled: methods.includes("vietqr"),
    });
  const showVietQrPrint =
    order != null &&
    canPrintPosVietQrPayment({
      status: order.status,
      paymentStatus: order.payment_status,
      paymentMethod: order.payment_method,
    });
  const dialogTitleLabel =
    isReceiptIntent || isReadOnlyOrder ? "Hóa đơn" : "Thanh toán";
  // Header preview: the full `order` wins when present; otherwise use the
  // SessionOrder seed for non-detail paths (F9 / list / picker / post-submit
  // toast). Lets the cashier confirm the right order the moment the dialog
  // opens, while the fetch runs in the background.
  const dialogTitleHeader =
    order ?? (initialHeaderSeed?.id === orderId ? initialHeaderSeed : null);
  const dialogTitle = dialogTitleHeader ? (
    <span className="flex min-w-0 flex-col gap-1">
      <span className="flex items-baseline justify-between gap-3">
        <span>{dialogTitleLabel}</span>
        <span className="shrink-0 font-mono text-lg font-bold tabular-nums tracking-tight">
          {formatVND(Number(dialogTitleHeader.total_amount))}
        </span>
      </span>
      <span className="truncate text-sm font-normal text-muted-foreground">
        #{dialogTitleHeader.order_number}
      </span>
    </span>
  ) : (
    dialogTitleLabel
  );
  const dialogDescription =
    isReceiptIntent || isReadOnlyOrder
      ? "Hóa đơn đã xử lý."
      : messages.pos.payment.stepDescription;
  const remoteQrValue =
    selectedMethod === "cash"
      ? undefined
      : (pendingExtras?.qr_data ?? pendingExtras?.redirect_url);
  const remotePaymentNeedsRetry =
    selectedMethod !== "cash" &&
    !methodPending &&
    !remoteQrValue &&
    (paymentCreateError !== null || pendingExtras !== null);
  const remotePaymentError =
    paymentCreateError ?? REMOTE_PAYMENT_COPY.qrUnavailableDescription;
  const isWaitingForVietQr =
    selectedMethod === "vietqr" && pendingExtras?.payment_id != null;
  const hasPaymentBreakdown =
    order != null &&
    (Number(order.service_charge) > 0 ||
      Number(order.discount_amount) > 0 ||
      Number(order.order_discount_amount) > 0 ||
      Number(order.item_discount_amount) > 0 ||
      Number(order.subtotal) !== Number(order.total_amount));
  const sheetFooter =
    isReadOnlyOrder && order ? (
      <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {canConvertCashToVietQr ? (
          <Button
            type="button"
            variant="outline"
            size="touch"
            data-testid="pos-receipt-convert-vietqr"
            onClick={handleConvertCashToVietQr}
            disabled={printPending}
          >
            {printPending ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <IconQrcode data-icon="inline-start" />
            )}
            {messages.pos.archivedOrders.convertCashToVietQr}
          </Button>
        ) : null}
        <Button
          type="button"
          variant="outline"
          size="touch"
          onClick={
            showVietQrPrint ? handlePrintVietQr : handleReprintReceipt
          }
          disabled={printPending}
        >
          {printPending ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <IconPrinter data-icon="inline-start" />
          )}
          {showVietQrPrint
            ? messages.pos.archivedOrders.printVietQr
            : messages.pos.payment.reprint}
        </Button>
        <Button type="button" size="touch-lg" onClick={onClose}>
          {ACTIONS_VI.close}
        </Button>
      </div>
    ) : order && !error && !isReceiptIntent ? (
      <div className="flex w-full flex-col gap-2">
        <div className="flex gap-2">
          {canPrintProvisional && !isDeliveryOrder ? (
            <Button
              type="button"
              variant="outline"
              size="touch"
              className="flex-1"
              onClick={() => void handlePrintProvisional()}
              disabled={
                isPending || methodPending || actionPending || printPending
              }
            >
              {printPending ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <IconReceipt data-icon="inline-start" />
              )}
              {messages.pos.payment.printProvisional}
            </Button>
          ) : null}
          {!isWaitingForVietQr ? (
            <Button
              type="button"
              variant="outline"
              size="touch"
              className="flex-1"
              onClick={onClose}
              disabled={actionPending}
            >
              {ACTIONS_VI.cancel}
            </Button>
          ) : null}
        </div>
        {selectedMethod === "cash" &&
        !isDeliveryOrder &&
        disabledReason ? (
          <p className="text-sm text-muted-foreground">{disabledReason}</p>
        ) : null}
        {isDeliveryOrder && disabledReason ? (
          <p className="text-sm text-muted-foreground">{disabledReason}</p>
        ) : null}
        {isDeliveryOrder ? (
          <Button
            data-testid="bill-confirm-platform"
            type="button"
            size="touch-lg"
            className="w-full"
            onClick={() => void handleConfirmPaid()}
            disabled={
              isPending || methodPending || actionPending || !canConfirmPaid
            }
            title={disabledReason ?? undefined}
          >
            {actionPending ? <Spinner data-icon="inline-start" /> : null}
            {messages.pos.payment.platformPrepaid}
          </Button>
        ) : selectedMethod === "cash" ? (
          <Button
            data-testid="bill-confirm-cash"
            type="button"
            size="touch-lg"
            className="w-full"
            onClick={() => void handleConfirmPaid()}
            disabled={
              isPending || methodPending || actionPending || !canConfirmPaid
            }
            title={disabledReason ?? undefined}
          >
            {actionPending ? <Spinner data-icon="inline-start" /> : null}
            {messages.pos.payment.paidConfirm}
            <Kbd className="hidden [@media(hover:hover)]:inline-flex border-current/20 bg-current/10 text-inherit text-3xs ml-2">
              Enter
            </Kbd>
          </Button>
        ) : isWaitingForVietQr ? (
          <Button
            type="button"
            size="touch-lg"
            className="w-full"
            onClick={handleWaitingForVietQrClose}
            disabled={actionPending}
          >
            {SELF_ORDER_VI.paymentReconcileAction}
          </Button>
        ) : null}
      </div>
    ) : null;

  return (
    <StationSheet
      open={orderId !== null}
      onOpenChange={handleOpenChange}
      title={dialogTitle}
      description={<span className="sr-only">{dialogDescription}</span>}
      side="bottom"
      size="lg"
      footer={sheetFooter}
    >
      {!order && !error ? (
        isReceiptIntent ? (
          <AppBoneyardSkeleton
            name="pos-bill-receipt-view"
            loading
            fixture={<ReceiptLoadingFixture />}
            fallback={
              <div className="flex min-h-20 items-center justify-center">
                <Spinner />
              </div>
            }
            snapshotConfig={{ excludeSelectors: ["svg"] }}
          >
            <ReceiptLoadingFixture />
          </AppBoneyardSkeleton>
        ) : (
          <AppBoneyardSkeleton
            name="pos-bill-receipt-payment"
            loading
            fixture={<PaymentLoadingFixture />}
            fallback={<PaymentPendingPreview />}
            snapshotConfig={{ excludeSelectors: ["svg"] }}
          >
            <PaymentLoadingFixture />
          </AppBoneyardSkeleton>
        )
      ) : error ? (
        <p className="text-base text-destructive">{error}</p>
      ) : isReadOnlyOrder && order ? (
        <div className="flex flex-col gap-3 pb-2">
          <BillReceiptSummary order={order} />
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-4">
            <StationSection
              title={messages.pos.payment.stepTitle}
              icon={<IconCreditCard />}
              size="sm"
              contentClassName="gap-3"
            >
              <>
                {selfOrderPaymentRequestId ? (
                  <Alert>
                    <IconAlertTriangle />
                    <AlertTitle>
                      {SELF_ORDER_VI.staffPaymentWaitingTitle}
                    </AlertTitle>
                    <AlertDescription>
                      {SELF_ORDER_VI.staffPaymentWaitingDescription}
                    </AlertDescription>
                    <div className="col-start-2 mt-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="touch"
                        className="w-full sm:w-auto"
                        onClick={() => void handleCancelPendingPayment()}
                        disabled={actionPending || methodPending}
                      >
                        {SELF_ORDER_VI.staffCancelPayment}
                      </Button>
                    </div>
                  </Alert>
                ) : null}
                {isDeliveryOrder ? (
                  <div className="flex flex-col gap-3 rounded-md bg-muted/30 p-4">
                    <div className="flex items-center gap-2">
                      {order?.delivery_platform ? (
                        <DeliveryPlatformMark
                          platform={order.delivery_platform}
                          className="size-6"
                        />
                      ) : null}
                      <span className="text-base font-semibold text-foreground">
                        {messages.pos.payment.platformPrepaid}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {messages.pos.payment.platformPrepaidHint}
                    </p>
                  </div>
                ) : (
                  <>
                    <div
                      className="grid grid-cols-2 gap-2"
                      role="group"
                      aria-label={messages.pos.payment.methodsTitle}
                    >
                      {methods.map((method) => {
                        const meta = METHOD_META[method] ?? {
                          label: method,
                          icon: IconCreditCard,
                        };
                        const Icon = meta.icon;
                        const isSelected = selectedMethod === method;
                        return (
                          <Button
                            key={method}
                            data-testid={`bill-pay-${method}`}
                            type="button"
                            variant="outline"
                            size="touch-lg"
                            aria-pressed={isSelected}
                            className={cn(
                              "flex-col gap-2",
                              isSelected &&
                                "border-foreground bg-muted text-foreground hover:bg-muted",
                            )}
                            onClick={() => handleSelectMethod(method)}
                            disabled={actionPending || methodPending}
                          >
                            <Icon data-icon="inline-start" />
                            {meta.label}
                          </Button>
                        );
                      })}
                    </div>

                    {pendingOfflineMethod !== null && (
                      <p className="text-sm text-muted-foreground">
                        {messages.pos.payment.offlineWillSelect}{" "}
                        <span className="font-medium text-foreground">
                          {METHOD_META[pendingOfflineMethod].label}
                        </span>{" "}
                        {messages.pos.payment.offlineWhenOnline}
                      </p>
                    )}

                    {selectedMethod === "cash" ? (
                      <div className="flex flex-col gap-3 rounded-md bg-muted/30 p-3">
                        {order && hasPaymentBreakdown ? (
                          <OrderTotalsSummary
                            variant="compact"
                            subtotal={order.subtotal}
                            serviceCharge={order.service_charge}
                            discountAmount={order.discount_amount}
                            orderDiscountAmount={order.order_discount_amount}
                            itemDiscountAmount={order.item_discount_amount}
                            discountType={order.discount_type}
                            discountValue={order.discount_value}
                            discountNote={order.discount_note}
                            totalAmount={order.total_amount}
                          />
                        ) : null}

                        <InputGroup className="h-10">
                          <InputGroupAddon>
                            {messages.pos.payment.cashReceived}
                          </InputGroupAddon>
                          <WholeVndInput
                            id="cash-received"
                            data-testid="bill-cash-received"
                            data-slot="input-group-control"
                            value={cashInput}
                            onValueChange={setCashInput}
                            onFocus={(event) => event.currentTarget.select()}
                            disabled={actionPending}
                            className="text-right text-lg font-mono font-semibold tabular-nums"
                          />
                        </InputGroup>

                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant={cashReceived === totalAmount ? "default" : "outline"}
                            size="touch"
                            className={cn(
                              "min-w-32 flex-1 font-semibold",
                              cashReceived === totalAmount
                                ? "bg-primary text-primary-foreground"
                                : "border-primary/20 text-primary hover:bg-primary/10",
                            )}
                            onClick={() => setCashInput(String(totalAmount))}
                            disabled={actionPending}
                          >
                            <span className="min-w-0 truncate">
                              {messages.pos.payment.exactCash(formatVND(totalAmount))}
                            </span>
                            <Kbd className="ml-1 hidden shrink-0 [@media(hover:hover)]:inline-flex border-current/20 bg-current/10 text-inherit text-3xs">
                              F9
                            </Kbd>
                          </Button>
                          {cashSuggestions
                            .filter((amount) => amount !== totalAmount)
                            .map((amount) => (
                              <Button
                                key={amount}
                                type="button"
                                variant="outline"
                                size="touch"
                                className="min-w-28 flex-1"
                                onClick={() => setCashInput(String(amount))}
                                disabled={actionPending}
                              >
                                {formatVND(amount)}
                              </Button>
                            ))}
                        </div>

                        <div className="flex items-center justify-between gap-3 rounded-md bg-muted/50 p-3">
                          <span className="text-sm font-medium">
                            {messages.pos.payment.cashChange}
                          </span>
                          <span
                            className={
                              cashReceived < totalAmount
                                ? "text-lg font-mono font-bold tabular-nums text-destructive"
                                : "text-lg font-mono font-bold tabular-nums"
                            }
                          >
                            {cashReceived < totalAmount
                              ? messages.pos.payment.cashShort(
                                  formatVND(totalAmount - cashReceived),
                                )
                              : formatVND(cashChange)}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-3 rounded-md bg-muted/30 p-3">
                        {methodPending ? (
                          <AppBoneyardSkeleton
                            name="pos-bill-receipt-qr"
                            loading
                            fixture={<PaymentQrLoadingFixture />}
                            fallback={<PaymentQrPendingPreview />}
                            snapshotConfig={{ excludeSelectors: ["svg"] }}
                          >
                            <PaymentQrLoadingFixture />
                          </AppBoneyardSkeleton>
                        ) : (
                          <>
                            {remoteQrValue ? (
                              <PaymentQrCode
                                value={remoteQrValue}
                                className="max-h-40 max-w-40"
                                alt={`QR ${
                                  METHOD_META[selectedMethod]?.label ??
                                  REMOTE_PAYMENT_COPY.qrAltFallback
                                }`}
                              />
                            ) : (
                              <div className="flex flex-col items-center gap-3">
                                <PaymentQrPlaceholder Icon={MethodIcon} />
                                {remotePaymentNeedsRetry ? null : (
                                  <Button
                                    type="button"
                                    size="touch"
                                    onClick={() =>
                                      handleSelectMethod(selectedMethod)
                                    }
                                    disabled={actionPending || methodPending}
                                  >
                                    <IconQrcode data-icon="inline-start" />
                                    {REMOTE_PAYMENT_COPY.createQr}
                                  </Button>
                                )}
                              </div>
                            )}
                            {remotePaymentNeedsRetry ? (
                              <Alert variant="destructive">
                                <IconAlertTriangle />
                                <AlertTitle>
                                  {REMOTE_PAYMENT_COPY.qrCreateFailedTitle}
                                </AlertTitle>
                                <AlertDescription>
                                  {remotePaymentError}
                                </AlertDescription>
                                <div className="col-start-2 mt-2">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    disabled={actionPending || methodPending}
                                    size="touch"
                                    className="w-full sm:w-auto"
                                    onClick={() =>
                                      handleSelectMethod(selectedMethod)
                                    }
                                  >
                                    <IconQrcode data-icon="inline-start" />
                                    {REMOTE_PAYMENT_COPY.retryCreate}
                                  </Button>
                                </div>
                              </Alert>
                            ) : null}
                            <RemotePaymentDetails
                              pendingExtras={pendingExtras}
                              isCreating={methodPending}
                            />
                            {pendingExtras?.payment_id &&
                            !selfOrderPaymentRequestId ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="touch"
                                className="self-start text-destructive hover:bg-destructive/10 hover:text-destructive"
                                onClick={() => void handleCancelPendingPayment()}
                                disabled={actionPending || methodPending}
                                title={messages.pos.payment.cancelPendingTitle}
                              >
                                <IconAlertTriangle data-icon="inline-start" />
                                {messages.pos.payment.cancelPending}
                              </Button>
                            ) : null}
                          </>
                        )}
                      </div>
                    )}
                  </>
                )}
              </>
            </StationSection>
          </div>
        </>
      )}
    </StationSheet>
  );
}
