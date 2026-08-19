"use client";

import { useEffect, useRef, useState } from "react";
import {
  Banknote as IconCash,
  Landmark as IconBank,
  X as IconCancel,
} from "lucide-react";
import { SELF_ORDER_VI } from "@comtammatu/shared/messages";
import { formatVND } from "@comtammatu/shared/format";
import { formatVNTime } from "@comtammatu/shared/time";
import { Alert, AlertDescription } from "@comtammatu/ui/components/alert";
import { Button } from "@comtammatu/ui/components/button";
import { Checkbox } from "@comtammatu/ui/components/checkbox";
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@comtammatu/ui/components/field";
import { Input } from "@comtammatu/ui/components/input";
import { ScrollArea } from "@comtammatu/ui/components/scroll-area";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { PublicSection } from "@/components/surface";
import { QrCodeImage } from "@/components/qr-code-image";
import { SheetFooter } from "@/components/surface/app-sheet";
import {
  PROVEN_VIETQR_BANK_APP_ID,
  buildVietQrBankAppUrl,
  resolveBankAppPlatform,
} from "@lib/self-order/bank-app-link";
import type {
  PublicSelfOrderAvailableSnapshot,
  SelfOrderInvoicePayload,
} from "@lib/self-order/contracts";
import {
  isBusinessTaxCode,
  lookupBusinessTaxCode,
} from "@lib/hddt/business-tax-lookup";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface GuestPaymentRequestState {
  id?: number | null;
  clientOpId?: string | null;
  status: string;
  method: "cash_call" | "vietqr";
  amount: number;
  paymentId?: number | null;
  paymentCode?: string | null;
  qrData?: string | null;
  bankCode?: string | null;
  accountNo?: string | null;
  accountName?: string | null;
  createdAt?: string | null;
  expiresAt?: string | null;
}

export interface PaymentPanelProps {
  disabled: boolean;
  activeOrder: PublicSelfOrderAvailableSnapshot["order"];
  activePaymentRequest: GuestPaymentRequestState | null;
  isPending: boolean;
  isCancelling: boolean;
  pendingMethod: "cash_call" | "vietqr" | null;
  error: string | null;
  onRequestPayment: (
    method: "cash_call" | "vietqr",
    invoice: SelfOrderInvoicePayload,
  ) => void;
  onCancelVietQr: () => Promise<void>;
  onBankAppHandoff?: () => void;
}

type LookupStatus = "idle" | "loading" | "found" | "not-found" | "unavailable";

function BankAppLauncher({
  accountNo,
  bankCode,
  accountName,
  amount,
  paymentCode,
  qrData,
  onBankAppHandoff,
}: {
  accountNo: string;
  bankCode: string;
  accountName?: string | null;
  amount: number;
  paymentCode: string;
  qrData: string;
  onBankAppHandoff?: () => void;
}) {
  const href = buildVietQrBankAppUrl({
    appId: PROVEN_VIETQR_BANK_APP_ID,
    accountNo,
    bankCode,
    amount,
    paymentCode,
    accountName,
    qrData,
    platform: resolveBankAppPlatform(navigator),
  });
  if (!href) return null;

  return (
    <Button
      variant="outline"
      size="touch"
      className="w-full"
      render={<a href={href} />}
      onClick={() => onBankAppHandoff?.()}
    >
      <IconBank data-icon="inline-start" />
      {SELF_ORDER_VI.openMbBank}
    </Button>
  );
}

function lookupStatusMessage(status: LookupStatus) {
  if (status === "loading") return SELF_ORDER_VI.buyerTaxLookupLoading;
  if (status === "found") return SELF_ORDER_VI.buyerTaxLookupFound;
  if (status === "not-found") return SELF_ORDER_VI.buyerTaxLookupNotFound;
  if (status === "unavailable") return SELF_ORDER_VI.buyerTaxLookupUnavailable;
  return null;
}

