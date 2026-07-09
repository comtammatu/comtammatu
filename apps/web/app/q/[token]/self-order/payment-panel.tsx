"use client";

import {
  Banknote as IconCash,
  CreditCard as IconPayment,
  QrCode as IconQrcode,
  ReceiptText as IconReceipt,
} from "lucide-react";
import { SELF_ORDER_VI } from "@comtammatu/shared/messages";
import { formatVND } from "@comtammatu/shared/format";
import { cn } from "@comtammatu/ui";
import { Button } from "@comtammatu/ui/components/button";
import { Checkbox } from "@comtammatu/ui/components/checkbox";
import { Input } from "@comtammatu/ui/components/input";
import { Label } from "@comtammatu/ui/components/label";
import { Alert, AlertDescription } from "@comtammatu/ui/components/alert";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { AppSection } from "@/components/surface";
import { QrCodeImage } from "@/components/qr-code-image";
import type { PublicSelfOrderSnapshot } from "@lib/self-order/contracts";

export interface VietQrState {
  qrData: string;
  amount: number;
  paymentCode: string;
  bankCode: string;
  accountNo: string;
  accountName: string;
}

export interface PaymentPanelProps {
  disabled: boolean;
  activeOrder: PublicSelfOrderSnapshot["order"] | null;
  buyerNotGetInvoice: boolean;
  buyerName: string;
  buyerTaxCode: string;
  buyerAddress: string;
  buyerEmail: string;
  isPending: boolean;
  error: string | null;
  vietQr: VietQrState | null;
  onBuyerNotGetInvoiceChange: (value: boolean) => void;
  onBuyerNameChange: (value: string) => void;
  onBuyerTaxCodeChange: (value: string) => void;
  onBuyerAddressChange: (value: string) => void;
  onBuyerEmailChange: (value: string) => void;
  onRequestPayment: (method: "cash_call" | "vietqr") => void;
}

export function PaymentPanel({
  disabled,
  activeOrder,
  buyerNotGetInvoice,
  buyerName,
  buyerTaxCode,
  buyerAddress,
  buyerEmail,
  isPending,
  error,
  vietQr,
  onBuyerNotGetInvoiceChange,
  onBuyerNameChange,
  onBuyerTaxCodeChange,
  onBuyerAddressChange,
  onBuyerEmailChange,
  onRequestPayment,
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

  return (
    <section className={cn("flex flex-col gap-3", disabled && "opacity-60")}>
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
              disabled={disabled}
              onCheckedChange={(value) => {
                onBuyerNotGetInvoiceChange(value === true);
              }}
            />
            <Label
              htmlFor="self-order-buyer-not-get-invoice"
              className="text-sm"
            >
              {SELF_ORDER_VI.buyerNoInvoice}
            </Label>
          </div>
          {!buyerNotGetInvoice ? (
            <div className="grid gap-3">
              <div className="grid gap-1">
                <Label htmlFor="self-order-buyer-name">
                  {SELF_ORDER_VI.buyerName}
                </Label>
                <Input
                  id="self-order-buyer-name"
                  name="buyerName"
                  autoComplete="name"
                  value={buyerName}
                  disabled={disabled}
                  placeholder={SELF_ORDER_VI.buyerName}
                  onChange={(event) => onBuyerNameChange(event.target.value)}
                />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="self-order-buyer-tax-code">
                  {SELF_ORDER_VI.buyerTaxCode}
                </Label>
                <Input
                  id="self-order-buyer-tax-code"
                  name="buyerTaxCode"
                  inputMode="numeric"
                  autoComplete="off"
                  spellCheck={false}
                  value={buyerTaxCode}
                  disabled={disabled}
                  placeholder="0123456789"
                  onChange={(event) => onBuyerTaxCodeChange(event.target.value)}
                />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="self-order-buyer-address">
                  {SELF_ORDER_VI.buyerAddress}
                </Label>
                <Input
                  id="self-order-buyer-address"
                  name="buyerAddress"
                  autoComplete="street-address"
                  value={buyerAddress}
                  disabled={disabled}
                  placeholder={SELF_ORDER_VI.buyerAddress}
                  onChange={(event) => onBuyerAddressChange(event.target.value)}
                />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="self-order-buyer-email">
                  {SELF_ORDER_VI.buyerEmail}
                </Label>
                <Input
                  id="self-order-buyer-email"
                  name="buyerEmail"
                  type="email"
                  autoComplete="email"
                  spellCheck={false}
                  value={buyerEmail}
                  disabled={disabled}
                  placeholder="email@example.com"
                  onChange={(event) => onBuyerEmailChange(event.target.value)}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {SELF_ORDER_VI.buyerBusinessHint}
              </p>
            </div>
          ) : null}
        </>
      </AppSection>

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
          children: formatVND(activeOrder.totalAmount),
          variant: "outline",
        }}
        size="sm"
      >
        <>
          <div className="grid grid-cols-1 gap-2">
            <Button
              type="button"
              variant="outline"
              size="touch"
              disabled={disabled || isPending}
              onClick={() => onRequestPayment("cash_call")}
            >
              {isPending ? (
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
              {isPending ? (
                <Spinner className="size-4" />
              ) : (
                <IconQrcode data-icon="inline-start" />
              )}
              {SELF_ORDER_VI.vietQrCreate}
            </Button>
          </div>

          {vietQr ? (
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
                value={vietQr.qrData}
                alt={SELF_ORDER_VI.vietQrPendingTitle}
                className="size-64 max-w-full"
              />
              <div className="flex flex-col gap-1 text-sm">
                <p className="font-mono font-bold tabular-nums">
                  {formatVND(vietQr.amount)}
                </p>
                <p className="break-all text-muted-foreground">
                  {vietQr.paymentCode}
                </p>
              </div>
            </div>
          ) : null}
        </>
      </AppSection>
    </section>
  );
}
