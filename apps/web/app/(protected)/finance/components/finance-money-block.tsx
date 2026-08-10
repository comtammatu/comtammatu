"use client";

import type { Control, FieldPath, FieldValues } from "react-hook-form";
import { Button } from "@comtammatu/ui/components/button";
import { MoneyVndField, SelectField } from "@/components/form";
import { messages } from "@lib/messages";
import { FinanceMoneySummary } from "./finance-money-summary";

const moneyLabels = messages.finance.moneyLabels;

export const FINANCE_VAT_RATE_OPTIONS = [
  { value: "0", label: "0%" },
  { value: "5", label: "5%" },
  { value: "8", label: "8%" },
  { value: "10", label: "10%" },
] as const;

/**
 * Layer A input row for net-first capture: taxable (chưa GTGT) → rate → VAT
 * (auto/manual) with optional recalculate. Surfaces with qty use unitPrice
 * separately; Chi phí uses taxableAmount as the primary field.
 */
export function FinanceMoneyBlockFields<TFieldValues extends FieldValues>({
  control,
  taxableName,
  vatRateName,
  vatAmountName,
  vatRateOptions = FINANCE_VAT_RATE_OPTIONS,
  readOnly = false,
  onRecalculateVat,
  className,
}: {
  control: Control<TFieldValues>;
  taxableName: FieldPath<TFieldValues>;
  vatRateName: FieldPath<TFieldValues>;
  vatAmountName: FieldPath<TFieldValues>;
  vatRateOptions?: readonly { value: string; label: string; disabled?: boolean }[];
  readOnly?: boolean;
  onRecalculateVat?: () => void;
  className?: string;
}) {
  return (
    <div
      className={
        className ??
        "grid items-end gap-3 md:grid-cols-[minmax(0,1fr)_10rem_minmax(0,1fr)_auto]"
      }
    >
      <MoneyVndField
        control={control}
        name={taxableName}
        label={moneyLabels.subtotalExVat}
        placeholder="0"
        required
        disabled={readOnly}
      />
      <SelectField
        control={control}
        name={vatRateName}
        label={moneyLabels.vatRate}
        options={vatRateOptions}
        required
        disabled={readOnly}
      />
      <MoneyVndField
        control={control}
        name={vatAmountName}
        label={moneyLabels.vatAmount}
        placeholder={moneyLabels.vatAutoPlaceholder}
        disabled={readOnly}
      />
      {!readOnly && onRecalculateVat ? (
        <Button
          type="button"
          variant="outline"
          className="self-end"
          onClick={onRecalculateVat}
        >
          {moneyLabels.recalculateVat}
        </Button>
      ) : null}
    </div>
  );
}

export {
  FinanceMoneySummary,
  moneyLabels,
};
