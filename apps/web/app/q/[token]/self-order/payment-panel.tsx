"use client";

import {
  Banknote as IconCash,
  Landmark as IconBank,
  QrCode as IconQrcode,
  ReceiptText as IconReceipt,
  X as IconCancel,
} from "lucide-react";
import { SELF_ORDER_VI } from "@comtammatu/shared/messages";
import { formatVND } from "@comtammatu/shared/format";
import { formatVNTime } from "@comtammatu/shared/time";
import { Button } from "@comtammatu/ui/components/button";
import { Alert, AlertDescription } from "@comtammatu/ui/components/alert";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { PublicSection } from "@/components/surface";
import { QrCodeImage } from "@/components/qr-code-image";
import {
  PROVEN_VIETQR_BANK_APP_ID,
  buildVietQrBankAppUrl,
  resolveBankAppPlatform,
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

export interface PaymentPanelProps {
  disabled: boolean;
  activeOrder: PublicSelfOrderAvailableSnapshot["order"];
  activePaymentRequest: GuestPaymentRequestState | null;
  selectedPaymentMethod: "cash_call" | "vietqr" | null;
  isPending: boolean;
  isCancelling: boolean;
  pendingMethod: "cash_call" | "vietqr" | null;
  error: string | null;
  onPaymentMethodChange: (method: "cash_call" | "vietqr") => void;
  onCreatePayment: () => void;
  onCancelVietQr: () => Promise<void>;
  onBankAppHandoff?: () => void;
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

export function PaymentPanel({
  disabled,
  activeOrder,
  activePaymentRequest,
  selectedPaymentMethod,
  isPending,
  isCancelling,
  pendingMethod,
  error,
  onPaymentMethodChange,
  onCreatePayment,
  onCancelVietQr,
  onBankAppHandoff,
}: PaymentPanelProps) {
  if (!activeOrder) {
    return (
      <PublicSection
        title={SELF_ORDER_VI.billEmptyTitle}
        description={SELF_ORDER_VI.billEmptyDescription}
        icon={<IconReceipt />}
        size="sm"
      >
        <p className="text-sm text-muted-foreground">
          {SELF_ORDER_VI.cartEmpty}
        </p>
      </PublicSection>
    );
  }

  const isVietQrPending = activePaymentRequest?.status === "vietqr_pending";
  const hasRecoverableVietQr =
    isVietQrPending &&
    Boolean(activePaymentRequest.qrData) &&
    Boolean(activePaymentRequest.paymentCode);
  const expiryLabel = formatVNTime(activePaymentRequest?.expiresAt, "") || null;

  return (
    <section className="flex flex-col gap-3">
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <PublicSection
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
            <div className="grid grid-cols-1 gap-2">
              <Button
                type="button"
                variant={
                  selectedPaymentMethod === "cash_call" ? "default" : "outline"
                }
                size="touch"
                disabled={disabled || isPending}
                aria-pressed={selectedPaymentMethod === "cash_call"}
                onClick={() => onPaymentMethodChange("cash_call")}
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
                variant={
                  selectedPaymentMethod === "vietqr" ? "default" : "outline"
                }
                size="touch"
                disabled={disabled || isPending}
                aria-pressed={selectedPaymentMethod === "vietqr"}
                onClick={() => onPaymentMethodChange("vietqr")}
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
      </PublicSection>
      {activePaymentRequest ? null : (
        <Button
          type="button"
          size="touch"
          className="w-full"
          disabled={disabled || isPending || selectedPaymentMethod == null}
          onClick={onCreatePayment}
        >
          {isPending ? <Spinner className="size-4" /> : null}
          {selectedPaymentMethod === "vietqr"
            ? SELF_ORDER_VI.vietQrCreateAction
            : SELF_ORDER_VI.cashCallAction}
        </Button>
      )}
    </section>
  );
}
