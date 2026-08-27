"use client";

import { useEffect, useRef, useState } from "react";
import {
  Banknote as IconCash,
  Check as IconCheck,
  ChevronDown as IconChevronDown,
  ChevronUp as IconChevronUp,
  Clock as IconClock,
  Copy as IconCopy,
  Landmark as IconBank,
  ShieldCheck as IconShieldCheck,
  X as IconCancel,
} from "lucide-react";
import { ACTIONS_VI, SELF_ORDER_VI } from "@comtammatu/shared/messages";
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
import { Frame } from "@comtammatu/ui/components/frame";
import { Input } from "@comtammatu/ui/components/input";
import { ScrollArea } from "@comtammatu/ui/components/scroll-area";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { toast } from "@comtammatu/ui/components/sonner";
import { PublicSection } from "@/components/surface";
import { QrCodeImage } from "@/components/qr-code-image";
import { SheetFooter } from "@/components/surface/app-sheet";
import { BankAppDrawer, BankLogoImage } from "./bank-app-drawer";
import {
  POPULAR_BANK_APP_IDS,
  STATIC_VIETQR_BANK_APPS,
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

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else if (typeof document !== "undefined") {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setCopied(true);
      toast.success(SELF_ORDER_VI.copiedContent(label));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(ACTIONS_VI.copy);
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="xs"
      className="shrink-0 gap-1 text-2xs"
      onClick={handleCopy}
      aria-label={`${ACTIONS_VI.copy} ${label}`}
    >
      {copied ? (
        <>
          <IconCheck className="size-3 text-success" />
          <span className="text-success">{SELF_ORDER_VI.copiedToClipboard}</span>
        </>
      ) : (
        <>
          <IconCopy className="size-3 text-muted-foreground" />
          <span>{ACTIONS_VI.copy}</span>
        </>
      )}
    </Button>
  );
}

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
  const [drawerOpen, setDrawerOpen] = useState(false);
  const platform = resolveBankAppPlatform(navigator);

  const topBanks = STATIC_VIETQR_BANK_APPS.filter((app) =>
    POPULAR_BANK_APP_IDS.includes(app.id),
  );

  return (
    <>
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between px-1">
          <span className="text-xs font-semibold text-foreground">
            {SELF_ORDER_VI.quickBankTitle}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="h-auto p-0 text-xs font-medium text-primary hover:bg-transparent hover:text-primary"
            onClick={() => setDrawerOpen(true)}
          >
            {SELF_ORDER_VI.allBankApps}
          </Button>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 overscroll-contain no-scrollbar">
          {topBanks.slice(0, 8).map((bank) => {
            const href = buildVietQrBankAppUrl({
              appId: bank.id,
              accountNo,
              bankCode,
              amount,
              paymentCode,
              accountName,
              qrData,
              platform,
            });
            if (!href) return null;

            return (
              <Button
                key={bank.id}
                variant="outline"
                size="touch"
                className="flex h-auto w-18 shrink-0 flex-col items-center gap-1 bg-card p-2 text-center shadow-2xs transition-colors hover:border-primary hover:bg-muted active:scale-95"
                render={<a href={href} />}
                onClick={() => onBankAppHandoff?.()}
              >
                <BankLogoImage src={bank.logoUrl} alt={bank.name} />
                <span className="max-w-16 truncate text-3xs font-semibold text-foreground">
                  {bank.shortName || bank.name}
                </span>
              </Button>
            );
          })}
        </div>

        <Button
          type="button"
          variant="default"
          size="touch-lg"
          className="w-full justify-between shadow-xs"
          onClick={() => setDrawerOpen(true)}
        >
          <span className="inline-flex items-center gap-2 font-semibold">
            <IconBank data-icon="inline-start" className="size-5" />
            {SELF_ORDER_VI.openBankingApp}
          </span>
          <span className="inline-flex items-center gap-1 text-xs opacity-90">
            <span>35+</span>
            <IconChevronDown className="size-4" />
          </span>
        </Button>
      </div>

      <BankAppDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        accountNo={accountNo}
        bankCode={bankCode}
        amount={amount}
        paymentCode={paymentCode}
        accountName={accountName}
        qrData={qrData}
        onBankAppHandoff={onBankAppHandoff}
      />
    </>
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
  const [showManualDetails, setShowManualDetails] = useState(false);
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
    Boolean(activePaymentRequest?.qrData) &&
    Boolean(activePaymentRequest?.paymentCode);
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
              {hasRecoverableVietQr ? (
                <div className="flex flex-col gap-3">
                  <Frame className="flex flex-col items-center gap-2 bg-card p-4 text-center shadow-xs">
                    <div className="flex w-full items-center justify-between">
                      <div className="flex flex-col items-start text-left">
                        <span className="text-3xs font-medium text-muted-foreground uppercase tracking-wider">
                          {SELF_ORDER_VI.paymentAmountLabel}
                        </span>
                        <span className="font-mono text-2xl font-semibold tracking-tight tabular-nums text-primary">
                          {formatVND(activePaymentRequest.amount)}
                        </span>
                      </div>
                      {expiryLabel ? (
                        <div className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-2xs text-muted-foreground">
                          <IconClock className="size-3 text-primary shrink-0" aria-hidden />
                          <span>{expiryLabel}</span>
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-3xs font-medium text-success">
                          <IconShieldCheck className="size-3" />
                          <span>VietQR 24/7</span>
                        </span>
                      )}
                    </div>

                    <Frame className="my-1 bg-white p-2.5 shadow-xs">
                      <QrCodeImage
                        value={activePaymentRequest.qrData ?? ""}
                        alt={SELF_ORDER_VI.vietQrPendingTitle}
                        className="size-40 max-w-40"
                        errorMessage={SELF_ORDER_VI.qrRenderFailed}
                        retryLabel={SELF_ORDER_VI.retryQr}
                        downloadLabel={SELF_ORDER_VI.saveVietQr}
                        downloadName="ma-qr-thanh-toan-ma-tu.png"
                      />
                    </Frame>

                    <p className="max-w-xs text-xs text-muted-foreground">
                      {SELF_ORDER_VI.otherBankScanHint}
                    </p>
                  </Frame>

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

                  <Frame className="flex flex-col bg-card p-2.5 text-xs shadow-xs">
                    <Button
                      type="button"
                      variant="ghost"
                      size="touch"
                      className="h-auto w-full justify-between p-1.5 text-xs font-medium text-muted-foreground hover:bg-transparent hover:text-foreground"
                      onClick={() => setShowManualDetails((prev) => !prev)}
                    >
                      <span className="inline-flex items-center gap-1.5">
                        <IconBank className="size-3.5" />
                        <span>
                          {showManualDetails
                            ? SELF_ORDER_VI.hideManualTransferDetails
                            : SELF_ORDER_VI.manualTransferDetails}
                        </span>
                      </span>
                      {showManualDetails ? (
                        <IconChevronUp className="size-4" />
                      ) : (
                        <IconChevronDown className="size-4" />
                      )}
                    </Button>

                    {showManualDetails ? (
                      <div className="flex flex-col gap-2 border-t border-border pt-2">
                        {activePaymentRequest.paymentCode ? (
                          <Frame className="flex flex-col gap-1 border-primary/20 bg-primary/10 p-2.5">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-3xs font-medium text-muted-foreground">
                                {SELF_ORDER_VI.paymentCodeLabel}
                              </span>
                              <CopyButton
                                text={activePaymentRequest.paymentCode}
                                label={SELF_ORDER_VI.paymentCodeLabel}
                              />
                            </div>
                            <span className="break-all font-mono text-sm font-semibold tracking-wide text-primary">
                              {activePaymentRequest.paymentCode}
                            </span>
                            <span className="text-3xs text-muted-foreground">
                              {SELF_ORDER_VI.paymentMemoNotice}
                            </span>
                          </Frame>
                        ) : null}

                        {activePaymentRequest.accountNo ? (
                          <div className="flex items-center justify-between gap-2 border-b border-border pb-2">
                            <div className="flex min-w-0 flex-col">
                              <span className="text-muted-foreground">
                                {SELF_ORDER_VI.bankAccountLabel}
                              </span>
                              <span className="font-mono text-xs font-semibold text-foreground">
                                {activePaymentRequest.bankCode} · {activePaymentRequest.accountNo}
                              </span>
                            </div>
                            <CopyButton
                              text={activePaymentRequest.accountNo}
                              label={SELF_ORDER_VI.bankAccountLabel}
                            />
                          </div>
                        ) : null}

                        {activePaymentRequest.accountName ? (
                          <div className="flex flex-col gap-1">
                            <span className="text-muted-foreground">
                              {SELF_ORDER_VI.bankAccountNameLabel}
                            </span>
                            <span className="font-medium text-foreground">
                              {activePaymentRequest.accountName}
                            </span>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </Frame>
                </div>
              ) : activePaymentRequest.method === "cash_call" ? (
                <Frame className="flex flex-col items-center gap-2 bg-card p-4 text-center shadow-xs">
                  <div className="flex size-12 items-center justify-center rounded-md bg-primary/10">
                    <IconCash className="size-6 text-primary" aria-hidden />
                  </div>
                  <p className="text-sm font-semibold text-foreground">
                    {SELF_ORDER_VI.cashCallOk}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {SELF_ORDER_VI.pendingApprovalDescription}
                  </p>
                </Frame>
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
                <div className="flex flex-col gap-3 rounded-md bg-muted/30 p-3">
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
                      placeholder={SELF_ORDER_VI.buyerTaxCodePlaceholder}
                      value={taxCode}
                      disabled={disabled || isPending}
                      onChange={(event) => {
                        setTaxCode(event.target.value.trim());
                        setBuyerName("");
                        setBuyerAddress("");
                      }}
                    />
                    {lookupMessage ? (
                      <FieldDescription
                        role="status"
                        className={
                          lookupStatus === "found"
                            ? "font-medium text-success"
                            : undefined
                        }
                      >
                        {lookupStatus === "loading" ? (
                          <span className="inline-flex items-center gap-2">
                            <Spinner className="size-3.5" />
                            {lookupMessage}
                          </span>
                        ) : lookupStatus === "found" ? (
                          <span className="inline-flex items-center gap-1 text-success">
                            <IconCheck className="size-3.5 shrink-0" />
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
                    <div className="flex flex-col gap-2 rounded-md bg-muted/50 p-3 text-sm">
                      <div className="flex flex-col gap-1">
                        <span className="text-xs font-medium text-muted-foreground">
                          {SELF_ORDER_VI.companyName}
                        </span>
                        <p className="font-medium text-foreground">
                          {buyerName || "—"}
                        </p>
                      </div>
                      {buyerAddress ? (
                        <div className="flex flex-col gap-1 border-t border-border/20 pt-2">
                          <span className="text-xs font-medium text-muted-foreground">
                            {SELF_ORDER_VI.companyAddress}
                          </span>
                          <p className="text-xs text-foreground">
                            {buyerAddress}
                          </p>
                        </div>
                      ) : null}
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
                      placeholder="ketoan@congty.com"
                      value={buyerEmail}
                      disabled={disabled || isPending}
                      aria-invalid={emailInvalid}
                      onChange={(event) => setBuyerEmail(event.target.value)}
                    />
                    {emailInvalid ? (
                      <FieldDescription className="text-destructive">
                        {SELF_ORDER_VI.buyerEmailInvalid}
                      </FieldDescription>
                    ) : (
                      <FieldDescription>
                        {SELF_ORDER_VI.buyerEmailHint}
                      </FieldDescription>
                    )}
                  </Field>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </ScrollArea>

      {hasRecoverableVietQr && activePaymentRequest ? (
        <SheetFooter className="workflow-safe-pb shrink-0 border-border bg-card p-4">
          <Button
            type="button"
            variant="outline"
            size="touch"
            className="w-full text-muted-foreground transition-colors hover:border-destructive/20 hover:bg-destructive/10 hover:text-destructive"
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
        </SheetFooter>
      ) : activePaymentRequest ? null : (
        <SheetFooter className="workflow-safe-pb shrink-0 border-border bg-card p-4">
          <div className="grid grid-cols-2 gap-3">
            <Button
              type="button"
              variant="outline"
              size="touch-lg"
              className="gap-2 font-semibold"
              disabled={!canPay}
              onClick={() => onRequestPayment("cash_call", invoicePayload())}
            >
              {pendingMethod === "cash_call" ? (
                <Spinner className="size-4" />
              ) : (
                <IconCash data-icon="inline-start" className="size-5" />
              )}
              {SELF_ORDER_VI.cashCall}
            </Button>
            <Button
              type="button"
              variant="default"
              size="touch-lg"
              className="gap-2 font-semibold shadow-xs"
              disabled={!canPay}
              onClick={() => onRequestPayment("vietqr", invoicePayload())}
            >
              {pendingMethod === "vietqr" ? (
                <Spinner className="size-4" />
              ) : (
                <IconBank data-icon="inline-start" className="size-5" />
              )}
              {SELF_ORDER_VI.bankTransfer}
            </Button>
          </div>
        </SheetFooter>
      )}
    </div>
  );
}
