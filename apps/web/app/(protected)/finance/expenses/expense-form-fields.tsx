"use client";

import { useFieldArray, type UseFormReturn } from "react-hook-form";
import {
  Copy as IconCopy,
  Plus as IconPlus,
  Trash2 as IconTrash,
} from "lucide-react";
import {
  addMoney,
  calculateVatAmount,
} from "@comtammatu/shared/money";
import { Button } from "@comtammatu/ui/components/button";
import { Item } from "@comtammatu/ui/components/item";
import { NoteCallout } from "@comtammatu/ui/components/note-callout";
import {
  BusinessDateField,
  PhotoUploadInput,
  SelectField,
  TextareaField,
} from "@/components/form";
import {
  FinanceMoneyBlockFields,
  FinanceMoneySummary,
  moneyLabels,
} from "../components/finance-money-block";
import {
  type ExpenseCategory,
  type ExpensePaymentMethod,
} from "../_lib/expense-categories";
import {
  EXPENSE_VAT_RATES,
  expenseGrossFromBreakdown,
  type ExpenseVatRate,
} from "../_lib/expense-vat";
import {
  buildExpenseVatBreakdown,
  copy,
  EMPTY_EXPENSE_LINE,
  expenseCategoryGroups,
  METHOD_OPTIONS,
  TENANT_LEVEL_BRANCH_VALUE,
  VAT_RATE_OPTIONS,
  type ExpenseFormValues,
} from "./expense-form-schema";

