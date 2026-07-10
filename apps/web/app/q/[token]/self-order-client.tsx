"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { SELF_ORDER_VI } from "@comtammatu/shared/messages";
import { Button } from "@comtammatu/ui/components/button";
import { NoteCallout } from "@comtammatu/ui/components/note-callout";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@comtammatu/ui/components/tabs";
import { Badge } from "@comtammatu/ui/components/badge";
import { Spinner } from "@comtammatu/ui/components/spinner";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { AppPage } from "@/components/surface";
import type {
  PublicSelfOrderSnapshot,
  SelfOrderCartItem,
} from "@lib/self-order/contracts";
import {
  buildBatchIntentKey,
  buildPaymentIntentKey,
  clearClientIntent,
  resolveClientIntent,
  type SelfOrderClientIntent,
} from "@lib/self-order/client-intent";
import { useSnapshotSync } from "./self-order/hooks";
import {
  getSelfOrderCapabilityBoundary,
  getSelfOrderSeatingIdentity,
  resolveSelfOrderPrivacyTransition,
  type SelfOrderCapabilityBoundary,
} from "./self-order/client-privacy-state";
import { StatusPill } from "./self-order/status-pill";
import { SessionStatePanel } from "./self-order/session-state-panel";
import { OrderSummary } from "./self-order/order-summary";
import { MenuPanel } from "./self-order/menu-panel";
import { CartSheet } from "./self-order/cart-sheet";
import { DeviceAccessPanel } from "./self-order/device-access-panel";
import {
  PaymentPanel,
  type GuestPaymentRequestState,
  type InvoiceErrorFocusRequest,
  type InvoiceFieldErrors,
} from "./self-order/payment-panel";

interface SelfOrderClientProps {
  token: string;
  initialSnapshot: PublicSelfOrderSnapshot;
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
  if (response.ok && payload && payload.ok !== false)
    return { ok: true, payload } as const;
  return {
    ok: false,
    error: {
      ok: false as const,
      code: typeof payload?.code === "string" ? payload.code : undefined,
      message:
        typeof payload?.message === "string" ? payload.message : undefined,
    },
  } as const;
}

async function postSelfOrderJson(url: string, body: unknown) {
  const send = () =>
    fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-self-order-request": "1",
      },
      body: JSON.stringify(body),
    });
  const first = await send();
  return first.status === 428 ? send() : first;
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

function readPaymentAmount(
  value: Record<string, unknown>,
  key: string,
): number | null {
  const candidate = Number(value[key]);
  return Number.isFinite(candidate) && candidate >= 0 ? candidate : null;
}

function isDeviceRequestSnapshot(
  value: unknown,
): value is NonNullable<PublicSelfOrderSnapshot["deviceRequest"]> {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  const validStatus = [
    "origin_pending",
    "join_pending",
    "approved",
    "rejected",
    "revoked",
    "expired",
  ].includes(String(record.status));
  return (
    Number.isInteger(Number(record.deviceId)) &&
    Number(record.deviceId) > 0 &&
    (record.kind === "origin" || record.kind === "join") &&
    validStatus
  );
}

