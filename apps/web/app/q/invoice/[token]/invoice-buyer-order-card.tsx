"use client";

import { formatPortionQuantity, formatVND } from "@comtammatu/shared/format";
import { BrandMascot } from "@/components/brand";
import { PublicSection } from "@/components/surface";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import type { InvoiceBuyerOrderSummary } from "@lib/hddt/invoice-buyer-types";
import { invoiceBuyer } from "@lib/messages/invoice-buyer";

function MoneyRow({
  label,
  amount,
  emphasize = false,
}: {
  label: string;
  amount: number;
  emphasize?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className={emphasize ? "font-medium" : "text-muted-foreground"}>
        {label}
      </span>
      <span
        className={
          emphasize
            ? "font-mono font-semibold tabular-nums"
            : "font-mono tabular-nums"
        }
      >
        {formatVND(amount)}
      </span>
    </div>
  );
}

export function InvoiceBuyerOrderCard({
  branchName,
  orderNumber,
  summary,
}: {
  branchName: string;
  orderNumber: string;
  summary?: InvoiceBuyerOrderSummary;
}) {
  return (
    <>
      <Item variant="outline" className="bg-card">
        <ItemContent className="items-center gap-2 text-center">
          <BrandMascot decorative size="sm" />
          <ItemTitle className="text-lg">{invoiceBuyer.title}</ItemTitle>
          <ItemDescription>
            {invoiceBuyer.order(branchName, orderNumber)}
          </ItemDescription>
          {summary ? (
            <p className="font-heading text-lg font-semibold tabular-nums">
              {formatVND(summary.totalAmount)}
            </p>
          ) : null}
        </ItemContent>
      </Item>
      {summary ? (
        <PublicSection
          size="sm"
          collapsible
          defaultOpen={false}
          title={invoiceBuyer.detailsTitle}
        >
          <ul className="grid gap-2">
            {summary.items.map((item, index) => (
              <li
                key={`${item.name}-${index}`}
                className="flex items-baseline justify-between gap-3"
              >
                <span className="min-w-0">
                  <span className="break-words">{item.name}</span>{" "}
                  <span className="text-muted-foreground">
                    {formatPortionQuantity(item.quantity)}
                  </span>
                </span>
                <span className="shrink-0 font-mono tabular-nums">
                  {formatVND(item.amount)}
                </span>
              </li>
            ))}
          </ul>
          {summary.discountAmount > 0 || summary.serviceCharge > 0 ? (
            <div className="grid gap-2 border-t pt-3">
              {summary.discountAmount > 0 ? (
                <MoneyRow
                  label={invoiceBuyer.discountLabel}
                  amount={-summary.discountAmount}
                />
              ) : null}
              {summary.serviceCharge > 0 ? (
                <MoneyRow
                  label={invoiceBuyer.serviceChargeLabel}
                  amount={summary.serviceCharge}
                />
              ) : null}
            </div>
          ) : null}
          <div className="border-t pt-3">
            <MoneyRow
              label={invoiceBuyer.totalLabel}
              amount={summary.totalAmount}
              emphasize
            />
          </div>
        </PublicSection>
      ) : null}
    </>
  );
}
