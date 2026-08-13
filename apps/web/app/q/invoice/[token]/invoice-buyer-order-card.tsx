"use client";

import { ChevronDown as IconChevronDown } from "lucide-react";
import {
  formatPercent,
  formatQuantity,
  formatVND,
} from "@comtammatu/shared/format";
import { Button } from "@comtammatu/ui/components/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@comtammatu/ui/components/collapsible";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import type {
  InvoiceBuyerOrderLine,
  InvoiceBuyerOrderSummary,
} from "@lib/hddt/invoice-buyer-types";
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

function InvoiceBuyerSlipLine({ item }: { item: InvoiceBuyerOrderLine }) {
  const lineMeta = [
    `${invoiceBuyer.quantityLabel} ${formatQuantity(item.quantity)}`,
    `${invoiceBuyer.unitPriceLabel} ${formatVND(item.unitPrice)}`,
    `${invoiceBuyer.vatRateLabel} ${formatPercent(item.vatRate, 0)}`,
  ].join(" · ");

  return (
    <li className="flex items-start justify-between gap-3 border-b border-border py-2 last:border-b-0 last:pb-0">
      <div className="min-w-0 grid gap-1">
        <p className="min-w-0 break-words font-medium">{item.name}</p>
        <p className="text-xs text-muted-foreground">{lineMeta}</p>
      </div>
      <p className="shrink-0 text-right font-mono tabular-nums">
        <span className="sr-only">{invoiceBuyer.lineTotalLabel} </span>
        {formatVND(item.amount)}
      </p>
    </li>
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
    <Item variant="outline" className="bg-card">
      <ItemContent className="w-full gap-1">
        <div className="flex items-baseline justify-between gap-3">
          <ItemTitle size="heading">{invoiceBuyer.title}</ItemTitle>
          {summary ? (
            <p className="shrink-0 font-heading text-sm font-semibold tabular-nums">
              {formatVND(summary.totalAmount)}
            </p>
          ) : null}
        </div>
        <ItemDescription>
          {invoiceBuyer.order(branchName, orderNumber)}
        </ItemDescription>
        {summary ? (
          <Collapsible className="pt-1">
            <CollapsibleTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="touch"
                  className="group w-full justify-between gap-2 px-0 font-medium"
                />
              }
            >
              <span>{invoiceBuyer.detailsTitle}</span>
              <IconChevronDown
                className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[panel-open]:rotate-180"
                aria-hidden
              />
            </CollapsibleTrigger>
            <CollapsibleContent className="grid gap-2 border-t pt-2">
              <div className="flex items-baseline justify-between gap-3 text-xs text-muted-foreground">
                <span>{invoiceBuyer.itemColumn}</span>
                <span>{invoiceBuyer.lineTotalLabel}</span>
              </div>
              <ul>
                {summary.items.map((item, index) => (
                  <InvoiceBuyerSlipLine
                    key={`${item.name}-${index}`}
                    item={item}
                  />
                ))}
              </ul>
              {summary.discountAmount > 0 || summary.serviceCharge > 0 ? (
                <div className="grid gap-2 border-t pt-2">
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
              <div className="border-t pt-2">
                <MoneyRow
                  label={invoiceBuyer.totalLabel}
                  amount={summary.totalAmount}
                  emphasize
                />
              </div>
            </CollapsibleContent>
          </Collapsible>
        ) : null}
      </ItemContent>
    </Item>
  );
}
