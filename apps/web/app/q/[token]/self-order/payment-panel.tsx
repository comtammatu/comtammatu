"use client";

import { useEffect, useState } from "react";
import {
  Banknote as IconCash,
  Landmark as IconBank,
  QrCode as IconQrcode,
  ReceiptText as IconReceipt,
  Smartphone as IconMomo,
  X as IconCancel,
} from "lucide-react";
import { SELF_ORDER_VI } from "@comtammatu/shared/messages";
import { formatVND } from "@comtammatu/shared/format";
import { formatVNTime } from "@comtammatu/shared/time";
import { Button } from "@comtammatu/ui/components/button";
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
  getVietQrBankAppCatalogUrl,
  parseVietQrBankApps,
  type VietQrBankApp,
} from "@lib/self-order/bank-app-link";
import type { PublicSelfOrderAvailableSnapshot } from "@lib/self-order/contracts";

export interface GuestPaymentRequestState {
  id?: number | null;
  clientOpId?: string | null;
  status: string;
  method: "cash_call" | "vietqr" | "momo";
  amount: number;
  paymentId?: number | null;
  paymentCode?: string | null;
  qrData?: string | null;
  bankCode?: string | null;
  accountNo?: string | null;
  accountName?: string | null;
  deeplink?: string | null;
  payUrl?: string | null;
  createdAt?: string | null;
  expiresAt?: string | null;
}

export interface PaymentPanelProps {
  disabled: boolean;
  activeOrder: PublicSelfOrderAvailableSnapshot["order"];
  activePaymentRequest: GuestPaymentRequestState | null;
  isPending: boolean;
  isCancelling: boolean;
  pendingMethod: "cash_call" | "vietqr" | "momo" | null;
  error: string | null;
  onRequestPayment: (method: "cash_call" | "vietqr" | "momo") => void;
  onCancelVietQr: () => Promise<void>;
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

    void fetch(getVietQrBankAppCatalogUrl(navigator), {
      cache: "force-cache",
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error("bank_app_catalog_unavailable");
        return response.json() as Promise<unknown>;
      })
      .then((payload) => {
        const parsedApps = parseVietQrBankApps(payload);
        setApps(parsedApps);
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
      <DrawerTrigger
        render={
          <Button type="button" size="touch" className="w-full">
            <IconBank data-icon="inline-start" />
            {SELF_ORDER_VI.openBankApp}
          </Button>
        }
      />
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
                      variant="outline"
                      size="touch"
                      className="w-full justify-start"
                      render={<a href={href} />}
                    >
                      <Avatar aria-hidden="true">
                        {app.logoUrl ? (
                          <AvatarImage src={app.logoUrl} alt="" />
                        ) : null}
                        <AvatarFallback>
                          {app.name.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      {app.name}
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
  isPending,
  isCancelling,
  pendingMethod,
  error,
  onRequestPayment,
  onCancelVietQr,
}: PaymentPanelProps) {
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
  const hasRecoverableMoMo =
    activePaymentRequest?.status === "momo_pending" &&
    Boolean(activePaymentRequest.deeplink) &&
    Boolean(activePaymentRequest.payUrl);
  const expiryLabel = formatVNTime(activePaymentRequest?.expiresAt, "") || null;

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
              {hasRecoverableMoMo ? (
                <div className="flex flex-col items-center gap-3 rounded-md bg-muted/30 p-3 text-center">
                  <div className="flex flex-col gap-1">
                    <h3 className="font-heading text-sm font-semibold">
                      {SELF_ORDER_VI.momoPendingTitle}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      {SELF_ORDER_VI.momoPendingDescription}
                    </p>
                  </div>
                  <p className="font-mono text-sm font-bold tabular-nums">
                    {formatVND(activePaymentRequest.amount)}
                  </p>
                  <Button
                    size="touch-lg"
                    className="w-full"
                    render={<a href={activePaymentRequest.deeplink ?? ""} />}
                  >
                    {SELF_ORDER_VI.openMomoApp}
                  </Button>
                  <Button
                    variant="outline"
                    size="touch"
                    className="w-full"
                    render={<a href={activePaymentRequest.payUrl ?? ""} />}
                  >
                    {SELF_ORDER_VI.openMomoWeb}
                  </Button>
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
                variant="outline"
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
              <Button
                type="button"
                variant="default"
                size="touch"
                disabled={disabled || isPending}
                onClick={() => onRequestPayment("momo")}
              >
                {pendingMethod === "momo" ? (
                  <Spinner className="size-4" />
                ) : (
                  <IconMomo data-icon="inline-start" />
                )}
                {SELF_ORDER_VI.momoCreate}
              </Button>
            </div>
          )}
        </>
      </AppSection>
    </section>
  );
}
