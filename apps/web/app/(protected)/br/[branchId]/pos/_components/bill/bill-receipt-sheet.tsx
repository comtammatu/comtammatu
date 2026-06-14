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
import {
  buildVietQrEmvco,
  type PaymentMethod,
} from "@comtammatu/shared/providers";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@comtammatu/ui/components/alert";
import { Button } from "@comtammatu/ui/components/button";
import { Card, CardContent } from "@comtammatu/ui/components/card";
import { confirm } from "@comtammatu/ui/components/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@comtammatu/ui/components/dialog";
import { Input } from "@comtammatu/ui/components/input";
import { ScrollArea } from "@comtammatu/ui/components/scroll-area";
import { Skeleton } from "@comtammatu/ui/components/skeleton";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { toast } from "@comtammatu/ui/components/sonner";
import {
  TriangleAlert as IconAlertTriangle,
  Banknote as IconCash,
  CreditCard as IconCreditCard,
  Printer as IconPrinter,
  QrCode as IconQrcode,
  Receipt as IconReceipt,
  X as IconXCircle,
  Wallet as IconWallet,
} from "lucide-react";
import { AppBoneyardSkeleton } from "@/_components/boneyard-skeleton";
import { FormattedNumberInput } from "@/components/form";
import { messages } from "@lib/messages";
import { fetchOrderForBill } from "../../actions";
import type { SessionOrder } from "../../order-history";
import {
  cancelPendingPayment,
  confirmCashPaymentWithInvoice,
  confirmVietQrPaymentWithInvoice,
  createPayment,
  fetchPendingRemotePaymentForBill,
  type VietQrConfig,
} from "../../payment-actions";
import { printProvisionalBill, printReceipt } from "../../print-actions";
import { useIsOnline } from "../pwa/online-status-provider";
import { BillReceiptSummary } from "./bill-receipt-summary";
import { OrderTotalsSummary } from "../order-totals-summary";
import type {
  BillReceiptIntent,
  OrderData,
  PendingExtras,
} from "./bill-receipt-types";
import {
  buildInvoicePayload,
  EMPTY_INVOICE_FORM,
  InvoiceFormSection,
  isInvoiceFormValid,
  type InvoiceFormState,
} from "./invoice-form-section";
import { PaymentQrCode } from "./payment-qr-code";

import { ACTIONS_VI } from "@comtammatu/shared/messages";
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
   * `pos:confirm_payment`: only cashier+ can confirm cash. QR/MoMo stay visible
   * for POS users because e-wallet settlement is not physical cash handling.
   */
  canConfirmCash: boolean;
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
  momo: { label: PAYMENT_METHOD_LABELS_VI.momo, icon: IconWallet },
};

const REMOTE_PAYMENT_COPY = {
  momoWalletLabel: "Ví:",
  momoWalletValue: "MoMo",
  momoOrderLabel: "Mã đơn MoMo:",
  momoStatusLabel: "Trạng thái:",
  momoPendingStatus: "Chờ MoMo xác nhận tự động",
  accountLabel: "STK:",
  descriptionLabel: "Nội dung:",
  creating: "Đang tạo",
  unavailable: "Chưa có",
  qrCreateFailedTitle: "Không tạo được QR",
  qrUnavailableDescription:
    "Phiên thanh toán đang chờ nhưng thiếu dữ liệu QR. Tạo lại QR để lấy mã mới.",
  retryCreate: "Tạo lại QR",
  qrAltFallback: "thanh toán",
} as const;

const VND_DENOMINATIONS = [
  500_000, 200_000, 100_000, 50_000, 20_000, 10_000, 5_000, 2_000, 1_000, 500,
] as const;

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

