"use client";

import { ReceiptText as IconReceipt } from "lucide-react";
import { SELF_ORDER_VI } from "@comtammatu/shared/messages";
import { formatVND } from "@comtammatu/shared/format";
import { cn } from "@comtammatu/ui";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Checkbox } from "@comtammatu/ui/components/checkbox";
import { Input } from "@comtammatu/ui/components/input";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { Label } from "@comtammatu/ui/components/label";
import { Alert, AlertDescription } from "@comtammatu/ui/components/alert";
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
  return (
    <section className={cn("flex flex-col gap-3", disabled && "opacity-60")}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-heading flex items-center gap-2 text-base font-semibold">
          <IconReceipt className="size-4" />
          {SELF_ORDER_VI.paymentTitle}
        </h2>
        {activeOrder ? (
          <Badge variant="outline">{formatVND(activeOrder.totalAmount)}</Badge>
        ) : null}
      </div>

      <Item variant="outline" className="flex-col items-stretch">
        <div className="mb-3 flex items-center gap-2">
          <Checkbox
            id="buyer-not-get-invoice"
            checked={buyerNotGetInvoice}
            onCheckedChange={(value) => {
              onBuyerNotGetInvoiceChange(value === true);
            }}
          />
          <Label htmlFor="buyer-not-get-invoice" className="text-sm">
            {SELF_ORDER_VI.buyerNoInvoice}
          </Label>
        </div>
        {!buyerNotGetInvoice ? (
          <div className="grid gap-2">
            <Input
              value={buyerName}
              placeholder={SELF_ORDER_VI.buyerName}
              onChange={(event) => onBuyerNameChange(event.target.value)}
            />
            <Input
              value={buyerTaxCode}
              placeholder={SELF_ORDER_VI.buyerTaxCode}
              onChange={(event) => onBuyerTaxCodeChange(event.target.value)}
            />
            <Input
              value={buyerAddress}
              placeholder={SELF_ORDER_VI.buyerAddress}
              onChange={(event) => onBuyerAddressChange(event.target.value)}
            />
            <Input
              value={buyerEmail}
              placeholder={SELF_ORDER_VI.buyerEmail}
              onChange={(event) => onBuyerEmailChange(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {SELF_ORDER_VI.buyerBusinessHint}
            </p>
          </div>
        ) : null}
      </Item>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1">
        <Button
          type="button"
          variant="outline"
          size="touch"
          disabled={disabled || isPending}
          onClick={() => onRequestPayment("cash_call")}
        >
          {SELF_ORDER_VI.cashCall}
        </Button>
        <Button
          type="button"
          size="touch"
          disabled={disabled || isPending}
          onClick={() => onRequestPayment("vietqr")}
        >
          {SELF_ORDER_VI.vietQrCreate}
        </Button>
      </div>

      {vietQr ? (
        <Item variant="outline" className="flex-col items-center text-center">
          <ItemContent className="items-center">
            <ItemTitle className="text-sm">
              {SELF_ORDER_VI.vietQrPendingTitle}
            </ItemTitle>
            <ItemDescription>
              {SELF_ORDER_VI.vietQrPendingDescription}
            </ItemDescription>
          </ItemContent>
          <QrCodeImage
            value={vietQr.qrData}
            alt={SELF_ORDER_VI.vietQrPendingTitle}
            className="mt-3 size-64 max-w-full"
          />
          <div className="mt-3 flex flex-col gap-1 text-sm">
            <p className="font-bold">{formatVND(vietQr.amount)}</p>
            <p className="break-all text-muted-foreground">
              {vietQr.paymentCode}
            </p>
          </div>
        </Item>
      ) : null}
    </section>
  );
}