function normalizePaymentRequest(
  value: unknown,
  fallback?: { method: "cash_call" | "vietqr"; amount: number },
): GuestPaymentRequestState | null {
  if (typeof value !== "object" || value === null) {
    if (!fallback) return null;
    return {
      status: fallback.method === "cash_call" ? "cash_call" : "vietqr_pending",
      method: fallback.method,
      amount: fallback.amount,
    };
  }

  const outer = value as Record<string, unknown>;
  const nested = outer.paymentRequest;
  const record =
    typeof nested === "object" && nested !== null
      ? (nested as Record<string, unknown>)
      : outer;
  const method = readOptionalString(record, "method") ?? fallback?.method;
  if (method !== "cash_call" && method !== "vietqr") return null;

  const status =
    readOptionalString(record, "status") ??
    (method === "cash_call" ? "cash_call" : "vietqr_pending");
  const amount = readPaymentAmount(record, "amount") ?? fallback?.amount;
  if (amount == null) return null;

  return {
    id: readOptionalNumber(record, "id"),
    clientOpId: readOptionalString(record, "clientOpId"),
    status,
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

function isActivePaymentRequest(
  paymentRequest: GuestPaymentRequestState | null,
) {
  return (
    paymentRequest?.status === "cash_call" ||
    paymentRequest?.status === "vietqr_pending"
  );
}

function isActivePaymentConflictCode(code: string | undefined) {
  return (
    code === "pending_payment_exists" ||
    code === "active_payment_intent" ||
    code === "payment_cancel_staff_required"
  );
}

function shouldRefreshPaymentSnapshot(code: string | undefined) {
  return (
    isActivePaymentConflictCode(code) ||
    code === "payment_intent_expired" ||
    code === "payment_completed" ||
    code === "session_not_active" ||
    code === "order_conflict" ||
    code === "retry_required"
  );
}

export function SelfOrderClient({
  token,
  initialSnapshot,
}: SelfOrderClientProps) {
  const [cartItems, setCartItems] = useState<SelfOrderCartItem[]>([]);
  const [customerNote, setCustomerNote] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [invoiceFieldErrors, setInvoiceFieldErrors] =
    useState<InvoiceFieldErrors>({});
  const [invoiceErrorFocusRequest, setInvoiceErrorFocusRequest] =
    useState<InvoiceErrorFocusRequest | null>(null);
  const [deviceActionError, setDeviceActionError] = useState<string | null>(
    null,
  );
  const [localPaymentRequest, setLocalPaymentRequest] =
    useState<GuestPaymentRequestState | null>(null);
  const [buyerNotGetInvoice, setBuyerNotGetInvoice] = useState(true);
  const [buyerName, setBuyerName] = useState("");
  const [buyerTaxCode, setBuyerTaxCode] = useState("");
  const [buyerAddress, setBuyerAddress] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [activeCategoryValue, setActiveCategoryValue] = useState("all");
  const [seatingEpoch, setSeatingEpoch] = useState(0);
  const [activeMainTab, setActiveMainTab] = useState(() =>
    isActivePaymentRequest(
      normalizePaymentRequest(initialSnapshot.paymentRequest),
    )
      ? "bill"
      : "menu",
  );
  const [isPending, startTransition] = useTransition();
  const [isPaymentPending, startPaymentTransition] = useTransition();
  const [isDeviceActionPending, startDeviceActionTransition] = useTransition();
  const [pendingPaymentMethod, setPendingPaymentMethod] = useState<
    "cash_call" | "vietqr" | null
  >(null);
  const batchIntentRef = useRef<SelfOrderClientIntent | null>(null);
  const paymentIntentRef = useRef<SelfOrderClientIntent | null>(null);
  const localPaymentSnapshotRef = useRef<PublicSelfOrderSnapshot | null>(null);
  const pendingCapabilityDraftKeyRef = useRef<string | null>(null);
  const seatingBoundaryRef = useRef<SelfOrderCapabilityBoundary | null>(
    getSelfOrderCapabilityBoundary(initialSnapshot),
  );
  const pendingBoundaryHasBatchRef = useRef(
    Boolean(initialSnapshot.pendingBatch),
  );
  const seatingIdentityRef = useRef(
    getSelfOrderSeatingIdentity(initialSnapshot),
  );

  const resetSeatingScopedState = useCallback((preserveCart: boolean) => {
    if (!preserveCart) {
      setCartItems([]);
      setCustomerNote("");
    }
    setSubmitError(null);
    setPaymentError(null);
    setInvoiceFieldErrors({});
    setInvoiceErrorFocusRequest(null);
    setDeviceActionError(null);
    setLocalPaymentRequest(null);
    setBuyerNotGetInvoice(true);
    setBuyerName("");
    setBuyerTaxCode("");
    setBuyerAddress("");
    setBuyerEmail("");
    setActiveCategoryValue("all");
    setActiveMainTab("menu");
    setPendingPaymentMethod(null);
    batchIntentRef.current = null;
    paymentIntentRef.current = null;
    localPaymentSnapshotRef.current = null;
    pendingCapabilityDraftKeyRef.current = null;
    setSeatingEpoch((current) => current + 1);
  }, []);

  const handleHistoryPrivacyScrub = useCallback(() => {
    resetSeatingScopedState(false);
  }, [resetSeatingScopedState]);

  const {
    snapshot,
    setSnapshot,
    refreshSnapshot,
    isRefreshing,
    refreshError,
    terminalError,
    isHistoryRestorePending,
  } = useSnapshotSync(token, initialSnapshot, handleHistoryPrivacyScrub);

  const refreshPaymentState = useCallback(async () => {
    const refreshed = await refreshSnapshot();
    if (refreshed) {
      localPaymentSnapshotRef.current = null;
      setLocalPaymentRequest(null);
    }
    return refreshed;
  }, [refreshSnapshot]);

  const cartTotal = useMemo(
    () => cartItems.reduce((sum, item) => sum + lineTotal(item), 0),
    [cartItems],
  );
  const cartQuantity = useMemo(
    () => cartItems.reduce((sum, item) => sum + item.quantity, 0),
    [cartItems],
  );
  const currentBatchIntentKey = useMemo(
    () =>
      buildBatchIntentKey({
        items: cartItems,
        customerNote: customerNote.trim() || undefined,
      }),
    [cartItems, customerNote],
  );
  const currentBatchIntentKeyRef = useRef(currentBatchIntentKey);
  currentBatchIntentKeyRef.current = currentBatchIntentKey;

  const sessionStatus = snapshot.session?.status ?? null;
  const isSessionActive = sessionStatus === "active";
  const isPendingApproval = sessionStatus === "pending_approval";
  const isSessionRevoked = sessionStatus === "revoked";
  const activeOrder = snapshot.order ?? null;
  const isClosed =
    sessionStatus === "closed" || activeOrder?.paymentStatus === "paid";
  const snapshotPaymentRequest = normalizePaymentRequest(
    snapshot.paymentRequest,
  );
  const currentLocalPaymentRequest =
    localPaymentSnapshotRef.current === snapshot ? localPaymentRequest : null;
  const resolvedPaymentRequest =
    snapshotPaymentRequest ?? currentLocalPaymentRequest;
  const activePaymentRequest =
    !isClosed && isActivePaymentRequest(resolvedPaymentRequest)
      ? resolvedPaymentRequest
      : null;
  const isCapabilityPending =
    snapshot.access === "origin_pending" || snapshot.access === "join_pending";
  const isSubmittedCapabilityPending =
    isCapabilityPending && snapshot.pendingBatch != null;
  const isCartMutationLocked = isPending || isSubmittedCapabilityPending;
  const isJoinOnlyPending =
    snapshot.access === "join_pending" && !snapshot.pendingBatch;
  const isDeviceAccessDenied =
    snapshot.deviceAccess === "rejected" || snapshot.deviceAccess === "revoked";
  const ctaHardDisabled =
    isClosed ||
    isPendingApproval ||
    isSessionRevoked ||
    isDeviceAccessDenied ||
    activePaymentRequest !== null ||
    isCapabilityPending ||
    snapshot.canSubmitBatch === false;
  const ctaLabel = activePaymentRequest
    ? activePaymentRequest.status === "cash_call"
      ? SELF_ORDER_VI.statusAwaitingCash
      : SELF_ORDER_VI.statusAwaitingVietQr
    : isDeviceAccessDenied
      ? SELF_ORDER_VI.deviceAccessDeniedTitle
      : isJoinOnlyPending
        ? SELF_ORDER_VI.ctaAwaitingDevice
        : isCapabilityPending
          ? SELF_ORDER_VI.ctaAwaitingApproval
          : isSessionRevoked
            ? SELF_ORDER_VI.ctaRejected
            : isClosed
              ? SELF_ORDER_VI.statusClosed
              : isPendingApproval
                ? SELF_ORDER_VI.ctaAwaitingApproval
                : isSessionActive
                  ? SELF_ORDER_VI.submitAddMore
                  : snapshot.seatingAccess === "join_required"
                    ? SELF_ORDER_VI.submitJoinBatch
                    : SELF_ORDER_VI.submitFirstBatch;
  const ctaDisabledHint = activePaymentRequest
    ? SELF_ORDER_VI.paymentCancelStaffRequired
    : isDeviceAccessDenied
      ? snapshot.deviceAccess === "rejected"
        ? SELF_ORDER_VI.deviceRejectedDescription
        : SELF_ORDER_VI.deviceRevokedDescription
      : isJoinOnlyPending
        ? SELF_ORDER_VI.ctaAwaitingDeviceHint
        : isSessionRevoked
          ? SELF_ORDER_VI.ctaRejectedHint
          : isPendingApproval
            ? SELF_ORDER_VI.ctaAwaitingApprovalHint
            : null;

  const currentSeatingIdentity = getSelfOrderSeatingIdentity(snapshot);
  const currentCapabilityBoundary = getSelfOrderCapabilityBoundary(snapshot);
  const currentPendingHasBatch = snapshot.pendingBatch != null;

  useEffect(() => {
    if (terminalError) return;

    const pendingDraftKey = pendingCapabilityDraftKeyRef.current;
    const transition = resolveSelfOrderPrivacyTransition({
      previousIdentity: seatingIdentityRef.current,
      currentIdentity: currentSeatingIdentity,
      previousBoundary: seatingBoundaryRef.current,
      currentBoundary: currentCapabilityBoundary,
      currentAccess: snapshot.access,
      currentSeatingAccess: snapshot.seatingAccess,
      deviceDenied: isDeviceAccessDenied,
      recoveryExpired: snapshot.deviceRecovery === "expired",
      pendingHadSubmittedBatch: pendingBoundaryHasBatchRef.current,
      exactPendingDraft:
        pendingDraftKey !== null &&
        currentBatchIntentKeyRef.current === pendingDraftKey,
    });

    if (transition.reset) {
      resetSeatingScopedState(transition.preserveCart);
    }

    seatingIdentityRef.current = currentSeatingIdentity;
    seatingBoundaryRef.current = currentCapabilityBoundary;
    pendingBoundaryHasBatchRef.current =
      currentCapabilityBoundary === "origin_pending" ||
      currentCapabilityBoundary === "join_pending"
        ? currentPendingHasBatch
        : false;
  }, [
    currentCapabilityBoundary,
    currentPendingHasBatch,
    currentSeatingIdentity,
    isDeviceAccessDenied,
    resetSeatingScopedState,
    snapshot.access,
    snapshot.deviceRecovery,
    snapshot.seatingAccess,
    terminalError,
  ]);

  useEffect(() => {
    if (!terminalError) return;
    resetSeatingScopedState(false);
    seatingBoundaryRef.current = null;
    pendingBoundaryHasBatchRef.current = false;
    seatingIdentityRef.current = null;
  }, [resetSeatingScopedState, terminalError]);

  useEffect(() => {
    const pendingDraftKey = pendingCapabilityDraftKeyRef.current;
    if (!pendingDraftKey || snapshot.access !== "approved") return;
    if (currentBatchIntentKeyRef.current === pendingDraftKey) {
      setCartItems([]);
      setCustomerNote("");
    }
    pendingCapabilityDraftKeyRef.current = null;
  }, [snapshot.access]);

  const batches = snapshot.batches ?? [];
  const billRoundCount = batches.length;
  const prevSessionStatusRef = useRef(sessionStatus);
  const prevBatchCountRef = useRef(billRoundCount);
  useEffect(() => {
    const previous = prevSessionStatusRef.current;
    prevSessionStatusRef.current = sessionStatus;
    if (
      previous === "pending_approval" &&
      sessionStatus === "active" &&
      activeOrder
    ) {
      setActiveMainTab("bill");
      return;
    }
    if (
      previous !== "pending_approval" &&
      sessionStatus === "pending_approval"
    ) {
      setActiveMainTab("bill");
    }
  }, [sessionStatus, activeOrder]);

  useEffect(() => {
    const previousCount = prevBatchCountRef.current;
    prevBatchCountRef.current = billRoundCount;
    if (billRoundCount > previousCount) {
      setActiveMainTab("bill");
    }
  }, [billRoundCount]);

  useEffect(() => {
    if (!activePaymentRequest) return;
    setActiveMainTab("bill");
    setPaymentError(null);
  }, [activePaymentRequest?.status]);

  useEffect(() => {
    const expiresAt = activePaymentRequest?.expiresAt;
    if (!expiresAt) return;
    const expiresAtMs = Date.parse(expiresAt);
    if (!Number.isFinite(expiresAtMs)) return;
    const delay = Math.min(
      Math.max(expiresAtMs - Date.now() + 250, 0),
      2_147_483_647,
    );
    const timer = window.setTimeout(() => {
      void refreshPaymentState();
    }, delay);
    return () => window.clearTimeout(timer);
  }, [activePaymentRequest?.expiresAt, refreshPaymentState]);

  useEffect(() => {
    if (snapshot.canViewBill === false && activeMainTab === "bill") {
      setActiveMainTab("menu");
    }
  }, [activeMainTab, snapshot.canViewBill]);

  function applyDeviceActionSnapshot(payload: Record<string, unknown>) {
    const nextSnapshot = payload.snapshot;
    if (
      typeof nextSnapshot === "object" &&
      nextSnapshot !== null &&
      (nextSnapshot as { ok?: unknown }).ok === true
    ) {
      setSnapshot(nextSnapshot as PublicSelfOrderSnapshot);
      return true;
    }
    const deviceRequest = payload.deviceRequest;
    if (isDeviceRequestSnapshot(deviceRequest)) {
      setSnapshot((current) => ({ ...current, deviceRequest }));
      return true;
    }
    return false;
  }

  function requestDeviceJoin() {
    setDeviceActionError(null);
    startDeviceActionTransition(async () => {
      try {
        const response = await postSelfOrderJson(
          `/api/self-order/${encodeURIComponent(token)}/join`,
          {},
        );
        const result = await readApiResponse(response);
        if (!result.ok || !applyDeviceActionSnapshot(result.payload)) {
          setDeviceActionError(
            result.ok
              ? SELF_ORDER_VI.submitFailed
              : (result.error.message ?? SELF_ORDER_VI.submitFailed),
          );
        }
      } catch {
        setDeviceActionError(SELF_ORDER_VI.submitFailed);
      }
    });
  }

  function refreshPairingCode() {
    setDeviceActionError(null);
    startDeviceActionTransition(async () => {
      try {
        const response = await postSelfOrderJson(
          `/api/self-order/${encodeURIComponent(token)}/pairing-code`,
          {},
        );
        const result = await readApiResponse(response);
        if (!result.ok || !applyDeviceActionSnapshot(result.payload)) {
          setDeviceActionError(
            result.ok
              ? SELF_ORDER_VI.submitFailed
              : (result.error.message ?? SELF_ORDER_VI.submitFailed),
          );
        }
      } catch {
        setDeviceActionError(SELF_ORDER_VI.submitFailed);
      }
    });
  }

  function addItem(cartItem: SelfOrderCartItem) {
    if (isCartMutationLocked || activePaymentRequest || isDeviceAccessDenied)
      return;
    setSubmitError(null);
    setCartItems((current) => [...current, cartItem]);
  }

  function updateQuantity(key: string, delta: number) {
    if (isCartMutationLocked) return;
    setSubmitError(null);
    setCartItems((current) =>
      current.map((item) =>
        item.key === key
          ? { ...item, quantity: Math.max(1, item.quantity + delta) }
          : item,
      ),
    );
  }

  function removeItem(key: string) {
    if (isCartMutationLocked) return;
    setSubmitError(null);
    setCartItems((current) => current.filter((item) => item.key !== key));
  }

  function buildInvoicePayload() {
    if (buyerNotGetInvoice) {
      return { ok: true as const, invoice: { buyerNotGetInvoice: true } };
    }
    const taxCode = buyerTaxCode.trim();
    const errors: InvoiceFieldErrors = {};
    if (taxCode && !TAX_CODE_PATTERN.test(taxCode)) {
      errors.buyerTaxCode = SELF_ORDER_VI.buyerTaxInvalid;
    }
    if (taxCode && !buyerName.trim()) {
      errors.buyerName = SELF_ORDER_VI.buyerBusinessMissing;
    }
    if (taxCode && !buyerAddress.trim()) {
      errors.buyerAddress = SELF_ORDER_VI.buyerBusinessMissing;
    }
    if (buyerEmail.trim() && !EMAIL_PATTERN.test(buyerEmail.trim())) {
      errors.buyerEmail = SELF_ORDER_VI.buyerEmailInvalid;
    }
    if (Object.keys(errors).length > 0) {
      return { ok: false as const, errors };
    }
    return {
      ok: true as const,
      invoice: {
        buyerNotGetInvoice: false,
        buyerName: buyerName.trim() || undefined,
        buyerTaxCode: taxCode || undefined,
        buyerAddress: buyerAddress.trim() || undefined,
        buyerEmail: buyerEmail.trim() || undefined,
      },
    };
  }

  async function postBatch(
    path: string,
    intent: SelfOrderClientIntent,
    items: readonly SelfOrderCartItem[],
    note: string | undefined,
  ) {
    return postSelfOrderJson(
      `/api/self-order/${encodeURIComponent(token)}/${path}`,
      {
        clientOpId: intent.clientOpId,
        items,
        customerNote: note,
      },
    );
  }

  function submitBatch() {
    if (cartItems.length === 0 || isPending || ctaHardDisabled) return;
    setSubmitError(null);
    const submittedItems = cartItems;
    const submittedNote = customerNote.trim() || undefined;
    const intent = resolveClientIntent(
      batchIntentRef.current,
      buildBatchIntentKey({
        items: submittedItems,
        customerNote: submittedNote,
      }),
      () => crypto.randomUUID(),
    );
    batchIntentRef.current = intent;

    startTransition(async () => {
      try {
        const response = await postBatch(
          "batches",
          intent,
          submittedItems,
          submittedNote,
        );
        const result = await readApiResponse(response);
        if (!result.ok && isActivePaymentConflictCode(result.error.code)) {
          setSubmitError(
            result.error.message ?? SELF_ORDER_VI.paymentCancelStaffRequired,
          );
          await refreshSnapshot();
          setActiveMainTab("bill");
          return;
        }
        if (!result.ok) {
          setSubmitError(result.error.message ?? SELF_ORDER_VI.submitFailed);
          if (result.error.code === "retry_required") await refreshSnapshot();
          return;
        }

        const acknowledgedClientOpId = readOptionalString(
          result.payload,
          "clientOpId",
        );
        const nextSnapshot = result.payload.snapshot;
        if (
          acknowledgedClientOpId !== intent.clientOpId ||
          typeof nextSnapshot !== "object" ||
          nextSnapshot === null ||
          (nextSnapshot as { ok?: unknown }).ok !== true
        ) {
          setSubmitError(SELF_ORDER_VI.retryChanged);
          return;
        }

        setSnapshot(nextSnapshot as PublicSelfOrderSnapshot);

        batchIntentRef.current = clearClientIntent(
          batchIntentRef.current,
          intent.clientOpId,
        );
        const waitsForCapability =
          (nextSnapshot as PublicSelfOrderSnapshot).access ===
            "origin_pending" ||
          (nextSnapshot as PublicSelfOrderSnapshot).access === "join_pending";
        if (currentBatchIntentKeyRef.current === intent.key) {
          if (waitsForCapability) {
            pendingCapabilityDraftKeyRef.current = intent.key;
          } else {
            setCartItems([]);
            setCustomerNote("");
          }
        }
      } catch {
        setSubmitError(SELF_ORDER_VI.submitFailed);
      }
    });
  }

  function requestPayment(method: "cash_call" | "vietqr") {
    if (
      !isSessionActive ||
      !activeOrder ||
      isPaymentPending ||
      activePaymentRequest
    )
      return;
    setPaymentError(null);
    const invoiceResult = buildInvoicePayload();
    if (!invoiceResult.ok) {
      setInvoiceFieldErrors(invoiceResult.errors);
      const firstErrorField = (
        ["buyerName", "buyerTaxCode", "buyerAddress", "buyerEmail"] as const
      ).find((field) => Boolean(invoiceResult.errors[field]));
      if (firstErrorField) {
        setInvoiceErrorFocusRequest((current) => ({
          attempt: (current?.attempt ?? 0) + 1,
          field: firstErrorField,
        }));
      }
      return;
    }
    setInvoiceFieldErrors({});
    setInvoiceErrorFocusRequest(null);
    const invoice = invoiceResult.invoice;
    setPendingPaymentMethod(method);
    startPaymentTransition(async () => {
      const intent = resolveClientIntent(
        paymentIntentRef.current,
        buildPaymentIntentKey({
          method,
          invoice,
          orderNumber: activeOrder.orderNumber,
          totalAmount: activeOrder.totalAmount,
        }),
        () => crypto.randomUUID(),
      );
      paymentIntentRef.current = intent;

      try {
        const response = await postSelfOrderJson(
          `/api/self-order/${encodeURIComponent(token)}/payment`,
          {
            clientOpId: intent.clientOpId,
            method,
            invoice,
          },
        );
        const result = await readApiResponse(response);
        if (!result.ok) {
          setPaymentError(result.error.message ?? SELF_ORDER_VI.paymentFailed);
          if (
            result.error.code === "payment_intent_expired" ||
            result.error.code === "payment_completed" ||
            result.error.code === "session_not_active"
          ) {
            paymentIntentRef.current = clearClientIntent(
              paymentIntentRef.current,
              intent.clientOpId,
            );
          }
          if (shouldRefreshPaymentSnapshot(result.error.code)) {
            await refreshPaymentState();
          }
          if (isActivePaymentConflictCode(result.error.code)) {
            setActiveMainTab("bill");
          }
          return;
        }
        paymentIntentRef.current = clearClientIntent(
          paymentIntentRef.current,
          intent.clientOpId,
        );
        localPaymentSnapshotRef.current = snapshot;
        setLocalPaymentRequest(
          normalizePaymentRequest(result.payload, {
            method,
            amount: activeOrder.totalAmount,
          }),
        );
        await refreshPaymentState();
      } catch {
        setPaymentError(SELF_ORDER_VI.paymentFailed);
      } finally {
        setPendingPaymentMethod(null);
      }
    });
  }

  const handleCategoryChange = useCallback(
    (value: string) => {
      if (
        value !== "all" &&
        !(snapshot.menu ?? []).some((c) => String(c.id) === value)
      )
        return;
      setActiveCategoryValue(value);
    },
    [snapshot.menu],
  );

  useEffect(() => {
    if (activeCategoryValue === "all") return;
    const categoryStillAvailable = (snapshot.menu ?? []).some(
      (category) =>
        String(category.id) === activeCategoryValue &&
        category.menu_items.length > 0,
    );
    if (!categoryStillAvailable) setActiveCategoryValue("all");
  }, [activeCategoryValue, snapshot.menu]);

  const billBadgeCount = activeOrder?.items.length ?? billRoundCount;
  const showSessionPanel = isPendingApproval || isSessionRevoked || isClosed;

  if (terminalError) {
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
          <ItemContent className="items-center text-center">
            <ItemTitle className="text-lg">
              {SELF_ORDER_VI.unavailableTitle}
            </ItemTitle>
            <ItemDescription>{terminalError}</ItemDescription>
          </ItemContent>
        </Item>
      </AppPage>
    );
  }

  if (isHistoryRestorePending) {
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
          <ItemContent className="items-center text-center" aria-live="polite">
            <ItemTitle className="text-lg">
              {SELF_ORDER_VI.historyRestoreTitle}
            </ItemTitle>
            <ItemDescription>
              {refreshError
                ? SELF_ORDER_VI.historyRestoreFailed
                : SELF_ORDER_VI.historyRestoreDescription}
            </ItemDescription>
            <Button
              type="button"
              variant="outline"
              size="touch"
              disabled={isRefreshing}
              onClick={() => void refreshSnapshot()}
            >
              {isRefreshing ? <Spinner className="size-4" /> : null}
              {SELF_ORDER_VI.retryRefresh}
            </Button>
          </ItemContent>
        </Item>
      </AppPage>
    );
  }

  return (
    <AppPage
      as="main"
      id="main-content"
      width="narrow"
      density="compact"
      mobile
      className="min-h-dvh bg-background text-foreground"
      contentClassName="min-h-dvh"
    >
      <p className="sr-only" aria-live="polite">
        {ctaLabel}
      </p>
      <Tabs
        value={activeMainTab}
        onValueChange={setActiveMainTab}
        className="flex min-h-dvh w-full flex-col gap-1"
      >
        <header className="workflow-safe-pt sticky top-0 z-20 border-b border-border bg-background px-3 pb-2">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-1.5">
                <p className="min-w-0 truncate text-xs text-muted-foreground">
                  {snapshot.branch?.name ?? SELF_ORDER_VI.branchFallback}
                </p>
                <div className="shrink-0">
                  <StatusPill
                    session={snapshot.session}
                    paymentRequest={activePaymentRequest}
                    order={snapshot.order}
                  />
                </div>
              </div>
              <h1 className="font-heading truncate text-lg font-semibold">
                {snapshot.table
                  ? SELF_ORDER_VI.tableLabel(snapshot.table.number)
                  : SELF_ORDER_VI.menuTitle}
              </h1>
            </div>
            <TabsList className="h-11 w-full shrink-0 sm:w-44">
              <TabsTrigger value="menu" className="text-sm">
                {SELF_ORDER_VI.menuTitle}
              </TabsTrigger>
              <TabsTrigger
                value="bill"
                className="gap-1 text-sm"
                disabled={snapshot.canViewBill === false}
              >
                {SELF_ORDER_VI.billTab}
                {billBadgeCount > 0 ? (
                  <Badge variant="secondary" className="h-5 min-w-5 px-1">
                    {billBadgeCount}
                  </Badge>
                ) : null}
              </TabsTrigger>
            </TabsList>
          </div>
          {refreshError ? (
            <NoteCallout tone="warning" className="mt-2">
              <div className="flex items-center justify-between gap-2">
                <span>{refreshError}</span>
                <Button
                  type="button"
                  variant="outline"
                  size="touch"
                  disabled={isRefreshing}
                  onClick={() => void refreshPaymentState()}
                >
                  {SELF_ORDER_VI.retryRefresh}
                </Button>
              </div>
            </NoteCallout>
          ) : null}
        </header>

        <DeviceAccessPanel
          snapshot={snapshot}
          isPending={isDeviceActionPending}
          error={deviceActionError}
          onRequestJoin={requestDeviceJoin}
          onRefreshPairingCode={refreshPairingCode}
        />

        {showSessionPanel ? (
          <SessionStatePanel
            session={snapshot.session}
            order={snapshot.order}
            onViewBill={isClosed ? () => setActiveMainTab("bill") : undefined}
          />
        ) : null}

        <TabsContent
          value="menu"
          className="mt-0 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden"
        >
          <MenuPanel
            key={seatingEpoch}
            categories={snapshot.menu ?? []}
            activeCategoryValue={activeCategoryValue}
            onActiveCategoryChange={handleCategoryChange}
            onAdd={addItem}
            disabled={
              isPending ||
              activePaymentRequest !== null ||
              isCapabilityPending ||
              isDeviceAccessDenied ||
              snapshot.canSubmitBatch === false
            }
          />
        </TabsContent>

        <TabsContent
          value="bill"
          className="mt-0 min-h-0 flex-1 overflow-y-auto p-3 pb-44 sm:pb-32 data-[state=inactive]:hidden"
        >
          <div className="flex flex-col gap-3">
            <OrderSummary
              batches={batches}
              items={activeOrder?.items ?? []}
              totalAmount={activeOrder?.totalAmount}
            />
            {isSessionActive &&
            activeOrder &&
            snapshot.canRequestPayment !== false &&
            activeOrder.paymentStatus !== "paid" ? (
              <PaymentPanel
                disabled={activePaymentRequest !== null}
                activeOrder={activeOrder}
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
                onBuyerNotGetInvoiceChange={(value) => {
                  setBuyerNotGetInvoice(value);
                  if (value) {
                    setInvoiceFieldErrors({});
                    setInvoiceErrorFocusRequest(null);
                  }
                }}
                onBuyerNameChange={(value) => {
                  setBuyerName(value);
                  setInvoiceFieldErrors((current) => ({
                    ...current,
                    buyerName: undefined,
                  }));
                }}
                onBuyerTaxCodeChange={(value) => {
                  setBuyerTaxCode(normalizeTaxCodeInput(value));
                  setInvoiceFieldErrors((current) => ({
                    ...current,
                    buyerTaxCode: undefined,
                  }));
                }}
                onBuyerAddressChange={(value) => {
                  setBuyerAddress(value);
                  setInvoiceFieldErrors((current) => ({
                    ...current,
                    buyerAddress: undefined,
                  }));
                }}
                onBuyerEmailChange={(value) => {
                  setBuyerEmail(value);
                  setInvoiceFieldErrors((current) => ({
                    ...current,
                    buyerEmail: undefined,
                  }));
                }}
                onRequestPayment={requestPayment}
                onRefreshPayment={() => void refreshPaymentState()}
              />
            ) : null}
          </div>
        </TabsContent>
      </Tabs>
      <CartSheet
        items={cartItems}
        total={cartTotal}
        quantity={cartQuantity}
        isSubmitting={isPending}
        isEditingLocked={isSubmittedCapabilityPending}
        canSubmit={cartItems.length > 0}
        ctaLabel={ctaLabel}
        ctaDisabled={ctaHardDisabled}
        ctaDisabledHint={ctaDisabledHint}
        submitError={submitError}
        customerNote={customerNote}
        onCustomerNoteChange={(value) => {
          if (!isCartMutationLocked) setCustomerNote(value);
        }}
        onQuantityChange={updateQuantity}
        onRemove={removeItem}
        onSubmit={submitBatch}
      />
    </AppPage>
  );
}
