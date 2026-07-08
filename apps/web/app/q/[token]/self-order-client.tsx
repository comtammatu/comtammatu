"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { RefreshCw as IconRefresh } from "lucide-react";
import { SELF_ORDER_VI } from "@comtammatu/shared/messages";
import { Button } from "@comtammatu/ui/components/button";
import { Alert, AlertDescription } from "@comtammatu/ui/components/alert";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@comtammatu/ui/components/tabs";
import { AppPage } from "@/components/surface";
import { confirm } from "@comtammatu/ui/components/confirm-dialog";
import type {
  PublicSelfOrderSnapshot,
  SelfOrderCartItem,
} from "@lib/self-order/contracts";
import { useSnapshotSync } from "./self-order/hooks";
import { StatusPill } from "./self-order/status-pill";
import { OrderSummary } from "./self-order/order-summary";
import { MenuPanel } from "./self-order/menu-panel";
import { CartSheet } from "./self-order/cart-sheet";
import { PaymentPanel, type VietQrState } from "./self-order/payment-panel";

interface SelfOrderClientProps {
  token: string;
  initialSnapshot: PublicSelfOrderSnapshot;
}

const TAX_CODE_PATTERN = /^\d{10}(-\d{3})?$/;

function newClientOpId() {
  return crypto.randomUUID();
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
  if (response.ok && payload?.ok !== false)
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

export function SelfOrderClient({
  token,
  initialSnapshot,
}: SelfOrderClientProps) {
  const { snapshot, refreshSnapshot } = useSnapshotSync(token, initialSnapshot);
  const [cartItems, setCartItems] = useState<SelfOrderCartItem[]>([]);
  const [customerNote, setCustomerNote] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [vietQr, setVietQr] = useState<VietQrState | null>(null);
  const [buyerNotGetInvoice, setBuyerNotGetInvoice] = useState(true);
  const [buyerName, setBuyerName] = useState("");
  const [buyerTaxCode, setBuyerTaxCode] = useState("");
  const [buyerAddress, setBuyerAddress] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [activeCategoryValue, setActiveCategoryValue] = useState("all");
  const [activeMainTab, setActiveMainTab] = useState("menu");
  const [isPending, startTransition] = useTransition();
  const [isPaymentPending, startPaymentTransition] = useTransition();

  const cartTotal = useMemo(
    () => cartItems.reduce((sum, item) => sum + lineTotal(item), 0),
    [cartItems],
  );
  const cartQuantity = useMemo(
    () => cartItems.reduce((sum, item) => sum + item.quantity, 0),
    [cartItems],
  );

  const sessionStatus = snapshot.session?.status ?? null;
  const isSessionActive = sessionStatus === "active";
  const isPendingApproval = sessionStatus === "pending_approval";
  const activeOrder = snapshot.order ?? null;
  // Closed: order paid/terminal OR a closed session. The snapshot RPC only
  // surfaces pending_approval/active sessions, so the realistic terminal
  // signal here is a paid order on an active session.
  const isClosed =
    sessionStatus === "closed" || activeOrder?.paymentStatus === "paid";
  const hasBillTab = Boolean(activeOrder || paymentError || vietQr);

  // CTA state (fix I). Two distinct disable tiers:
  //  - ctaHardDisabled: pending_approval (cannot submit a 2nd batch) or closed.
  //    The button is truly disabled.
  //  - paymentLocked (pending VietQR/cash_call): the button stays clickable so
  //    the customer can still submit, hit the pending_payment_exists branch,
  //    and choose to cancel the QR + add more. Blocking here would regress V1.
  // paymentLocked is intentionally NOT computed as a guard: submitBatch must
  // stay reachable so the cancel-then-add flow works.
  const ctaHardDisabled = isClosed || isPendingApproval;
  const ctaLabel = isClosed
    ? SELF_ORDER_VI.statusClosed
    : isPendingApproval
      ? SELF_ORDER_VI.ctaAwaitingApproval
      : isSessionActive
        ? SELF_ORDER_VI.submitAddMore
        : SELF_ORDER_VI.submitFirstBatch;
  const ctaDisabledHint = isPendingApproval
    ? SELF_ORDER_VI.ctaAwaitingApprovalHint
    : null;

  function addItem(cartItem: SelfOrderCartItem) {
    setSubmitError(null);
    setCartItems((current) => [...current, cartItem]);
  }

  function updateQuantity(key: string, delta: number) {
    setCartItems((current) =>
      current
        .map((item) =>
          item.key === key
            ? { ...item, quantity: Math.max(1, item.quantity + delta) }
            : item,
        )
        .filter((item) => item.quantity > 0),
    );
  }

  function removeItem(key: string) {
    setCartItems((current) => current.filter((item) => item.key !== key));
  }

  function buildInvoicePayload() {
    if (buyerNotGetInvoice) return { buyerNotGetInvoice: true };
    const taxCode = buyerTaxCode.trim();
    if (taxCode && !TAX_CODE_PATTERN.test(taxCode)) {
      return { error: SELF_ORDER_VI.buyerTaxInvalid } as const;
    }
    if (taxCode && (!buyerName.trim() || !buyerAddress.trim())) {
      return { error: SELF_ORDER_VI.buyerBusinessMissing } as const;
    }
    return {
      buyerNotGetInvoice: false,
      buyerName: buyerName.trim() || undefined,
      buyerTaxCode: taxCode || undefined,
      buyerAddress: buyerAddress.trim() || undefined,
      buyerEmail: buyerEmail.trim() || undefined,
    };
  }

  async function postBatch(path: string) {
    return fetch(`/api/self-order/${encodeURIComponent(token)}/${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        clientOpId: newClientOpId(),
        items: cartItems,
        customerNote: customerNote.trim() || undefined,
      }),
    });
  }

  function submitBatch() {
    // Guard only on hard-disabled states. paymentLocked must NOT block here,
    // otherwise the pending_payment_exists -> cancel-then-add flow (V1) is
    // unreachable.
    if (cartItems.length === 0 || isPending || ctaHardDisabled) return;
    setSubmitError(null);
    startTransition(async () => {
      const response = await postBatch("batches");
      const result = await readApiResponse(response);
      if (!result.ok && result.error.code === "pending_payment_exists") {
        const confirmed = await confirm({
          title: SELF_ORDER_VI.pendingPaymentBlocked,
          description: SELF_ORDER_VI.pendingPaymentConfirm,
          confirmText: SELF_ORDER_VI.submitAddMore,
          cancelText: SELF_ORDER_VI.keepPendingPayment,
        });
        if (!confirmed) {
          setSubmitError(
            result.error.message ?? SELF_ORDER_VI.pendingPaymentBlocked,
          );
          return;
        }
        const cancelResponse = await postBatch(
          "cancel-pending-payment-and-add",
        );
        const cancelResult = await readApiResponse(cancelResponse);
        if (!cancelResult.ok) {
          setSubmitError(
            cancelResult.error.message ?? SELF_ORDER_VI.submitFailed,
          );
          await refreshSnapshot();
          return;
        }
        setCartItems([]);
        setCustomerNote("");
        setVietQr(null);
        await refreshSnapshot();
        return;
      }
      if (!result.ok) {
        setSubmitError(result.error.message ?? SELF_ORDER_VI.submitFailed);
        return;
      }
      setCartItems([]);
      setCustomerNote("");
      await refreshSnapshot();
    });
  }

  function requestPayment(method: "cash_call" | "vietqr") {
    if (!isSessionActive || isPaymentPending) return;
    setPaymentError(null);
    startPaymentTransition(async () => {
      const invoice = buildInvoicePayload();
      if ("error" in invoice) {
        setPaymentError(invoice.error ?? SELF_ORDER_VI.paymentFailed);
        return;
      }
      const response = await fetch(
        `/api/self-order/${encodeURIComponent(token)}/payment`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            clientOpId: newClientOpId(),
            method,
            invoice,
          }),
        },
      );
      const result = await readApiResponse(response);
      if (!result.ok) {
        setPaymentError(result.error.message ?? SELF_ORDER_VI.paymentFailed);
        return;
      }
      if (method === "vietqr") {
        setVietQr(result.payload as unknown as VietQrState);
      } else {
        setVietQr(null);
      }
      await refreshSnapshot();
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

  return (
    <AppPage
      width="narrow"
      density="compact"
      mobile
      className="min-h-dvh bg-background text-foreground"
      contentClassName="min-h-dvh"
    >
      <Tabs
        value={hasBillTab ? activeMainTab : "menu"}
        onValueChange={setActiveMainTab}
        className="flex min-h-dvh w-full flex-col gap-1"
      >
        <header className="sticky top-0 z-20 border-b border-border bg-background px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-xs text-muted-foreground">
                {snapshot.branch?.name ?? SELF_ORDER_VI.branchFallback}
              </p>
              <h1 className="font-heading truncate text-lg font-semibold">
                {snapshot.table
                  ? SELF_ORDER_VI.tableLabel(snapshot.table.number)
                  : SELF_ORDER_VI.menuTitle}
              </h1>
            </div>
            <div className="flex items-center gap-1.5">
              <StatusPill
                session={snapshot.session}
                paymentRequest={snapshot.paymentRequest}
                order={snapshot.order}
              />
              <Button
                type="button"
                variant="outline"
                size="icon-touch"
                onClick={() => void refreshSnapshot()}
                aria-label="refresh"
              >
                <IconRefresh />
              </Button>
            </div>
          </div>
          {hasBillTab ? (
            <TabsList className="mt-2 h-10 w-full">
              <TabsTrigger value="menu" className="text-sm">
                {SELF_ORDER_VI.menuTitle}
              </TabsTrigger>
              <TabsTrigger value="bill" className="text-sm">
                {SELF_ORDER_VI.billTab}
              </TabsTrigger>
            </TabsList>
          ) : null}
        </header>

        <TabsContent
          value="menu"
          className="mt-0 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden"
        >
          <MenuPanel
            categories={snapshot.menu ?? []}
            activeCategoryValue={activeCategoryValue}
            onActiveCategoryChange={handleCategoryChange}
            onAdd={addItem}
          />
        </TabsContent>

        {hasBillTab ? (
          <TabsContent
            value="bill"
            className="mt-0 min-h-0 flex-1 overflow-y-auto p-3 pb-32 data-[state=inactive]:hidden"
          >
            <div className="flex flex-col gap-3">
              {activeOrder ? <OrderSummary items={activeOrder.items} /> : null}
              <PaymentPanel
                disabled={!isSessionActive}
                activeOrder={activeOrder}
                buyerNotGetInvoice={buyerNotGetInvoice}
                buyerName={buyerName}
                buyerTaxCode={buyerTaxCode}
                buyerAddress={buyerAddress}
                buyerEmail={buyerEmail}
                isPending={isPaymentPending}
                error={paymentError}
                vietQr={vietQr}
                onBuyerNotGetInvoiceChange={setBuyerNotGetInvoice}
                onBuyerNameChange={setBuyerName}
                onBuyerTaxCodeChange={setBuyerTaxCode}
                onBuyerAddressChange={setBuyerAddress}
                onBuyerEmailChange={setBuyerEmail}
                onRequestPayment={requestPayment}
              />
            </div>
          </TabsContent>
        ) : null}
      </Tabs>
      <CartSheet
        items={cartItems}
        total={cartTotal}
        quantity={cartQuantity}
        isSubmitting={isPending}
        canSubmit={cartItems.length > 0}
        ctaLabel={ctaLabel}
        ctaDisabled={ctaHardDisabled}
        ctaDisabledHint={ctaDisabledHint}
        customerNote={customerNote}
        onCustomerNoteChange={setCustomerNote}
        onQuantityChange={updateQuantity}
        onRemove={removeItem}
        onSubmit={submitBatch}
      />
      {submitError ? (
        <Alert
          variant="destructive"
          className="fixed inset-x-3 bottom-24 z-40 mx-auto max-w-xl"
        >
          <AlertDescription>{submitError}</AlertDescription>
        </Alert>
      ) : null}
    </AppPage>
  );
}