export function ExpenseFormFields({
  form,
  branchOptions,
  tenantId,
  isTouchLayout,
  paymentMethodReadOnly = false,
  readOnly = false,
  transferContent = null,
  onCopyTransferContent,
  lockedCategory,
}: {
  form: UseFormReturn<ExpenseFormValues>;
  branchOptions: readonly { value: string; label: string }[];
  tenantId: number;
  isTouchLayout: boolean;
  paymentMethodReadOnly?: boolean;
  readOnly?: boolean;
  transferContent?: string | null;
  onCopyTransferContent?: (content: string) => void;
  lockedCategory?: ExpenseCategory;
}) {
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "lines",
  });
  const lines = form.watch("lines");
  const category = form.watch("category");
  const paymentMethod = form.watch("paymentMethod");
  const cashBranchOptions =
    paymentMethod === "cash"
      ? branchOptions.filter(
          (option) => option.value !== TENANT_LEVEL_BRANCH_VALUE,
        )
      : branchOptions;
  const vatBreakdown = buildExpenseVatBreakdown(form.getValues());
  const subtotal = addMoney(vatBreakdown.map((line) => line.taxableAmount));
  const vatAmount = addMoney(vatBreakdown.map((line) => line.vatAmount));
  const grossTotal = expenseGrossFromBreakdown(vatBreakdown);
  const showPaymentMethodAsText = readOnly || paymentMethodReadOnly;

  return (
    <>
      {!readOnly ? (
        <NoteCallout
          tone="muted"
          label={copy.form.noteCalloutTitle}
        >
          <span className="text-xs text-muted-foreground">
            {copy.form.noteCalloutDescription}
          </span>
        </NoteCallout>
      ) : null}

      <Item variant="outline" className="grid gap-4 md:grid-cols-2">
        <BusinessDateField
          control={form.control}
          name="expenseDate"
          label={copy.form.date}
          required
          disabled={readOnly}
        />
        <SelectField
          control={form.control}
          name="branchId"
          label={copy.form.branch}
          options={cashBranchOptions}
          placeholder={copy.form.branchTenantLevel}
          disabled={readOnly}
        />
        <SelectField
          control={form.control}
          name="category"
          label={copy.form.category}
          groups={expenseCategoryGroups(category, lockedCategory)}
          placeholder={copy.form.categoryPlaceholder}
          description={
            (
              copy.categoryExamples as Record<string, string | undefined>
            )[category]
          }
          required
          disabled={readOnly || lockedCategory != null}
        />
        {showPaymentMethodAsText ? (
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium">{copy.form.paymentSection}</p>
            <p>
              {
                copy.paymentMethodLabels[
                  form.watch("paymentMethod") as ExpensePaymentMethod
                ]
              }
            </p>
          </div>
        ) : (
          <SelectField
            control={form.control}
            name="paymentMethod"
            label={copy.form.paymentSection}
            options={METHOD_OPTIONS}
            placeholder={copy.form.methodPlaceholder}
            required
          />
        )}
        <div className="md:col-span-2">
          <TextareaField
            control={form.control}
            name="note"
            label={copy.form.note}
            placeholder={copy.form.notePlaceholder}
            required
            disabled={readOnly}
          />
        </div>
      </Item>
      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium">{copy.form.vatSection}</p>
        {fields.map((field, index) => {
          const selectedRate = lines[index]?.vatRate;
          const rateOptions = VAT_RATE_OPTIONS.map((option) => ({
            ...option,
            disabled:
              option.value !== selectedRate &&
              lines.some((line) => line.vatRate === option.value),
          }));
          return (
            <Item
              key={field.id}
              variant="outline"
              className="flex flex-col gap-3 p-4"
            >
              <FinanceMoneyBlockFields
                control={form.control}
                taxableName={`lines.${index}.taxableAmount`}
                vatRateName={`lines.${index}.vatRate`}
                vatAmountName={`lines.${index}.vatAmount`}
                vatRateOptions={rateOptions}
                readOnly={readOnly}
                onRecalculateVat={
                  readOnly
                    ? undefined
                    : () => {
                        const taxable = form.getValues(
                          `lines.${index}.taxableAmount`,
                        );
                        const rate = Number(
                          form.getValues(`lines.${index}.vatRate`),
                        ) as ExpenseVatRate;
                        if (!taxable?.trim()) return;
                        form.setValue(
                          `lines.${index}.vatAmount`,
                          calculateVatAmount(taxable, rate),
                          { shouldDirty: true },
                        );
                      }
                }
              />
              {!readOnly && fields.length > 1 ? (
                <Button
                  type="button"
                  variant="outline"
                  size={isTouchLayout ? "touch" : "default"}
                  className="self-start"
                  onClick={() => remove(index)}
                >
                  <IconTrash data-icon="inline-start" />
                  {copy.form.removeLine}
                </Button>
              ) : null}
            </Item>
          );
        })}
        {!readOnly ? (
          <Button
            type="button"
            variant="outline"
            size={isTouchLayout ? "touch" : "default"}
            className="self-start"
            disabled={fields.length >= EXPENSE_VAT_RATES.length}
            onClick={() => {
              const nextRate = EXPENSE_VAT_RATES.find(
                (rate) => !lines.some((line) => line.vatRate === String(rate)),
              );
              append({
                ...EMPTY_EXPENSE_LINE,
                vatRate: String(
                  nextRate ?? 0,
                ) as ExpenseFormValues["lines"][number]["vatRate"],
              });
            }}
          >
            <IconPlus data-icon="inline-start" />
            {copy.form.addLine}
          </Button>
        ) : null}
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
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">{copy.form.attachment}</p>
        <p className="text-xs text-muted-foreground">
          {copy.form.attachmentHint}
        </p>
        <PhotoUploadInput
          tenantId={tenantId}
          folder="expenses/pending"
          value={form.watch("invoiceAttachmentUrl") || null}
          onChange={(url) =>
            form.setValue("invoiceAttachmentUrl", url ?? "", {
              shouldDirty: true,
            })
          }
          acceptTypes="image+pdf"
          previewSize={isTouchLayout ? "touch" : "default"}
          disabled={readOnly}
        />
      </div>
      {transferContent ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">{copy.form.transferContent}</p>
          <Item variant="muted" className="flex-col items-stretch gap-3 p-4">
            <code className="block break-all font-mono text-base font-semibold tabular-nums tracking-wide">
              {transferContent}
            </code>
            {onCopyTransferContent ? (
              <Button
                size={isTouchLayout ? "touch" : "default"}
                variant="outline"
                className="w-full"
                onClick={() => onCopyTransferContent(transferContent)}
              >
                <IconCopy data-icon="inline-start" />
                {copy.transferInstruction.copy}
              </Button>
            ) : null}
          </Item>
        </div>
      ) : null}
    </>
  );
}
