"use client";

import { useMemo } from "react";
import type { UseFormReturn } from "react-hook-form";
import { NoteCallout } from "@comtammatu/ui/components/note-callout";
import {
  MoneyVndField,
  SelectField,
  TextareaField,
  TextField,
} from "@/components/form";
import { formatAccountingVND as formatVND } from "@comtammatu/shared/format";
import {
  minorUnitsToCanonical,
  parseMoneyToMinorUnits,
} from "@comtammatu/shared/money";
import { messages } from "@lib/messages";
import type { SupplierAdvanceSummary } from "../supplier-invoice-actions";
import {
  canonicalMoney,
  formatSupplierInvoiceDate,
  minimumMinorUnits,
  type SupplierAdvanceFormValues,
  type SupplierCreditFormValues,
  type SupplierPaymentFormValues,
} from "./supplier-invoice-form-schema";

export function SupplierPaymentFields({
  form,
  copy,
  outstanding,
}: {
  form: UseFormReturn<
    SupplierPaymentFormValues,
    unknown,
    SupplierPaymentFormValues
  >;
  copy: typeof messages.inventory.supplierInvoices;
  outstanding: string;
}) {
  const amount = canonicalMoney(form.watch("amount"));
  const amountMinorUnits = parseMoneyToMinorUnits(amount);
  const outstandingMinorUnits = parseMoneyToMinorUnits(outstanding);
  const allocatedAmount = minorUnitsToCanonical(
    minimumMinorUnits([amountMinorUnits, outstandingMinorUnits]),
  );
  const advanceAmount = minorUnitsToCanonical(
    amountMinorUnits > outstandingMinorUnits
      ? amountMinorUnits - outstandingMinorUnits
      : 0n,
  );
  const methodOptions = useMemo(
    () => [
      { value: "bank_transfer", label: copy.paymentMethods.bank_transfer },
      { value: "cash", label: copy.paymentMethods.cash },
    ],
    [copy.paymentMethods.bank_transfer, copy.paymentMethods.cash],
  );

  return (
    <>
      <p className="text-sm font-medium text-muted-foreground">
        {copy.paymentOutstanding(formatVND(outstanding))}
      </p>
      <MoneyVndField
        control={form.control}
        name="amount"
        label={copy.paymentAmount}
        placeholder="0"
        required
      />
      <NoteCallout
        tone={parseMoneyToMinorUnits(advanceAmount) > 0n ? "warning" : "muted"}
      >
        <div className="flex flex-col gap-1 text-sm">
          <span>{copy.paymentTotalPreview(formatVND(amount))}</span>
          <span>
            {copy.paymentAllocatedPreview(formatVND(allocatedAmount))}
          </span>
          <span>{copy.paymentAdvancePreview(formatVND(advanceAmount))}</span>
        </div>
      </NoteCallout>
      <SelectField
        control={form.control}
        name="paymentMethod"
        label={copy.paymentMethod}
        options={methodOptions}
        required
      />
      <TextareaField
        control={form.control}
        name="referenceNote"
        label={copy.referenceNote}
        rows={3}
        placeholder={copy.referenceNotePlaceholder}
      />
    </>
  );
}

export function SupplierAdvanceFields({
  form,
  advances,
  outstanding,
  copy,
}: {
  form: UseFormReturn<
    SupplierAdvanceFormValues,
    unknown,
    SupplierAdvanceFormValues
  >;
  advances: SupplierAdvanceSummary[];
  outstanding: string;
  copy: typeof messages.inventory.supplierInvoices;
}) {
  const paymentId = Number(form.watch("paymentId") || 0);
  const selected = advances.find((advance) => advance.paymentId === paymentId);
  const amount = parseMoneyToMinorUnits(canonicalMoney(form.watch("amount")));
  const allocated = minorUnitsToCanonical(
    minimumMinorUnits([
      amount,
      parseMoneyToMinorUnits(canonicalMoney(selected?.advanceAmount ?? 0)),
      parseMoneyToMinorUnits(outstanding),
    ]),
  );

  return (
    <>
      <SelectField
        control={form.control}
        name="paymentId"
        label={copy.advanceSource}
        options={advances.map((advance) => ({
          value: String(advance.paymentId),
          label: copy.advanceSourceOption(
            formatSupplierInvoiceDate(advance.paymentDate),
            formatVND(advance.advanceAmount),
          ),
        }))}
        required
      />
      <MoneyVndField
        control={form.control}
        name="amount"
        label={copy.advanceAllocationAmount}
        required
      />
      <NoteCallout tone="muted">
        {copy.advanceAllocationPreview(formatVND(allocated))}
      </NoteCallout>
    </>
  );
}

export function SupplierCreditFields({
  form,
  copy,
}: {
  form: UseFormReturn<
    SupplierCreditFormValues,
    unknown,
    SupplierCreditFormValues
  >;
  copy: typeof messages.inventory.supplierInvoices;
}) {
  return (
    <>
      <TextField
        control={form.control}
        name="creditNumber"
        label={copy.creditNumberLabel}
        required
      />
      <MoneyVndField
        control={form.control}
        name="amount"
        label={copy.creditAmountLabel}
        required
      />
      <TextareaField
        control={form.control}
        name="notes"
        label={copy.creditReason}
        placeholder={copy.creditReasonPlaceholder}
        rows={3}
        required
      />
    </>
  );
}
