"use client";

import { cn } from "@comtammatu/ui";
import type { PaymentMethod } from "@comtammatu/shared/providers";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Card, CardContent } from "@comtammatu/ui/components/card";
import {
  DollarSign as IconCurrencyDollar,
  ExternalLink as IconExternalLink,
  ReceiptText as IconFileInvoice,
  QrCode as IconQrcode,
} from "lucide-react";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { METHOD_LABELS } from "./bill-receipt-types";
import type { PendingExtras } from "./bill-receipt-types";

interface BillReceiptPaymentPickerProps {
  methods: PaymentMethod[];
  onPay: (method: PaymentMethod) => void;
  payPending: boolean;
  hasPendingRemotePayment: boolean;
  pendingExtras: PendingExtras | null;
}

export function BillReceiptPaymentPicker({
  methods,
  onPay,
  payPending,
  hasPendingRemotePayment,
  pendingExtras,
}: BillReceiptPaymentPickerProps) {
  return (
    <Card className="shadow-sm">
      <CardContent className="flex flex-col gap-3 p-3">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-base font-semibold">Phương thức thanh toán</h4>
          <Badge variant="outline">{methods.length}</Badge>
        </div>

        <div className="grid gap-2">
          {methods.map((m) => (
            <Button
              key={m}
              data-testid={`bill-pay-${m}`}
              type="button"
              variant={m === "cash" ? "default" : "secondary"}
              disabled={payPending || hasPendingRemotePayment}
              className={cn(
                "h-12 w-full justify-between px-4 text-base font-semibold shadow-sm",
                m === "cash" && "shadow-md",
              )}
              onClick={() => onPay(m)}
            >
              <span className="flex items-center gap-2">
                {m === "cash" ? (
                  <IconCurrencyDollar data-icon="inline-start" />
                ) : (
                  <IconQrcode data-icon="inline-start" />
                )}
                {METHOD_LABELS[m] ?? m}
              </span>
              {payPending ? (
                <Spinner />
              ) : (
                <IconFileInvoice
                  data-icon="inline-end"
                  className="opacity-70"
                />
              )}
            </Button>
          ))}
        </div>

        {pendingExtras?.redirect_url && (
          <Button type="button" variant="outline" className="w-full" asChild>
            <a
              href={pendingExtras.redirect_url}
              target="_blank"
              rel="noopener noreferrer"
            >
              <IconExternalLink data-icon="inline-start" />
              Mở trang thanh toán MoMo
            </a>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
