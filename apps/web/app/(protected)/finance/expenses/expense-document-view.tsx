"use client";

import { useState } from "react";
import { Copy as IconCopy, Maximize2 as IconMaximize2 } from "lucide-react";
import {
  formatAccountingVND,
  formatPercent,
} from "@comtammatu/shared/format";
import { formatVNBusinessDate } from "@comtammatu/shared/time";
import { addMoney } from "@comtammatu/shared/money";
import { Button } from "@comtammatu/ui/components/button";
import { Item } from "@comtammatu/ui/components/item";
import { AppDialog } from "@/components/form";
import {
  FinanceMoneySummary,
  moneyLabels,
} from "../components/finance-money-block";
import {
  type ExpensePaymentMethod,
} from "../_lib/expense-categories";
import type { ExpenseRow } from "../expense-actions";
import { copy, expenseCategoryBucketLabel, expensePaymentMethod } from "./expense-form-schema";

export function ExpenseDocumentView({
  expense,
  branchOptions,
  isTouchLayout,
  onCopyTransferContent,
}: {
  expense: ExpenseRow;
  branchOptions: readonly { value: string; label: string }[];
  isTouchLayout: boolean;
  onCopyTransferContent?: (content: string) => void;
}) {
  const [attachmentLightboxOpen, setAttachmentLightboxOpen] = useState(false);
  const method = expensePaymentMethod(expense) as ExpensePaymentMethod;
  const paymentMethodLabel =
    (copy.paymentMethodLabels as Record<string, string>)[method] ?? method;
  const categoryLabel =
    (copy.categoryLabels as Record<string, string>)[expense.category] ??
    expense.category;

  const branchLabel =
    branchOptions.find((b) => b.value === String(expense.branch_id))?.label ??
    copy.tenantLevel;

  const subtotal = addMoney(
    expense.vat_breakdown.map((line) => String(line.taxableAmount)),
  );
  const vatAmount = addMoney(
    expense.vat_breakdown.map((line) => String(line.vatAmount)),
  );
  const grossTotal = addMoney([subtotal, vatAmount]);

  return (
    <div className="flex flex-col gap-6">
      {/* General Information Grid */}
      <Item variant="outline" className="grid gap-4 p-4 text-sm md:grid-cols-2">
        <div>
          <span className="block text-xs font-medium text-muted-foreground">
            {copy.form.date}
          </span>
          <span className="mt-1 block font-mono font-semibold tabular-nums">
            {formatVNBusinessDate(expense.expense_date)}
          </span>
        </div>

        <div>
          <span className="block text-xs font-medium text-muted-foreground">
            {copy.form.branch}
          </span>
          <span className="mt-1 block font-medium">{branchLabel}</span>
        </div>

        <div>
          <span className="block text-xs font-medium text-muted-foreground">
            {copy.form.category}
          </span>
          <span className="mt-1 block font-semibold">{categoryLabel}</span>
          <span className="mt-1 block text-xs font-medium text-muted-foreground">
            {expenseCategoryBucketLabel(expense.category)}
          </span>
        </div>

        <div>
          <span className="block text-xs font-medium text-muted-foreground">
            {copy.form.paymentSection}
          </span>
          <span className="mt-1 block font-medium">{paymentMethodLabel}</span>
        </div>

        <div className="md:col-span-2">
          <span className="block text-xs font-medium text-muted-foreground">
            {copy.form.note}
          </span>
          <span className="mt-1 block whitespace-pre-wrap font-normal text-foreground">
            {expense.note || "—"}
          </span>
        </div>
      </Item>

      {/* Financial & VAT Breakdown */}
      <div className="flex flex-col gap-3">
        <h4 className="text-sm font-medium">{copy.form.vatSection}</h4>

        <Item
          variant="outline"
          className="flex-col items-stretch overflow-hidden p-0"
        >
          <div className="flex items-center justify-between border-b bg-muted p-2.5 text-xs font-medium text-muted-foreground">
            <span className="w-1/4">{copy.form.lineVatRate}</span>
            <span className="w-3/8 text-right">{copy.form.subtotalLabel}</span>
            <span className="w-3/8 text-right">{copy.form.lineVatAmount}</span>
          </div>
          <div className="divide-y text-xs">
            {expense.vat_breakdown.map((line, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-2.5"
              >
                <span className="w-1/4 font-medium">
                  {formatPercent(line.vatRate, 0)}
                </span>
                <span className="w-3/8 text-right font-mono tabular-nums">
                  {formatAccountingVND(line.taxableAmount)}
                </span>
                <span className="w-3/8 text-right font-mono tabular-nums">
                  {formatAccountingVND(line.vatAmount)}
                </span>
              </div>
            ))}
          </div>
        </Item>

        <FinanceMoneySummary
          rows={[
            { label: moneyLabels.subtotalExVat, value: subtotal },
            { label: moneyLabels.vatAmount, value: vatAmount },
            {
              label: moneyLabels.totalInclVat,
              value: grossTotal,
              emphasize: true,
            },
          ]}
        />
      </div>

      {/* Transfer Content Section (if available) */}
      {expense.transfer_content ? (
        <div className="flex flex-col gap-2">
          <h4 className="text-sm font-medium">{copy.form.transferContent}</h4>
          <Item variant="muted" className="flex-col items-stretch gap-3 p-4">
            <code className="block break-all font-mono text-base font-semibold tabular-nums tracking-wide">
              {expense.transfer_content}
            </code>
            {onCopyTransferContent ? (
              <Button
                size={isTouchLayout ? "touch" : "default"}
                variant="outline"
                className="w-full"
                onClick={() => onCopyTransferContent(expense.transfer_content!)}
              >
                <IconCopy data-icon="inline-start" />
                {copy.transferInstruction.copy}
              </Button>
            ) : null}
          </Item>
        </div>
      ) : null}

      {/* Invoice Attachment Preview / Lightbox */}
      {expense.invoice_attachment_url ? (
        <div className="flex flex-col gap-2">
          <h4 className="text-sm font-medium">{copy.form.attachment}</h4>
          <Item variant="outline" className="flex-col items-stretch gap-3 p-3">
            {expense.invoice_attachment_url.toLowerCase().endsWith(".pdf") ? (
              <div className="flex items-center justify-between">
                <span className="max-w-xs truncate font-mono text-xs text-muted-foreground">
                  {expense.invoice_attachment_url.split("/").pop()}
                </span>
                <a
                  href={expense.invoice_attachment_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-primary underline hover:underline"
                >
                  {copy.form.viewPdf}
                </a>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="relative aspect-video max-h-48 w-full overflow-hidden bg-card">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={expense.invoice_attachment_url}
                    alt={copy.form.attachment}
                    className="h-full w-full object-contain"
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size={isTouchLayout ? "touch" : "default"}
                  className="w-full"
                  onClick={() => setAttachmentLightboxOpen(true)}
                >
                  <IconMaximize2 data-icon="inline-start" />
                  {copy.form.zoomAttachment}
                </Button>
              </div>
            )}
          </Item>

          <AppDialog
            open={attachmentLightboxOpen}
            onOpenChange={setAttachmentLightboxOpen}
            title={copy.form.attachment}
            variant="document"
          >
            <div className="flex flex-col items-center justify-center p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={expense.invoice_attachment_url}
                alt={copy.form.attachment}
                className="max-h-[70vh] w-auto max-w-full rounded object-contain"
              />
            </div>
          </AppDialog>
        </div>
      ) : null}
    </div>
  );
}