export function PaymentPanel({
  disabled,
  activeOrder,
  activePaymentRequest,
  isPending,
  isCancelling,
  pendingMethod,
  error,
  onRequestPayment,
  onCancelVietQr,
  onBankAppHandoff,
}: PaymentPanelProps) {
  const [wantInvoice, setWantInvoice] = useState(false);
  const [taxCode, setTaxCode] = useState("");
  const [buyerName, setBuyerName] = useState("");
  const [buyerAddress, setBuyerAddress] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [lookupStatus, setLookupStatus] = useState<LookupStatus>("idle");
  const requestRef = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      requestRef.current?.abort();
    },
    [],
  );

  useEffect(() => {
    if (!wantInvoice) return;
    const normalized = taxCode.trim();
    if (!isBusinessTaxCode(normalized)) {
      setLookupStatus(normalized.length === 0 ? "idle" : "not-found");
      return;
    }

    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    const timer = window.setTimeout(() => {
      void (async () => {
        setLookupStatus("loading");
        try {
          const business = await lookupBusinessTaxCode(
            normalized,
            controller.signal,
          );
          if (controller.signal.aborted) return;
          if (!business) {
            setLookupStatus("not-found");
            return;
          }
          setBuyerName(business.name);
          setBuyerAddress(business.address);
          setLookupStatus("found");
        } catch {
          if (controller.signal.aborted) return;
          setLookupStatus("unavailable");
        }
      })();
    }, 400);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [taxCode, wantInvoice]);

  if (!activeOrder) {
    return (
      <div className="px-3 py-4 sm:px-4">
        <PublicSection
          title={SELF_ORDER_VI.billEmptyTitle}
          description={SELF_ORDER_VI.billEmptyDescription}
          size="sm"
        >
          <p className="text-sm text-muted-foreground">
            {SELF_ORDER_VI.cartEmpty}
          </p>
        </PublicSection>
      </div>
    );
  }

  const isVietQrPending = activePaymentRequest?.status === "vietqr_pending";
  const hasRecoverableVietQr =
    isVietQrPending &&
    Boolean(activePaymentRequest.qrData) &&
    Boolean(activePaymentRequest.paymentCode);
  const expiryLabel = formatVNTime(activePaymentRequest?.expiresAt, "") || null;
  const emailTrim = buyerEmail.trim();
  const emailInvalid = emailTrim.length > 0 && !EMAIL_PATTERN.test(emailTrim);
  const invoiceReady =
    lookupStatus === "found" &&
    buyerName.trim().length > 0 &&
    buyerAddress.trim().length > 0 &&
    EMAIL_PATTERN.test(emailTrim);
  const canPay = !disabled && !isPending && (!wantInvoice || invoiceReady);
  const lookupMessage = lookupStatusMessage(lookupStatus);

  function invoicePayload(): SelfOrderInvoicePayload {
    if (!wantInvoice) return { buyerNotGetInvoice: true };
    return {
      buyerNotGetInvoice: false,
      buyerKind: "business",
      buyerTaxCode: taxCode.trim(),
      buyerName: buyerName.trim(),
      buyerAddress: buyerAddress.trim(),
      buyerEmail: emailTrim,
    };
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ScrollArea className="min-h-0 flex-1 overflow-hidden overscroll-contain">
        <div className="flex flex-col gap-4 px-3 py-4 sm:px-4">
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          {activePaymentRequest ? (
            <div className="flex flex-col gap-3" aria-live="polite">
              {expiryLabel ? (
                <p className="text-xs text-muted-foreground">
                  {SELF_ORDER_VI.paymentExpiresAt(expiryLabel)}
                </p>
              ) : null}

              {hasRecoverableVietQr ? (
                <div className="flex flex-col items-center gap-3 rounded-md bg-muted/30 p-3 text-center">
                  <h3 className="font-heading text-sm font-semibold">
                    {SELF_ORDER_VI.vietQrPendingTitle}
                  </h3>
                  <QrCodeImage
                    value={activePaymentRequest.qrData ?? ""}
                    alt={SELF_ORDER_VI.vietQrPendingTitle}
                    className="size-64 max-w-full"
                    errorMessage={SELF_ORDER_VI.qrRenderFailed}
                    retryLabel={SELF_ORDER_VI.retryQr}
                    downloadLabel={SELF_ORDER_VI.saveVietQr}
                    downloadName="ma-qr-thanh-toan-ma-tu.png"
                  >
                    {activePaymentRequest.accountNo &&
                    activePaymentRequest.bankCode &&
                    activePaymentRequest.paymentCode ? (
                      <BankAppLauncher
                        accountNo={activePaymentRequest.accountNo}
                        bankCode={activePaymentRequest.bankCode}
                        accountName={activePaymentRequest.accountName}
                        amount={activePaymentRequest.amount}
                        paymentCode={activePaymentRequest.paymentCode}
                        qrData={activePaymentRequest.qrData ?? ""}
                        onBankAppHandoff={onBankAppHandoff}
                      />
                    ) : null}
                  </QrCodeImage>
                  <p className="text-sm text-muted-foreground">
                    {SELF_ORDER_VI.otherBankScanHint}
                  </p>
                  <div className="flex flex-col gap-1 text-sm">
                    <p className="font-mono font-bold tabular-nums">
                      {formatVND(activePaymentRequest.amount)}
                    </p>
                    <p className="break-all font-mono tabular-nums text-muted-foreground">
                      {activePaymentRequest.paymentCode}
                    </p>
                    {activePaymentRequest.accountNo ? (
                      <p className="break-all font-mono tabular-nums text-muted-foreground">
                        {activePaymentRequest.bankCode} ·{" "}
                        {activePaymentRequest.accountNo}
                      </p>
                    ) : null}
                    {activePaymentRequest.accountName ? (
                      <p className="text-muted-foreground">
                        {activePaymentRequest.accountName}
                      </p>
                    ) : null}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="touch"
                    className="w-full"
                    disabled={isCancelling}
                    onClick={() => void onCancelVietQr()}
                  >
                    {isCancelling ? (
                      <Spinner className="size-4" />
                    ) : (
                      <IconCancel data-icon="inline-start" />
                    )}
                    {SELF_ORDER_VI.cancelVietQr}
                  </Button>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <Field orientation="horizontal">
                <Checkbox
                  id="self-order-vat-invoice"
                  size="touch"
                  checked={wantInvoice}
                  disabled={disabled || isPending}
                  onCheckedChange={(checked) => {
                    const next = checked === true;
                    setWantInvoice(next);
                    if (!next) {
                      requestRef.current?.abort();
                      setTaxCode("");
                      setBuyerName("");
                      setBuyerAddress("");
                      setBuyerEmail("");
                      setLookupStatus("idle");
                    }
                  }}
                />
                <FieldLabel htmlFor="self-order-vat-invoice">
                  {SELF_ORDER_VI.issueVatInvoice}
                </FieldLabel>
              </Field>

              {wantInvoice ? (
                <div className="flex flex-col gap-3">
                  <Field>
                    <FieldLabel htmlFor="self-order-tax-code">
                      {SELF_ORDER_VI.buyerTaxCode}
                    </FieldLabel>
                    <Input
                      id="self-order-tax-code"
                      name="taxCode"
                      controlSize="touch"
                      inputMode="numeric"
                      autoComplete="off"
                      spellCheck={false}
                      maxLength={14}
                      value={taxCode}
                      disabled={disabled || isPending}
                      onChange={(event) => {
                        setTaxCode(event.target.value.trim());
                        setBuyerName("");
                        setBuyerAddress("");
                      }}
                    />
                    {lookupMessage ? (
                      <FieldDescription role="status">
                        {lookupStatus === "loading" ? (
                          <span className="inline-flex items-center gap-2">
                            <Spinner className="size-3.5" />
                            {lookupMessage}
                          </span>
                        ) : (
                          lookupMessage
                        )}
                      </FieldDescription>
                    ) : (
                      <FieldDescription>
                        {SELF_ORDER_VI.buyerBusinessHint}
                      </FieldDescription>
                    )}
                  </Field>

                  {buyerName || lookupStatus === "found" ? (
                    <div className="flex flex-col gap-1 text-sm">
                      <p className="text-muted-foreground">
                        {SELF_ORDER_VI.companyName}
                      </p>
                      <p className="font-medium">{buyerName || "—"}</p>
                    </div>
                  ) : null}

                  {buyerAddress || lookupStatus === "found" ? (
                    <div className="flex flex-col gap-1 text-sm">
                      <p className="text-muted-foreground">
                        {SELF_ORDER_VI.companyAddress}
                      </p>
                      <p className="font-medium">{buyerAddress || "—"}</p>
                    </div>
                  ) : null}

                  <Field>
                    <FieldLabel htmlFor="self-order-buyer-email">
                      {SELF_ORDER_VI.buyerEmail}
                    </FieldLabel>
                    <Input
                      id="self-order-buyer-email"
                      name="buyerEmail"
                      controlSize="touch"
                      type="email"
                      autoComplete="email"
                      inputMode="email"
                      value={buyerEmail}
                      disabled={disabled || isPending}
                      aria-invalid={emailInvalid}
                      onChange={(event) => setBuyerEmail(event.target.value)}
                    />
                    {emailInvalid ? (
                      <FieldDescription>
                        {SELF_ORDER_VI.buyerEmailInvalid}
                      </FieldDescription>
                    ) : null}
                  </Field>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </ScrollArea>

      {activePaymentRequest ? null : (
        <SheetFooter className="workflow-safe-pb shrink-0 border-border bg-card p-4">
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              size="touch-lg"
              disabled={!canPay}
              onClick={() => onRequestPayment("cash_call", invoicePayload())}
            >
              {pendingMethod === "cash_call" ? (
                <Spinner className="size-4" />
              ) : (
                <IconCash data-icon="inline-start" />
              )}
              {SELF_ORDER_VI.cashCall}
            </Button>
            <Button
              type="button"
              size="touch-lg"
              disabled={!canPay}
              onClick={() => onRequestPayment("vietqr", invoicePayload())}
            >
              {pendingMethod === "vietqr" ? (
                <Spinner className="size-4" />
              ) : (
                <IconBank data-icon="inline-start" />
              )}
              {SELF_ORDER_VI.bankTransfer}
            </Button>
          </div>
        </SheetFooter>
      )}
    </div>
  );
}
