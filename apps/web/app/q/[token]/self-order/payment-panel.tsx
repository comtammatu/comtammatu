"use client";

import { useEffect, useRef } from "react";
import {
  Banknote as IconCash,
  CreditCard as IconPayment,
  QrCode as IconQrcode,
  ReceiptText as IconReceipt,
} from "lucide-react";
import { SELF_ORDER_VI } from "@comtammatu/shared/messages";
import { formatVND } from "@comtammatu/shared/format";
import { formatVNTime } from "@comtammatu/shared/time";
import { Button } from "@comtammatu/ui/components/button";
import { Checkbox } from "@comtammatu/ui/components/checkbox";
import { Input } from "@comtammatu/ui/components/input";
import { Label } from "@comtammatu/ui/components/label";
import { Field, FieldError, FieldLabel } from "@comtammatu/ui/components/field";
import { Alert, AlertDescription } from "@comtammatu/ui/components/alert";
import { NoteCallout } from "@comtammatu/ui/components/note-callout";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { AppSection } from "@/components/surface";
import { QrCodeImage } from "@/components/qr-code-image";
import type { PublicSelfOrderSnapshot } from "@lib/self-order/contracts";

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

export type InvoiceFieldErrors = Partial<
  Record<"buyerName" | "buyerTaxCode" | "buyerAddress" | "buyerEmail", string>
>;

export interface InvoiceErrorFocusRequest {
  attempt: number;
  field: keyof InvoiceFieldErrors;
}

export interface PaymentPanelProps {
  disabled: boolean;
  activeOrder: PublicSelfOrderSnapshot["order"] | null;
  activePaymentRequest: GuestPaymentRequestState | null;
  buyerNotGetInvoice: boolean;
  buyerName: string;
  buyerTaxCode: string;
  buyerAddress: string;
  buyerEmail: string;
  isPending: boolean;
  pendingMethod: "cash_call" | "vietqr" | null;
  isRefreshing: boolean;
  error: string | null;
  fieldErrors: InvoiceFieldErrors;
  errorFocusRequest: InvoiceErrorFocusRequest | null;
  onBuyerNotGetInvoiceChange: (value: boolean) => void;
  onBuyerNameChange: (value: string) => void;
  onBuyerTaxCodeChange: (value: string) => void;
  onBuyerAddressChange: (value: string) => void;
  onBuyerEmailChange: (value: string) => void;
  onRequestPayment: (method: "cash_call" | "vietqr") => void;
  onRefreshPayment: () => void;
}

