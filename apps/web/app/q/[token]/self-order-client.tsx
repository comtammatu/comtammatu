"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { ReceiptText as IconReceipt } from "lucide-react";
import { SELF_ORDER_VI } from "@comtammatu/shared/messages";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { toast } from "@comtammatu/ui/components/sonner";
import { AppPage } from "@/components/surface";
import { BrandMascot } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  publicSelfOrderSnapshotSchema,
  type PublicSelfOrderAvailableSnapshot,
  type PublicSelfOrderSnapshot,
  type SelfOrderCartItem,
} from "@lib/self-order/contracts";
import {
  buildBatchIntentKey,
  buildPaymentIntentKey,
  clearClientIntent,
  resolveClientIntent,
  type SelfOrderClientIntent,
} from "@lib/self-order/client-intent";
import { CartSheet } from "./self-order/cart-sheet";
import { BillDrawer } from "./self-order/bill-drawer";
import { useSnapshotSync } from "./self-order/hooks";
import { MenuPanel, defaultSelfOrderCategoryValue } from "./self-order/menu-panel";
import {
  PaymentPanel,
  type GuestPaymentRequestState,
  type InvoiceErrorFocusRequest,
  type InvoiceFieldErrors,
} from "./self-order/payment-panel";

interface SelfOrderClientProps {
  token: string;
  initialSnapshot: PublicSelfOrderAvailableSnapshot;
}

const TAX_CODE_PATTERN = /^\d{10}(-\d{3})?$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeTaxCodeInput(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 13);
  return digits.length > 10
    ? `${digits.slice(0, 10)}-${digits.slice(10)}`
    : digits;
}

function lineTotal(item: SelfOrderCartItem) {
  const modifierTotal = item.modifiers.reduce(
    (sum, modifier) => sum + modifier.price,
    0,
  );
  const sideTotal = item.sides.reduce(
    (sum, side) => sum + side.price * side.quantity,
    0,
  );
  return (item.unit_price + modifierTotal + sideTotal) * item.quantity;
}

async function readApiResponse(response: Response) {
  const payload = (await response.json().catch(() => null)) as
    | (Record<string, unknown> & { ok?: boolean })
    | null;
  if (response.ok && payload && payload.ok !== false) {
    return { ok: true, payload } as const;
  }
  return {
    ok: false,
    error: {
      code: typeof payload?.code === "string" ? payload.code : undefined,
      message:
        typeof payload?.message === "string" ? payload.message : undefined,
    },
  } as const;
}

function postSelfOrderJson(url: string, body: unknown) {
  return fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-self-order-request": "1",
    },
    body: JSON.stringify(body),
  });
}

function readOptionalString(
  value: Record<string, unknown>,
  key: string,
): string | null {
  const candidate = value[key];
  return typeof candidate === "string" && candidate.length > 0
    ? candidate
    : null;
}

function readOptionalNumber(
  value: Record<string, unknown>,
  key: string,
): number | null {
  const candidate = Number(value[key]);
  return Number.isFinite(candidate) && candidate > 0 ? candidate : null;
}

function normalizePaymentRequest(
  value: unknown,
): GuestPaymentRequestState | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  const method = readOptionalString(record, "method");
  const amount = Number(record.amount);
  if (
    (method !== "cash_call" && method !== "vietqr") ||
    !Number.isFinite(amount) ||
    amount < 0
  ) {
    return null;
  }
  return {
    id: readOptionalNumber(record, "id"),
    clientOpId: readOptionalString(record, "clientOpId"),
    status: readOptionalString(record, "status") ?? method,
    method,
    amount,
    paymentId: readOptionalNumber(record, "paymentId"),
    paymentCode: readOptionalString(record, "paymentCode"),
    qrData: readOptionalString(record, "qrData"),
    bankCode: readOptionalString(record, "bankCode"),
    accountNo: readOptionalString(record, "accountNo"),
    accountName: readOptionalString(record, "accountName"),
    createdAt: readOptionalString(record, "createdAt"),
    expiresAt: readOptionalString(record, "expiresAt"),
  };
}

