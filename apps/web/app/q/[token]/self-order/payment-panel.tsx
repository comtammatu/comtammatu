"use client";

import { useEffect, useRef, useState } from "react";
import {
  Banknote as IconCash,
  Landmark as IconBank,
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
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@comtammatu/ui/components/avatar";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@comtammatu/ui/components/drawer";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { AppSection } from "@/components/surface";
import { QrCodeImage } from "@/components/qr-code-image";
import {
  buildVietQrBankAppUrl,
  parseVietQrBankApps,
  VIETQR_BANK_APP_CATALOG_URL,
  type VietQrBankApp,
} from "@lib/self-order/bank-app-link";
import type { PublicSelfOrderAvailableSnapshot } from "@lib/self-order/contracts";

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
  activeOrder: PublicSelfOrderAvailableSnapshot["order"];
  activePaymentRequest: GuestPaymentRequestState | null;
  buyerNotGetInvoice: boolean;
  buyerName: string;
  buyerTaxCode: string;
  buyerAddress: string;
  buyerEmail: string;
  isPending: boolean;
  pendingMethod: "cash_call" | "vietqr" | null;
  error: string | null;
  fieldErrors: InvoiceFieldErrors;
  errorFocusRequest: InvoiceErrorFocusRequest | null;
  onBuyerNotGetInvoiceChange: (value: boolean) => void;
  onBuyerNameChange: (value: string) => void;
  onBuyerTaxCodeChange: (value: string) => void;
  onBuyerAddressChange: (value: string) => void;
  onBuyerEmailChange: (value: string) => void;
  onRequestPayment: (method: "cash_call" | "vietqr") => void;
}

function BankAppLauncher({
  accountNo,
  bankCode,
  accountName,
  amount,
  paymentCode,
  qrData,
}: {
  accountNo: string;
  bankCode: string;
  accountName?: string | null;
  amount: number;
  paymentCode: string;
  qrData: string;
}) {
  const [open, setOpen] = useState(false);
  const [apps, setApps] = useState<VietQrBankApp[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    if (!open || apps !== null) return;
    const controller = new AbortController();
    setLoadFailed(false);

    void fetch(VIETQR_BANK_APP_CATALOG_URL, {
      cache: "force-cache",
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error("bank_app_catalog_unavailable");
        return response.json() as Promise<unknown>;
      })
      .then((payload) => {
        const parsedApps = parseVietQrBankApps(payload);
        setApps([
          { id: "momo", name: "MoMo", logoUrl: null },
          { id: "msb", name: "MSB", logoUrl: null },
          ...parsedApps.filter(
            (app) => app.id !== "momo" && app.id !== "msb",
          ),
        ]);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError")
          return;
        setLoadFailed(true);
      });

    return () => controller.abort();
  }, [apps, loadAttempt, open]);

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <Button type="button" size="touch" className="w-full">
          <IconBank data-icon="inline-start" />
          {SELF_ORDER_VI.openBankApp}
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>{SELF_ORDER_VI.chooseBankAppTitle}</DrawerTitle>
          <DrawerDescription>
            {SELF_ORDER_VI.chooseBankAppDescription}
          </DrawerDescription>
        </DrawerHeader>
        <div className="mx-4 mb-4 min-h-0 flex-1 overflow-y-auto">
          {apps ? (
            <ul className="grid gap-2">
              {apps.map((app) => {
                const href = buildVietQrBankAppUrl({
                  appId: app.id,
                  accountNo,
                  bankCode,
                  amount,
                  paymentCode,
                  accountName,
                  qrData,
                });
                if (!href) return null;
                return (
                  <li key={app.id}>
                    <Button
                      asChild
                      variant="outline"
                      size="touch"
                      className="w-full justify-start"
                    >
                      <a href={href}>
                        <Avatar aria-hidden="true">
                          {app.logoUrl ? (
                            <AvatarImage src={app.logoUrl} alt="" />
                          ) : null}
                          <AvatarFallback>
                            {app.name.slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        {app.name}
                      </a>
                    </Button>
                  </li>
                );
              })}
            </ul>
          ) : loadFailed ? (
            <div className="my-6 flex flex-col items-center gap-3 text-center">
              <p className="text-sm text-muted-foreground">
                {SELF_ORDER_VI.bankAppsLoadFailed}
              </p>
              <Button
                type="button"
                variant="outline"
                size="touch"
                onClick={() => setLoadAttempt((attempt) => attempt + 1)}
              >
                {SELF_ORDER_VI.retryRefresh}
              </Button>
            </div>
          ) : (
            <div className="my-8 flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Spinner className="size-4" />
              {SELF_ORDER_VI.bankAppsLoading}
            </div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
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
  error,
  fieldErrors,
  errorFocusRequest,
  onBuyerNotGetInvoiceChange,
  onBuyerNameChange,
  onBuyerTaxCodeChange,
  onBuyerAddressChange,
  onBuyerEmailChange,
  onRequestPayment,
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

  const isVietQrPending = activePaymentRequest?.status === "vietqr_pending";
  const hasRecoverableVietQr =
    isVietQrPending &&
    Boolean(activePaymentRequest.qrData) &&
    Boolean(activePaymentRequest.paymentCode);
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
        icon={<IconReceipt />}
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
                  </div>
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
                      />
                    ) : null}
                  </QrCodeImage>
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
                disabled={disabled || isPending}
                onClick={() => onRequestPayment("vietqr")}
              >
                {pendingMethod === "vietqr" ? (
                  <Spinner className="size-4" />
                ) : (
                  <IconQrcode data-icon="inline-start" />
                )}
                {SELF_ORDER_VI.vietQrCreate}
              </Button>
            </div>
          )}
        </>
      </AppSection>
      {activePaymentRequest ? null : buyerDetails}
    </section>
  );
}