function PaymentQrPlaceholder({
  Icon,
}: {
  Icon: ComponentType<{ className?: string }>;
}) {
  return (
    <Card className="mx-auto size-48 bg-muted/40 py-0">
      <CardContent flush className="flex h-full items-center justify-center">
        <Icon className="size-10 text-muted-foreground" />
      </CardContent>
    </Card>
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
  customer_count: 2,
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
    name: "Chi nhánh Đất Đỏ",
    address: "Ấp Phước Sơn, Xã Đất Đỏ",
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
  return (
    <ScrollArea className="max-h-96">
      <BillReceiptSummary order={RECEIPT_LOADING_ORDER} />
    </ScrollArea>
  );
}

function RemotePaymentDetails({
  method,
  pendingExtras,
  order,
  isCreating,
}: {
  method: PaymentMethod;
  pendingExtras: PendingExtras | null;
  order: OrderData | null;
  isCreating: boolean;
}) {
  if (method === "momo") {
    return (
      <div className="space-y-3">
        <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
          <dt className="text-muted-foreground">
            {REMOTE_PAYMENT_COPY.momoWalletLabel}
          </dt>
          <dd className="font-medium">{REMOTE_PAYMENT_COPY.momoWalletValue}</dd>
          <dt className="text-muted-foreground">
            {REMOTE_PAYMENT_COPY.momoOrderLabel}
          </dt>
          <dd className="break-all font-mono">
            {pendingExtras?.provider_ref ??
              (isCreating
                ? REMOTE_PAYMENT_COPY.creating
                : REMOTE_PAYMENT_COPY.unavailable)}
          </dd>
          <dt className="text-muted-foreground">
            {REMOTE_PAYMENT_COPY.momoStatusLabel}
          </dt>
          <dd>{REMOTE_PAYMENT_COPY.momoPendingStatus}</dd>
        </dl>
      </div>
    );
  }

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
          `DH ${order?.order_number ?? ""}`}
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
  initialPaymentMethods,
  initialVietQrConfig,
  initialHeaderSeed,
  onOrderUpdated,
  onClose,
}: BillReceiptProps) {
  const [order, setOrder] = useState<OrderData | null>(null);
  // Methods + VietQR config are tenant-stable for the entire shift; seeded
  // from RSC props so opening the bill no longer waits on 2 settings round-
  // trips. Admin saves trigger `revalidatePath('/br/[branchId]/pos', 'page')`
  // so a config change refreshes the seed on next navigation.
  const methods = useMemo<PaymentMethod[]>(
    () =>
      initialPaymentMethods.filter(
        (method) => method !== "cash" || canConfirmCash,
      ),
    [initialPaymentMethods, canConfirmCash],
  );
  const vietQrConfig: VietQrConfig | null = initialVietQrConfig;
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
  const [methodPending, setMethodPending] = useState(false);
  const [printPending, startPrintTransition] = useTransition();
  const [cancelPending, startCancelTransition] = useTransition();
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
  // Tracks orderId we've already auto-fired QR createPayment for, so the
  // auto-trigger fires once per dialog open even when render deps churn.
  const autoQrTriggeredRef = useRef<number | null>(null);
  const hydratedPaymentOrderRef = useRef<number | null>(null);
  // Tracks orderId we've already defaulted selectedMethod for. Without this,
  // any dep churn (router.refresh from realtime / visibilitychange / phone
  // rotate flipping useIsMobile → RSC re-render → new initialPaymentMethods
  // array ref) re-runs the bill-open effect and clobbers the cashier's
  // VietQR pick back to cash. Reset on orderId=null in the close branch.
  const methodDefaultedOrderRef = useRef<number | null>(null);

  const totalAmount = Number(order?.total_amount ?? 0);
  const cashReceived = Number(cashInput) || 0;
  const cashChange = cashReceived - totalAmount;
  const invoiceValid = isInvoiceFormValid(invoiceForm);
  // Offline guard: cash RPC + e-wallet confirm both touch the network. Cash is
  // the most dangerous (physical money already in hand if cashier presses
  // confirm and request fails) — see regression HDDT-PAYMENT-FIRST-FAILSOFT-ORPHAN.
  const canConfirmPaid =
    isOnline &&
    invoiceValid &&
    (selectedMethod === "cash"
      ? cashReceived >= totalAmount
      : selectedMethod === "vietqr"
        ? Boolean(vietQrConfig)
        : false); // MoMo: confirmed via IPN webhook, not cashier action

  // Tooltip explaining why the button is disabled — a dimmed button must
  // tell the cashier what is missing (offline, bad tax code, not enough
  // cash, QR not created). Native `title=` is enough; no Tooltip component.
  const disabledReason = canConfirmPaid
    ? null
    : !isOnline
      ? "Mất kết nối — không thể thanh toán khi offline"
      : !invoiceValid
        ? "Cần điền đủ MST và tên khách trước khi xuất hoá đơn"
        : selectedMethod === "cash"
          ? "Khách chưa thanh toán đủ tổng đơn"
          : selectedMethod === "momo"
            ? "MoMo tự xác nhận qua IPN sau khi khách thanh toán"
            : selectedMethod === "vietqr"
              ? "VietQR chưa cấu hình — liên hệ quản lý"
              : null;

  const cashSuggestions = useMemo(
    () => buildCashSuggestions(totalAmount),
    [totalAmount],
  );
  const orderIdRef = useRef(orderId);
  useEffect(() => {
    orderIdRef.current = orderId;
  }, [orderId]);

  useEffect(() => {
    if (orderId === null) {
      setOrder(null);
      setError(null);
      setSelectedMethod(canConfirmCash ? "cash" : "vietqr");
      setCashInput("");
      setPendingExtras(null);
      setMethodPending(false);
      setPaymentCreateError(null);
      setInvoiceForm(EMPTY_INVOICE_FORM);
      setPendingOfflineMethod(null);
      autoQrTriggeredRef.current = null;
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
        setOrder(nextOrder);
        setError(null);
        setCashInput(String(Math.round(Number(nextOrder.total_amount))));
      } else {
        setError(orderResult.error ?? "Không thể tải đơn hàng");
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
  //     (covers MoMo / VietQR webhook callbacks confirming a pending
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
      setOrder(result.data as OrderData);
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
          () => {
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

      setSelectedMethod(method);
      setPaymentCreateError(null);
      setPendingExtras(null);
      setPendingOfflineMethod(null);

      if (method === "cash") {
        setCashInput(String(Math.round(Number(order.total_amount))));
        return;
      }

      if (method === "vietqr") {
        // QR generated entirely client-side — no DB row created until cashier
        // taps "Đã thanh toán". Offline guard not needed for display; confirm
        // button is gated by isOnline via canConfirmPaid.
        if (!vietQrConfig) {
          setPaymentCreateError("VietQR chưa cấu hình — liên hệ quản lý.");
          return;
        }
        const amount = Math.round(Number(order.total_amount));
        const description = `DH ${order.order_number}`;
        const qrPayload = buildVietQrEmvco({
          bankCode: vietQrConfig.bankCode,
          accountNo: vietQrConfig.accountNo,
          amount,
          description,
          accountName: vietQrConfig.accountName,
        });
        if (!qrPayload) {
          setPaymentCreateError(
            "VietQR cấu hình không hợp lệ — kiểm tra STK và mã ngân hàng.",
          );
          return;
        }
        setPendingExtras({
          qr_data: qrPayload,
          qr_info: {
            account_no: vietQrConfig.accountNo,
            account_name: vietQrConfig.accountName || undefined,
            bank_code: vietQrConfig.bankCode,
            description,
          },
        });
        return;
      }

      // MoMo: needs server call to create pending payment row (IPN webhook
      // relies on the row existing before the customer scans).
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
            method as "momo",
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
    [branchId, isOnline, order, orderId, vietQrConfig],
  );

  useEffect(() => {
    if (orderId === null || !order) return;
    // In the new flow MoMo orders stay 'unpaid' (not 'pending') while the
    // payment row is pending. Guard: skip paid orders and non-MoMo methods.
    // VietQR has no pending DB row — nothing to hydrate.
    if (order.payment_status === "paid") return;
    if (order.payment_method !== "momo") return;
    if (!methods.includes("momo")) return;
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

  // Auto-create the QR payment when the bill dialog opens with a non-cash
  // method pre-selected (waiter case — no `pos:confirm_payment`). Without
  // this, "Chuyển khoản" is highlighted but the QR area sits at "Đang tạo"
  // until the user re-taps the already-selected button. Bypasses for
  // offline (handleSelectMethod offline-restore takes over later), already-
  // issued QR, in-flight QR, and read-only orders.
  useEffect(() => {
    if (orderId === null) return;
    if (!order || methods.length === 0) return;
    if (selectedMethod === "cash") return;
    if (pendingExtras !== null || methodPending) return;
    if (!isOnline) return;
    if (
      order.payment_status === "paid" ||
      order.status === "completed" ||
      order.status === "cancelled"
    ) {
      return;
    }
    if (autoQrTriggeredRef.current === orderId) return;
    autoQrTriggeredRef.current = orderId;
    handleSelectMethod(selectedMethod);
  }, [
    orderId,
    order,
    methods,
    selectedMethod,
    pendingExtras,
    methodPending,
    isOnline,
    handleSelectMethod,
  ]);

  const handleConfirmPaid = useCallback(async () => {
    if (!order || orderId === null || !canConfirmPaid) return;

    // HĐĐT issues realtime the instant payment confirms — there is no post-issue
    // edit, only cancel/replace. Gate the irreversible action behind a summary
    // the cashier verifies with the customer (catches wrong method + premature
    // tap, the two reported error classes).
    const confirmed = await confirm({
      title: messages.pos.payment.confirmIssueTitle,
      details: [
        {
          label: messages.pos.payment.confirmIssueMethod,
          value: PAYMENT_METHOD_LABELS_VI[selectedMethod],
        },
        {
          label: messages.pos.payment.confirmIssueAmount,
          value: formatVND(totalAmount),
        },
      ],
      description: messages.pos.payment.confirmIssueWarning,
      confirmText: messages.pos.payment.confirmIssueConfirm,
      cancelText: messages.pos.payment.confirmIssueCancel,
    });
    if (!confirmed) return;

    // Freeze the invoice payload at click — guards against the cashier
    // editing the form while the submit is in flight.
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
        // Receipt enqueue is fail-soft inside confirm_cash_payment — surface
        // any printer error as a warning so cashier knows to re-print later.
        if (result.data?.print_warning) {
          toast.warning("Không in được hóa đơn", {
            description: `${result.data.print_warning} — bấm "in lại" sau khi sửa máy in.`,
          });
        }
        await onOrderUpdated?.();
        onClose();
        return;
      }

      // VietQR: cashier confirms manually after customer scans and transfers.
      // confirm_vietqr_payment creates the payment row + posts GL atomically.
      const result = await confirmVietQrPaymentWithInvoice(
        branchId,
        orderId,
        totalAmount,
        invoicePayload,
      );
      if (!result.success) {
        toast.error(result.error ?? "Không thể xác nhận thanh toán");
        return;
      }
      const inv = result.data?.invoice ?? null;
      if (inv == null) {
        toast.success("Đã thanh toán");
      } else if (inv.status === "failed") {
        toast.warning("Đã thanh toán — HĐĐT chưa xuất được", {
          description: inv.error ?? "Lưu nháp; Finance sẽ xuất lại sau.",
        });
      } else {
        toast.success("Đã thanh toán & xuất HĐĐT", {
          description: `Số HĐ: ${inv.invoiceNumber ?? `#${inv.invoiceId}`}`,
        });
      }
      if (result.data?.print.failed) {
        toast.warning("Chưa in được hóa đơn", {
          description: result.data.print.error ?? "Mở đơn để in lại.",
        });
      }
      await onOrderUpdated?.();
      onClose();
    });
  }, [
    branchId,
    canConfirmPaid,
    cashReceived,
    invoiceForm,
    onClose,
    onOrderUpdated,
    order,
    orderId,
    selectedMethod,
    totalAmount,
  ]);

  const handlePrintProvisional = useCallback(() => {
    if (orderId === null) return;
    startPrintTransition(async () => {
      const result = await printProvisionalBill(orderId);
      if (result.success) {
        if (result.data?.agent_offline) {
          toast.warning(
            "Máy in đang offline — phiếu tạm tính sẽ in khi kết nối lại",
          );
        } else {
          toast.success("Đã gửi phiếu tạm tính tới máy in");
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
          toast.warning("Máy in đang offline — hóa đơn sẽ in khi kết nối lại");
        } else {
          toast.success("Đã gửi hóa đơn tới máy in");
        }
      } else {
        toast.error(result.error ?? "Không thể in hóa đơn");
      }
    });
  }, [orderId]);

  const handleCancelPayment = useCallback(() => {
    const paymentId = pendingExtras?.payment_id;
    if (!paymentId) return;
    startCancelTransition(async () => {
      const result = await cancelPendingPayment(branchId, paymentId);
      if (result.success) {
        setPendingExtras(null);
        setSelectedMethod(canConfirmCash ? "cash" : "vietqr");
        autoQrTriggeredRef.current = null;
        hydratedPaymentOrderRef.current = null;
        setOrder((cur) =>
          cur
            ? { ...cur, payment_status: "unpaid", payment_method: null }
            : cur,
        );
        toast.success(messages.pos.payment.cancelQrSuccess);
        await onOrderUpdated?.();
      } else {
        toast.error(result.error ?? messages.pos.payment.cancelQrFailed);
      }
    });
  }, [branchId, canConfirmCash, onOrderUpdated, pendingExtras?.payment_id]);

  const MethodIcon = METHOD_META[selectedMethod]?.icon ?? IconCreditCard;
  const isReceiptIntent = intent === "receipt";
  const isReadOnlyOrder =
    order?.payment_status === "paid" ||
    order?.status === "completed" ||
    order?.status === "cancelled";
  const showUnservedWarning =
    order != null && !isReadOnlyOrder && order.status !== "served";
  const dialogTitleLabel =
    isReceiptIntent || isReadOnlyOrder ? "Hóa đơn" : "Thanh toán";
  // Header preview: the full `order` wins when present; otherwise use the
  // SessionOrder seed for non-detail paths (F9 / list / picker / post-submit
  // toast). Lets the cashier confirm the right order the moment the dialog
  // opens, while the fetch runs in the background.
  const dialogTitleHeader =
    order ?? (initialHeaderSeed?.id === orderId ? initialHeaderSeed : null);
  const dialogTitle = dialogTitleHeader
    ? `${dialogTitleLabel} · #${dialogTitleHeader.order_number} · ${formatVND(Number(dialogTitleHeader.total_amount))}`
    : dialogTitleLabel;
  const dialogDescription =
    isReceiptIntent || isReadOnlyOrder
      ? "Hóa đơn đã xử lý."
      : "Chọn phương thức và xác nhận.";
  const remoteQrValue =
    selectedMethod === "cash"
      ? undefined
      : selectedMethod === "momo"
        ? pendingExtras?.qr_data
        : (pendingExtras?.qr_data ?? pendingExtras?.redirect_url);
  const remotePaymentNeedsRetry =
    selectedMethod !== "cash" &&
    !methodPending &&
    !remoteQrValue &&
    (paymentCreateError !== null || pendingExtras !== null);
  const remotePaymentError =
    paymentCreateError ?? REMOTE_PAYMENT_COPY.qrUnavailableDescription;

  return (
    <Dialog open={orderId !== null} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
          <DialogDescription className="sr-only">
            {dialogDescription}
          </DialogDescription>
        </DialogHeader>

        {!order && !error ? (
          isReceiptIntent ? (
            <AppBoneyardSkeleton
              name="pos-bill-receipt-view"
              loading
              fixture={<ReceiptLoadingFixture />}
              fallback={
                <div className="flex items-center justify-center py-10">
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
              fallback={<PaymentSkeleton />}
              snapshotConfig={{ excludeSelectors: ["svg"] }}
            >
              <PaymentLoadingFixture />
            </AppBoneyardSkeleton>
          )
        ) : error ? (
          <p className="text-base text-destructive">{error}</p>
        ) : isReadOnlyOrder && order ? (
          <div className="flex flex-col gap-3">
            <ScrollArea className="max-h-96">
              <BillReceiptSummary order={order} />
            </ScrollArea>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={handleReprintReceipt}
                disabled={printPending}
              >
                {printPending ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <IconPrinter data-icon="inline-start" />
                )}
                {messages.pos.payment.reprint}
              </Button>
              <Button type="button" onClick={onClose}>
                {ACTIONS_VI.close}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-4">
              {showUnservedWarning ? (
                <Alert className="border-warning/20 bg-warning/10 text-warning">
                  <IconAlertTriangle />
                  <AlertTitle>{messages.pos.payment.unservedTitle}</AlertTitle>
                  <AlertDescription>
                    {messages.pos.payment.unservedDescription}
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
                <Card size="sm">
                  <CardContent className="flex flex-col gap-4">
                    {order && (
                      <OrderTotalsSummary
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
                    )}

                    <div className="relative">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">
                        {messages.pos.payment.cashReceived}
                      </span>
                      <FormattedNumberInput
                        id="cash-received"
                        data-testid="bill-cash-received"
                        maxFractionDigits={0}
                        value={cashInput}
                        onValueChange={setCashInput}
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
                        {messages.pos.payment.cashChange}
                      </span>
                      <span className="text-lg font-bold tabular-nums">
                        {cashReceived < totalAmount
                          ? messages.pos.payment.cashShort(
                              formatVND(totalAmount - cashReceived),
                            )
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
                    {order && (
                      <OrderTotalsSummary
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
                    )}

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
                        {remoteQrValue ? (
                          <PaymentQrCode
                            value={remoteQrValue}
                            alt={`QR ${
                              METHOD_META[selectedMethod]?.label ??
                              REMOTE_PAYMENT_COPY.qrAltFallback
                            }`}
                          />
                        ) : (
                          <PaymentQrPlaceholder Icon={MethodIcon} />
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
                                size="sm"
                                onClick={() =>
                                  handleSelectMethod(selectedMethod)
                                }
                                disabled={actionPending || methodPending}
                              >
                                <IconQrcode data-icon="inline-start" />
                                {REMOTE_PAYMENT_COPY.retryCreate}
                              </Button>
                            </div>
                          </Alert>
                        ) : null}
                        <RemotePaymentDetails
                          method={selectedMethod}
                          pendingExtras={pendingExtras}
                          order={order}
                          isCreating={methodPending}
                        />
                      </>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
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
              {pendingExtras?.payment_id !== undefined ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCancelPayment}
                  disabled={cancelPending || actionPending || methodPending}
                >
                  {cancelPending ? (
                    <Spinner data-icon="inline-start" />
                  ) : (
                    <IconXCircle data-icon="inline-start" />
                  )}
                  {messages.pos.payment.cancelQr}
                </Button>
              ) : null}
              <Button
                data-testid={
                  selectedMethod === "cash" ? "bill-confirm-cash" : undefined
                }
                type="button"
                onClick={() => void handleConfirmPaid()}
                disabled={
                  isPending || methodPending || actionPending || !canConfirmPaid
                }
                title={disabledReason ?? undefined}
              >
                {actionPending ? <Spinner data-icon="inline-start" /> : null}
                {messages.pos.payment.paidConfirm}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={actionPending}
              >
                {ACTIONS_VI.cancel}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