function unavailableDescription(snapshot: Extract<PublicSelfOrderSnapshot, { ok: false }>) {
  if (snapshot.code === "self_order_disabled") {
    return SELF_ORDER_VI.unavailableDisabledDescription;
  }
  if (snapshot.code === "pos_session_closed") {
    return SELF_ORDER_VI.unavailablePosClosedDescription;
  }
  return SELF_ORDER_VI.unavailableInvalidTokenDescription;
}

function UnavailableState({
  snapshot,
}: {
  snapshot: Extract<PublicSelfOrderSnapshot, { ok: false }>;
}) {
  return (
    <AppPage
      as="main"
      id="main-content"
      width="narrow"
      density="compact"
      mobile
      className="min-h-dvh bg-background"
      contentClassName="min-h-dvh justify-center"
    >
      <Item variant="outline" className="bg-card">
        <ItemContent className="items-center gap-3 text-center">
          <BrandMascot decorative size="sm" />
          <ItemTitle className="text-lg">
            {SELF_ORDER_VI.unavailableTitle}
          </ItemTitle>
          <ItemDescription>{unavailableDescription(snapshot)}</ItemDescription>
        </ItemContent>
      </Item>
    </AppPage>
  );
}

export function SelfOrderClient({ token, initialSnapshot }: SelfOrderClientProps) {
  const [cartItems, setCartItems] = useState<SelfOrderCartItem[]>([]);
  const [customerNote, setCustomerNote] = useState("");
  const [clientOpId, setClientOpId] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [localPaymentRequest, setLocalPaymentRequest] =
    useState<GuestPaymentRequestState | null>(null);
  const [buyerNotGetInvoice, setBuyerNotGetInvoice] = useState(true);
  const [buyerName, setBuyerName] = useState("");
  const [buyerTaxCode, setBuyerTaxCode] = useState("");
  const [buyerAddress, setBuyerAddress] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [invoiceFieldErrors, setInvoiceFieldErrors] =
    useState<InvoiceFieldErrors>({});
  const [invoiceErrorFocusRequest, setInvoiceErrorFocusRequest] =
    useState<InvoiceErrorFocusRequest | null>(null);
  const [activeCategoryValue, setActiveCategoryValue] = useState(() =>
    defaultSelfOrderCategoryValue(initialSnapshot.menu),
  );
  const [billOpen, setBillOpen] = useState(false);
  const [billView, setBillView] = useState<"bill" | "payment">("bill");
  const [pendingPaymentMethod, setPendingPaymentMethod] = useState<
    "cash_call" | "vietqr" | null
  >(null);
  const [isSubmitting, startSubmit] = useTransition();
  const [isPaymentPending, startPayment] = useTransition();
  const batchIntentRef = useRef<SelfOrderClientIntent | null>(null);
  const paymentIntentRef = useRef<SelfOrderClientIntent | null>(null);
  const invoiceFocusAttemptRef = useRef(0);
  const guestToastKeyRef = useRef<string | null>(null);
  const refreshErrorRef = useRef<string | null>(null);

  const {
    snapshot,
    setSnapshot,
    refreshSnapshot,
    isRefreshing,
    refreshError,
  } = useSnapshotSync(token, initialSnapshot, clientOpId, () => {
    setCartItems([]);
    setCustomerNote("");
    setClientOpId(null);
    setLocalPaymentRequest(null);
    batchIntentRef.current = null;
    paymentIntentRef.current = null;
  });

  useEffect(() => {
    if (!refreshError) {
      refreshErrorRef.current = null;
      return;
    }
    if (refreshErrorRef.current === refreshError) return;
    refreshErrorRef.current = refreshError;
    toast.error(refreshError);
  }, [refreshError]);

  useEffect(() => {
    if (!snapshot.ok) return;
    const notice =
      snapshot.state === "awaiting_confirmation"
        ? "awaiting"
        : snapshot.state === "rejected"
          ? "rejected"
          : null;
    if (!notice) return;

    const key = `${notice}:${snapshot.request?.id ?? "none"}`;
    if (guestToastKeyRef.current === key) return;
    guestToastKeyRef.current = key;

    if (notice === "rejected") {
      const rejectedRequest = snapshot.request;
      toast.warning(SELF_ORDER_VI.rejectedCalloutTitle, {
        description: SELF_ORDER_VI.rejectedCalloutDescription,
        duration: 10_000,
        action: rejectedRequest
          ? {
              label: SELF_ORDER_VI.resubmitRejected,
              onClick: () => {
                setCartItems(
                  rejectedRequest.items.map((item) => ({
                    ...item,
                    key: item.key ?? crypto.randomUUID(),
                  })),
                );
                setCustomerNote(rejectedRequest.customerNote ?? "");
                setSubmitError(null);
              },
            }
          : undefined,
      });
      return;
    }

    toast.warning(SELF_ORDER_VI.awaitingCalloutTitle, {
      description: SELF_ORDER_VI.awaitingCalloutDescription,
      duration: 6_000,
    });
  }, [snapshot]);

  const invoicePayload = useMemo(
    () => ({
      buyerNotGetInvoice,
      buyerName: buyerName.trim(),
      buyerTaxCode: buyerTaxCode.trim(),
      buyerAddress: buyerAddress.trim(),
      buyerEmail: buyerEmail.trim(),
    }),
    [buyerAddress, buyerEmail, buyerName, buyerNotGetInvoice, buyerTaxCode],
  );

  if (!snapshot.ok) return <UnavailableState snapshot={snapshot} />;

  const available = snapshot;
  const order = available.order;
  const snapshotPaymentRequest = normalizePaymentRequest(
    available.paymentRequest,
  );
  const activePaymentRequest = snapshotPaymentRequest ?? localPaymentRequest;
  const awaiting = available.state === "awaiting_confirmation";
  const paymentPending = available.state === "payment_pending";
  const ambiguous = available.state === "multiple_open_orders";
  const open = available.state === "open" || paymentPending;
  const itemCount = order?.itemCount ?? 0;
  const cartQuantity = cartItems.reduce((sum, item) => sum + item.quantity, 0);
  const cartTotal = cartItems.reduce((sum, item) => sum + lineTotal(item), 0);
  const ctaLabel = open
    ? SELF_ORDER_VI.submitAddMore
    : SELF_ORDER_VI.submitFirstBatch;
  const ctaDisabled = awaiting || paymentPending;
  const ctaDisabledHint = awaiting
    ? SELF_ORDER_VI.awaitingCalloutDescription
    : paymentPending
      ? SELF_ORDER_VI.activePaymentIntent
      : !open
        ? SELF_ORDER_VI.firstSubmitHint
        : null;

  function addCartItem(item: SelfOrderCartItem) {
    setCartItems((current) => [...current, item]);
    setSubmitError(null);
  }

  function changeQuantity(key: string, delta: number) {
    setCartItems((current) =>
      current
        .map((item) =>
          item.key === key
            ? { ...item, quantity: Math.max(0, item.quantity + delta) }
            : item,
        )
        .filter((item) => item.quantity > 0),
    );
    setSubmitError(null);
  }

  function replaceCartItem(item: SelfOrderCartItem) {
    setCartItems((current) =>
      current.map((existing) =>
        existing.key === item.key ? item : existing,
      ),
    );
    setSubmitError(null);
  }

  function removeCartItem(key: string) {
    setCartItems((current) => current.filter((item) => item.key !== key));
    setSubmitError(null);
  }

  function submitCart() {
    if (cartItems.length === 0 || ctaDisabled) return;
    const intent = resolveClientIntent(
      batchIntentRef.current,
      buildBatchIntentKey({ items: cartItems, customerNote }),
      () => crypto.randomUUID(),
    );
    batchIntentRef.current = intent;
    const submittedItems = cartItems;
    const submittedNote = customerNote;
    setSubmitError(null);
    startSubmit(async () => {
      const response = await postSelfOrderJson(
        `/api/self-order/${encodeURIComponent(token)}/submit`,
        {
          clientOpId: intent.clientOpId,
          items: submittedItems,
          customerNote: submittedNote,
        },
      );
      const result = await readApiResponse(response);
      if (!result.ok) {
        setSubmitError(result.error.message ?? SELF_ORDER_VI.submitFailed);
        return;
      }
      const acknowledgedClientOpId = readOptionalString(
        result.payload,
        "clientOpId",
      );
      const parsedSnapshot = publicSelfOrderSnapshotSchema.safeParse(
        result.payload.snapshot,
      );
      if (
        acknowledgedClientOpId !== intent.clientOpId ||
        !parsedSnapshot.success
      ) {
        setSubmitError(SELF_ORDER_VI.retryChanged);
        return;
      }
      setClientOpId(intent.clientOpId);
      setSnapshot(parsedSnapshot.data);
      setCartItems([]);
      setCustomerNote("");
      batchIntentRef.current = clearClientIntent(
        batchIntentRef.current,
        intent.clientOpId,
      );
      if (parsedSnapshot.data.ok && parsedSnapshot.data.state === "open") {
        toast.success(SELF_ORDER_VI.addedOk);
      }
    });
  }

  function validateInvoice(): InvoiceFieldErrors {
    if (buyerNotGetInvoice) return {};
    const errors: InvoiceFieldErrors = {};
    if (buyerEmail.trim() && !EMAIL_PATTERN.test(buyerEmail.trim())) {
      errors.buyerEmail = SELF_ORDER_VI.buyerEmailInvalid;
    }
    if (buyerTaxCode.trim() && !TAX_CODE_PATTERN.test(buyerTaxCode.trim())) {
      errors.buyerTaxCode = SELF_ORDER_VI.buyerTaxInvalid;
    }
    if (buyerTaxCode.trim()) {
      if (!buyerName.trim()) errors.buyerName = SELF_ORDER_VI.buyerBusinessMissing;
      if (!buyerAddress.trim()) {
        errors.buyerAddress = SELF_ORDER_VI.buyerBusinessMissing;
      }
    }
    return errors;
  }

  function requestPayment(method: "cash_call" | "vietqr") {
    if (!order || activePaymentRequest) return;
    const fieldErrors = validateInvoice();
    setInvoiceFieldErrors(fieldErrors);
    const firstError = (
      ["buyerName", "buyerTaxCode", "buyerAddress", "buyerEmail"] as const
    ).find((field) => fieldErrors[field]);
    if (firstError) {
      invoiceFocusAttemptRef.current += 1;
      setInvoiceErrorFocusRequest({
        attempt: invoiceFocusAttemptRef.current,
        field: firstError,
      });
      return;
    }

    const intent = resolveClientIntent(
      paymentIntentRef.current,
      buildPaymentIntentKey({
        method,
        invoice: invoicePayload,
        orderNumber: order.orderNumber,
        totalAmount: order.totalAmount,
      }),
      () => crypto.randomUUID(),
    );
    paymentIntentRef.current = intent;
    setPaymentError(null);
    setPendingPaymentMethod(method);
    startPayment(async () => {
      const response = await postSelfOrderJson(
        `/api/self-order/${encodeURIComponent(token)}/payment`,
        { clientOpId: intent.clientOpId, method, invoice: invoicePayload },
      );
      const result = await readApiResponse(response);
      setPendingPaymentMethod(null);
      if (!result.ok) {
        setPaymentError(result.error.message ?? SELF_ORDER_VI.paymentFailed);
        if (
          result.error.code === "active_payment_intent" ||
          result.error.code === "payment_intent_expired" ||
          result.error.code === "payment_completed"
        ) {
          void refreshSnapshot();
        }
        return;
      }
      const paymentRequest = normalizePaymentRequest(result.payload);
      if (!paymentRequest) {
        setPaymentError(SELF_ORDER_VI.paymentFailed);
        return;
      }
      setLocalPaymentRequest(paymentRequest);
      paymentIntentRef.current = clearClientIntent(
        paymentIntentRef.current,
        intent.clientOpId,
      );
      setBillView("payment");
      setBillOpen(true);
      void refreshSnapshot();
    });
  }

  return (
    <AppPage
      as="main"
      id="main-content"
      width="narrow"
      density="compact"
      mobile
      className="min-h-dvh bg-background"
      contentClassName="min-h-dvh p-0"
    >
      <div className="flex min-h-dvh flex-col">
        <header className="workflow-safe-pt sticky top-0 z-30 border-b border-border bg-background/95 px-3 py-2 backdrop-blur">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-primary">
                {SELF_ORDER_VI.branchFallback}
              </p>
              <h1 className="font-heading text-xl font-semibold">
                {SELF_ORDER_VI.tableLabel(available.table.number)}
              </h1>
            </div>
            <ThemeToggle
              variant="outline"
              size="icon-touch"
              className="shrink-0"
            />
          </div>
        </header>

        <MenuPanel
          categories={available.menu}
          activeCategoryValue={activeCategoryValue}
          onActiveCategoryChange={setActiveCategoryValue}
          onAdd={addCartItem}
          disabled={paymentPending}
        />

        <CartSheet
          categories={available.menu}
          items={cartItems}
          total={cartTotal}
          quantity={cartQuantity}
          isSubmitting={isSubmitting}
          isEditingLocked={paymentPending}
          canSubmit={cartItems.length > 0}
          ctaLabel={ctaLabel}
          ctaDisabled={ctaDisabled}
          ctaDisabledHint={ctaDisabledHint}
          submitError={submitError}
          customerNote={customerNote}
          onCustomerNoteChange={setCustomerNote}
          onQuantityChange={changeQuantity}
          onRemove={removeCartItem}
          onReplace={replaceCartItem}
          onSubmit={submitCart}
        />

        <div
          className={`workflow-safe-pb fixed right-3 z-30 ${cartItems.length > 0 ? "bottom-20" : "bottom-0"}`}
        >
          <Button
            type="button"
            variant="outline"
            size="touch"
            onClick={() => {
              setBillView("bill");
              setBillOpen(true);
            }}
          >
            <IconReceipt data-icon="inline-start" />
            {SELF_ORDER_VI.billTab}
            <Badge variant={awaiting ? "warning" : "secondary"}>
              {awaiting ? "⏳" : itemCount}
            </Badge>
          </Button>
        </div>
      </div>

      <BillDrawer
        open={billOpen}
        onOpenChange={(nextOpen) => {
          setBillOpen(nextOpen);
          if (!nextOpen) setBillView("bill");
        }}
        view={billView}
        onOpenPayment={() => setBillView("payment")}
        onBackToBill={() => setBillView("bill")}
        canPay={!ambiguous && order !== null}
        tableNumber={available.table.number}
        order={order}
        rounds={available.rounds}
        pendingItems={awaiting ? available.request?.items : undefined}
      >
        {!ambiguous && order ? (
          <PaymentPanel
            disabled={awaiting || paymentPending}
            activeOrder={order}
            activePaymentRequest={activePaymentRequest}
            buyerNotGetInvoice={buyerNotGetInvoice}
            buyerName={buyerName}
            buyerTaxCode={buyerTaxCode}
            buyerAddress={buyerAddress}
            buyerEmail={buyerEmail}
            isPending={isPaymentPending}
            pendingMethod={pendingPaymentMethod}
            isRefreshing={isRefreshing}
            error={paymentError}
            fieldErrors={invoiceFieldErrors}
            errorFocusRequest={invoiceErrorFocusRequest}
            onBuyerNotGetInvoiceChange={setBuyerNotGetInvoice}
            onBuyerNameChange={setBuyerName}
            onBuyerTaxCodeChange={(value) =>
              setBuyerTaxCode(normalizeTaxCodeInput(value))
            }
            onBuyerAddressChange={setBuyerAddress}
            onBuyerEmailChange={setBuyerEmail}
            onRequestPayment={requestPayment}
            onRefreshPayment={() => void refreshSnapshot()}
          />
        ) : null}
      </BillDrawer>
    </AppPage>
  );
}
