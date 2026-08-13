"use client";

import { ChevronDown as IconChevronDown } from "lucide-react";
import { cn } from "@comtammatu/ui";
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
  ItemHeader,
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

function SlipCells({
  name,
  quantity,
  unitPrice,
  vatRate,
  amount,
  header = false,
}: {
  name: string;
  quantity: string;
  unitPrice: string;
  vatRate: string;
  amount: string;
  header?: boolean;
}) {
  const numericClass = cn(
    "text-right font-mono tabular-nums",
    header ? "text-xs text-muted-foreground" : "text-xs",
  );

  return (
    <>
      <span
        className={cn(
          "col-span-2 min-w-0 break-words",
          header
            ? "text-xs text-muted-foreground"
            : "text-xs font-medium",
        )}
      >
        {name}
      </span>
      <span className={numericClass}>{quantity}</span>
      <span className={numericClass}>{unitPrice}</span>
      <span className={numericClass}>{vatRate}</span>
      <span className={numericClass}>{amount}</span>
    </>
  );
}

function InvoiceBuyerSlipLine({ item }: { item: InvoiceBuyerOrderLine }) {
  return (
    <SlipCells
      name={item.name}
      quantity={formatQuantity(item.quantity)}
      unitPrice={formatVND(item.unitPrice)}
      vatRate={formatPercent(item.vatRate, 0)}
      amount={formatVND(item.amount)}
    />
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
  const lineSubtotal = summary
    ? summary.items.reduce((sum, item) => sum + item.amount, 0)
    : 0;
  const showAdjustments =
    summary != null &&
    (summary.discountAmount > 0 || summary.serviceCharge > 0);

  return (
    <Item variant="outline" className="w-full min-w-0 bg-card">
      <ItemHeader>
        <ItemTitle size="heading">{invoiceBuyer.title}</ItemTitle>
        {summary ? (
          <p className="shrink-0 font-heading text-sm font-semibold tabular-nums">
            {formatVND(summary.totalAmount)}
          </p>
        ) : null}
      </ItemHeader>
      <ItemContent className="w-full min-w-0 gap-1">
        <ItemDescription>
          {invoiceBuyer.order(branchName, orderNumber)}
        </ItemDescription>
        {summary ? (
          <Collapsible className="min-w-0 pt-1">
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
            <CollapsibleContent className="grid min-w-0 gap-2 border-t pt-2">
              <div className="grid min-w-0 grid-cols-6 gap-x-2 gap-y-2">
                <SlipCells
                  header
                  name={invoiceBuyer.itemColumn}
                  quantity={invoiceBuyer.quantityLabel}
                  unitPrice={invoiceBuyer.unitPriceLabel}
                  vatRate={invoiceBuyer.vatRateLabel}
                  amount={invoiceBuyer.lineTotalLabel}
                />
                {summary.items.map((item, index) => (
                  <InvoiceBuyerSlipLine
                    key={`${item.name}-${index}`}
                    item={item}
                  />
                ))}
              </div>
              {showAdjustments ? (
                <div className="grid gap-2 border-t pt-2">
                  <MoneyRow
                    label={invoiceBuyer.subtotalLabel}
                    amount={lineSubtotal}
                  />
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