export function PaymentPanel({
  disabled,
  activeOrder,
  activePaymentRequest,
  buyerNotGetInvoice,
  buyerName,
  buyerTaxCode,
  buyerAddress,
  buyerEmail,
  isPending,
  pendingMethod,
  isRefreshing,
  error,
  fieldErrors,
  errorFocusRequest,
  onBuyerNotGetInvoiceChange,
  onBuyerNameChange,
  onBuyerTaxCodeChange,
  onBuyerAddressChange,
  onBuyerEmailChange,
  onRequestPayment,
  onRefreshPayment,
}: PaymentPanelProps) {
  const buyerNameRef = useRef<HTMLInputElement>(null);
  const buyerTaxCodeRef = useRef<HTMLInputElement>(null);
  const buyerAddressRef = useRef<HTMLInputElement>(null);
  const buyerEmailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const target =
      errorFocusRequest?.field === "buyerName"
        ? buyerNameRef.current
        : errorFocusRequest?.field === "buyerTaxCode"
          ? buyerTaxCodeRef.current
          : errorFocusRequest?.field === "buyerAddress"
            ? buyerAddressRef.current
            : errorFocusRequest?.field === "buyerEmail"
              ? buyerEmailRef.current
              : null;
    target?.focus();
  }, [errorFocusRequest]);

  if (!activeOrder) {
    return (
      <AppSection
        title={SELF_ORDER_VI.billEmptyTitle}
        description={SELF_ORDER_VI.billEmptyDescription}
        icon={<IconReceipt />}
        size="sm"
      >
        <p className="text-sm text-muted-foreground">
          {SELF_ORDER_VI.cartEmpty}
        </p>
      </AppSection>
    );
  }

  const isCashCall = activePaymentRequest?.status === "cash_call";
  const isVietQrPending = activePaymentRequest?.status === "vietqr_pending";
  const hasRecoverableVietQr =
    isVietQrPending &&
    Boolean(activePaymentRequest.qrData) &&
    Boolean(activePaymentRequest.paymentCode);
  const canCreateVietQr =
    activeOrder.status === "ready" || activeOrder.status === "served";
  const expiryLabel = formatVNTime(activePaymentRequest?.expiresAt, "") || null;

  const buyerDetails = (
    <AppSection
      title={SELF_ORDER_VI.buyerTitle}
      description={SELF_ORDER_VI.buyerDescription}
      icon={<IconReceipt />}
      size="sm"
    >
      <>
        <div className="flex items-center gap-2 rounded-md bg-muted/30 p-3">
          <Checkbox
            id="self-order-buyer-not-get-invoice"
            size="touch"
            checked={buyerNotGetInvoice}
            disabled={disabled || isPending}
            onCheckedChange={(value) => {
              onBuyerNotGetInvoiceChange(value === true);
            }}
          />
          <Label htmlFor="self-order-buyer-not-get-invoice" className="text-sm">
            {SELF_ORDER_VI.buyerNoInvoice}
          </Label>
        </div>
        {!buyerNotGetInvoice ? (
          <div className="grid gap-3">
            <Field data-invalid={Boolean(fieldErrors.buyerName)}>
              <FieldLabel htmlFor="self-order-buyer-name">
                {SELF_ORDER_VI.buyerName}
              </FieldLabel>
              <Input
                ref={buyerNameRef}
                id="self-order-buyer-name"
                name="buyerName"
                className="h-12 text-base"
                autoComplete="name"
                value={buyerName}
                disabled={disabled || isPending}
                aria-invalid={Boolean(fieldErrors.buyerName)}
                aria-describedby={
                  fieldErrors.buyerName
                    ? "self-order-buyer-name-error"
                    : undefined
                }
                placeholder={SELF_ORDER_VI.buyerName}
                onChange={(event) => onBuyerNameChange(event.target.value)}
              />
              <FieldError id="self-order-buyer-name-error">
                {fieldErrors.buyerName}
              </FieldError>
            </Field>
            <Field data-invalid={Boolean(fieldErrors.buyerTaxCode)}>
              <FieldLabel htmlFor="self-order-buyer-tax-code">
                {SELF_ORDER_VI.buyerTaxCode}
              </FieldLabel>
              <Input
                ref={buyerTaxCodeRef}
                id="self-order-buyer-tax-code"
                name="buyerTaxCode"
                className="h-12 font-mono text-base"
                inputMode="numeric"
                maxLength={14}
                autoComplete="off"
                spellCheck={false}
                value={buyerTaxCode}
                disabled={disabled || isPending}
                aria-invalid={Boolean(fieldErrors.buyerTaxCode)}
                aria-describedby={
                  fieldErrors.buyerTaxCode
                    ? "self-order-buyer-tax-code-error"
                    : undefined
                }
                placeholder="0123456789"
                onChange={(event) => onBuyerTaxCodeChange(event.target.value)}
              />
              <FieldError id="self-order-buyer-tax-code-error">
                {fieldErrors.buyerTaxCode}
              </FieldError>
            </Field>
            <Field data-invalid={Boolean(fieldErrors.buyerAddress)}>
              <FieldLabel htmlFor="self-order-buyer-address">
                {SELF_ORDER_VI.buyerAddress}
              </FieldLabel>
              <Input
                ref={buyerAddressRef}
                id="self-order-buyer-address"
                name="buyerAddress"
                className="h-12 text-base"
                autoComplete="street-address"
                value={buyerAddress}
                disabled={disabled || isPending}
                aria-invalid={Boolean(fieldErrors.buyerAddress)}
                aria-describedby={
                  fieldErrors.buyerAddress
                    ? "self-order-buyer-address-error"
                    : undefined
                }
                placeholder={SELF_ORDER_VI.buyerAddress}
                onChange={(event) => onBuyerAddressChange(event.target.value)}
              />
              <FieldError id="self-order-buyer-address-error">
                {fieldErrors.buyerAddress}
              </FieldError>
            </Field>
            <Field data-invalid={Boolean(fieldErrors.buyerEmail)}>
              <FieldLabel htmlFor="self-order-buyer-email">
                {SELF_ORDER_VI.buyerEmail}
              </FieldLabel>
              <Input
                ref={buyerEmailRef}
                id="self-order-buyer-email"
                name="buyerEmail"
                className="h-12 text-base"
                type="email"
                autoComplete="email"
                spellCheck={false}
                value={buyerEmail}
                disabled={disabled || isPending}
                aria-invalid={Boolean(fieldErrors.buyerEmail)}
                aria-describedby={
                  fieldErrors.buyerEmail
                    ? "self-order-buyer-email-error"
                    : undefined
                }
                placeholder="email@example.com"
                onChange={(event) => onBuyerEmailChange(event.target.value)}
              />
              <FieldError id="self-order-buyer-email-error">
                {fieldErrors.buyerEmail}
              </FieldError>
            </Field>
            <p className="text-xs text-muted-foreground">
              {SELF_ORDER_VI.buyerBusinessHint}
            </p>
          </div>
        ) : null}
      </>
    </AppSection>
  );

  return (
    <section className="flex flex-col gap-3">
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <AppSection
        title={SELF_ORDER_VI.paymentTitle}
        description={SELF_ORDER_VI.paymentDescription}
        icon={<IconPayment />}
        badge={{
          children: formatVND(
            activePaymentRequest?.amount ?? activeOrder.totalAmount,
          ),
          variant: "outline",
        }}
        size="sm"
      >
        <>
          {activePaymentRequest ? (
            <div className="flex flex-col gap-3" aria-live="polite">
              <NoteCallout
                tone="warning"
                icon={isCashCall ? <IconCash /> : <IconQrcode />}
                label={
                  isCashCall
                    ? SELF_ORDER_VI.statusAwaitingCash
                    : SELF_ORDER_VI.statusAwaitingVietQr
                }
              >
                <span className="block">
                  {isCashCall
                    ? SELF_ORDER_VI.cashCallOk
                    : SELF_ORDER_VI.activePaymentIntent}
                </span>
                <span className="mt-1 block font-normal">
                  {SELF_ORDER_VI.paymentCancelStaffRequired}
                </span>
              </NoteCallout>
              {expiryLabel ? (
                <p className="text-xs text-muted-foreground">
                  {SELF_ORDER_VI.paymentExpiresAt(expiryLabel)}
                </p>
              ) : null}

              {hasRecoverableVietQr ? (
                <div className="flex flex-col items-center gap-3 rounded-md bg-muted/30 p-3 text-center">
                  <div className="flex flex-col gap-1">
                    <h3 className="font-heading text-sm font-semibold">
                      {SELF_ORDER_VI.vietQrPendingTitle}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {SELF_ORDER_VI.vietQrPendingDescription}
                    </p>
                  </div>
                  <QrCodeImage
                    value={activePaymentRequest.qrData ?? ""}
                    alt={SELF_ORDER_VI.vietQrPendingTitle}
                    className="size-64 max-w-full"
                    errorMessage={SELF_ORDER_VI.qrRenderFailed}
                    retryLabel={SELF_ORDER_VI.retryQr}
                  />
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
                </div>
              ) : null}

              <Button
                type="button"
                variant="outline"
                size="touch"
                disabled={isRefreshing}
                onClick={onRefreshPayment}
              >
                {isRefreshing ? <Spinner className="size-4" /> : null}
                {SELF_ORDER_VI.retryRefresh}
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2">
              <Button
                type="button"
                variant="outline"
                size="touch"
                disabled={disabled || isPending}
                onClick={() => onRequestPayment("cash_call")}
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
                size="touch"
                disabled={disabled || isPending || !canCreateVietQr}
                onClick={() => onRequestPayment("vietqr")}
              >
                {pendingMethod === "vietqr" ? (
                  <Spinner className="size-4" />
                ) : (
                  <IconQrcode data-icon="inline-start" />
                )}
                {SELF_ORDER_VI.vietQrCreate}
              </Button>
              {!canCreateVietQr ? (
                <NoteCallout tone="muted">
                  {SELF_ORDER_VI.paymentNotReady}
                </NoteCallout>
              ) : null}
            </div>
          )}
        </>
      </AppSection>
      {activePaymentRequest ? null : buyerDetails}
    </section>
  );
}
