"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Controller } from "react-hook-form";
import { z } from "zod";
import { Landmark as IconBank, Wallet as IconWallet } from "lucide-react";
import {
  formatAccountingVND as formatVND,
  formatCompactVND,
} from "@comtammatu/shared/format";
import { parseMoneyToMinorUnits } from "@comtammatu/shared/money";
import { formatVNDateTime, getVNDateString } from "@comtammatu/shared/time";
import { Button } from "@comtammatu/ui/components/button";
import { Checkbox } from "@comtammatu/ui/components/checkbox";
import { Field, FieldError, FieldLabel } from "@comtammatu/ui/components/field";
import { toast } from "@comtammatu/ui/components/sonner";
import { useIsMobile } from "@comtammatu/ui/hooks/use-mobile";
import {
  BusinessDateField,
  FormDialog,
  MoneyVndField,
  SelectField,
  TextareaField,
} from "@/components/form";
import { KpiCard } from "@/components/kpi/kpi-card";
import { AppSection, KpiRow } from "@/components/surface";
import { messages } from "@lib/messages";
import {
  createFinanceFundAdjustment,
  initializeFinanceFunds,
} from "../cash-actions";
import type { CashSummary } from "../_lib/cash-cockpit";

const copy = messages.finance;
const formulaOperatorClass =
  "flex min-h-6 items-center justify-center font-heading text-lg font-semibold text-muted-foreground xl:min-h-0 xl:self-center";
const FUND_AMOUNT = /^(?:0|[1-9]\d{0,12})(?:\.\d{1,2})?$/;
const SIGNED_FUND_AMOUNT = /^-?(?:0|[1-9]\d{0,12})(?:\.\d{1,2})?$/;
const MAX_FUND_MINOR_UNITS = 999_999_999_999_999n;
const requiredFundAmount = z
  .string()
  .trim()
  .min(1, copy.cash.openingAmountRequired)
  .refine(
    (value) =>
      FUND_AMOUNT.test(value) &&
      parseMoneyToMinorUnits(value) <= MAX_FUND_MINOR_UNITS,
    copy.cash.openingAmountInvalid,
  );
const optionalFundDelta = z
  .string()
  .trim()
  .refine((value) => {
    if (value === "") return true;
    return (
      SIGNED_FUND_AMOUNT.test(value) &&
      (() => {
        const amount = parseMoneyToMinorUnits(value);
        return (
          amount >= -MAX_FUND_MINOR_UNITS && amount <= MAX_FUND_MINOR_UNITS
        );
      })()
    );
  }, copy.cash.adjustmentAmountInvalid);

const openingSchema = z.object({
  balance: requiredFundAmount,
  bankBalance: requiredFundAmount,
  boundaryMode: z.enum(["cutover_now", "project_start_day"]),
  date: z.string().date(copy.cash.openingDateInvalid),
  reason: z
    .string()
    .trim()
    .min(5, copy.cash.openingReasonRequired)
    .max(500, copy.cash.openingReasonTooLong),
  confirmed: z.boolean().refine(Boolean, copy.cash.openingConfirmationRequired),
  idempotencyKey: z.string().uuid(),
});

const adjustmentSchema = z
  .object({
    cashDelta: optionalFundDelta,
    bankDelta: optionalFundDelta,
    reason: z
      .string()
      .trim()
      .min(5, copy.cash.adjustmentReasonRequired)
      .max(500, copy.cash.adjustmentReasonTooLong),
    confirmed: z
      .boolean()
      .refine(Boolean, copy.cash.adjustmentConfirmationRequired),
    idempotencyKey: z.string().uuid(),
  })
  .refine(
    ({ cashDelta, bankDelta }) =>
      parseMoneyToMinorUnits(cashDelta || "0") !== 0n ||
      parseMoneyToMinorUnits(bankDelta || "0") !== 0n,
    {
      message: copy.cash.adjustmentZero,
      path: ["cashDelta"],
    },
  );

type OpeningValues = z.infer<typeof openingSchema>;
type AdjustmentValues = z.infer<typeof adjustmentSchema>;
type DialogMode = "opening" | "adjustment" | null;

export function CurrentFundsSection({
  cash,
  embedded = false,
}: {
  cash: CashSummary;
  embedded?: boolean;
}) {
  const router = useRouter();
  const isTouchLayout = useIsMobile(1024);
  const [dialogMode, setDialogMode] = useState<DialogMode>(null);
  const [requestKey, setRequestKey] = useState("");
  const openingValues = useMemo<OpeningValues>(
    () => ({
      balance: "",
      bankBalance: "",
      boundaryMode: "cutover_now",
      date: getVNDateString(),
      reason: "",
      confirmed: false,
      idempotencyKey: requestKey,
    }),
    [requestKey],
  );
  const adjustmentValues = useMemo<AdjustmentValues>(
    () => ({
      cashDelta: "",
      bankDelta: "",
      reason: "",
      confirmed: false,
      idempotencyKey: requestKey,
    }),
    [requestKey],
  );

  function openDialog(mode: Exclude<DialogMode, null>) {
    setRequestKey(crypto.randomUUID());
    setDialogMode(mode);
  }

  function closeDialog(open: boolean) {
    if (!open) setDialogMode(null);
  }

  function handleSuccess(message: string) {
    toast.success(message);
    router.refresh();
  }

  const openingDate = formatVNDateTime(cash.openingEffectiveAt);
  const totalOnHand = cash.cashOnHand + cash.bankOnHand;
  const fundsAction = (
    <Button
      variant="outline"
      size={isTouchLayout ? "touch" : "sm"}
      disabled={!cash.hasOpening && cash.legacySettingsPresent}
      onClick={() => openDialog(cash.hasOpening ? "adjustment" : "opening")}
    >
      {cash.hasOpening
        ? copy.cash.adjustmentAction
        : cash.legacySettingsPresent
          ? copy.cash.legacyBlockedAction
          : copy.cash.setOpening}
    </Button>
  );
  const fundsFormula = (
        <KpiRow
          density="compact"
          className="grid-cols-1 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)]"
        >
          <div className="min-w-0 md:grid md:gap-2 xl:contents">
            <span
              className="min-h-0 md:min-h-6 xl:absolute xl:size-0"
              aria-hidden
            />
            <KpiCard
              density="compact"
              icon={<IconWallet className="size-4 text-muted-foreground" />}
              label={copy.basic.kpis.cashOnHand}
              labelTooltip={
                cash.hasOpening
                  ? copy.cash.onHandBreakdown(
                      formatVND(cash.openingBalance),
                      formatVND(cash.cashInSince),
                      formatVND(cash.cashOutSince),
                      formatVND(cash.cashAdjustments),
                    )
                  : undefined
              }
              value={
                cash.hasOpening
                  ? formatVND(cash.cashOnHand)
                  : copy.cash.verifying
              }
              shortValue={
                cash.hasOpening ? formatCompactVND(cash.cashOnHand) : undefined
              }
              hint={
                cash.hasOpening
                  ? copy.cash.openingMeta(openingDate)
                  : cash.legacySettingsPresent
                    ? copy.cash.noOpeningLegacy
                    : undefined
              }
            />
          </div>

          <div className="grid min-w-0 gap-2 xl:contents">
            <span className={formulaOperatorClass}>
              <span aria-hidden>+</span>
              <span className="sr-only">{copy.basic.operators.add}</span>
            </span>
            <KpiCard
              density="compact"
              icon={<IconBank className="size-4 text-muted-foreground" />}
              label={copy.basic.kpis.bankOnHand}
              labelTooltip={
                cash.hasOpening
                  ? copy.cash.bankBreakdown(
                      formatVND(cash.bankOpeningBalance),
                      formatVND(cash.bankInSince),
                      formatVND(cash.bankOutSince),
                      formatVND(cash.bankAdjustments),
                    )
                  : undefined
              }
              value={
                cash.hasOpening
                  ? formatVND(cash.bankOnHand)
                  : copy.cash.verifying
              }
              shortValue={
                cash.hasOpening ? formatCompactVND(cash.bankOnHand) : undefined
              }
              hint={
                cash.hasOpening
                  ? copy.cash.openingMeta(openingDate)
                  : cash.legacySettingsPresent
                    ? copy.cash.noOpeningLegacy
                    : undefined
              }
              href="/finance/bank-transactions"
            />
          </div>

          <div className="grid min-w-0 gap-2 xl:contents">
            <span className={formulaOperatorClass}>
              <span aria-hidden>=</span>
              <span className="sr-only">{copy.basic.operators.equals}</span>
            </span>
            <KpiCard
              density="compact"
              label={copy.basic.kpis.totalOnHand}
              value={
                cash.hasOpening ? formatVND(totalOnHand) : copy.cash.verifying
              }
              shortValue={
                cash.hasOpening ? formatCompactVND(totalOnHand) : undefined
              }
              tone={cash.hasOpening ? "primary" : "warning"}
            />
          </div>
        </KpiRow>
  );

  return (
    <>
      {embedded ? (
        <div className="flex flex-col gap-3">
          <div className="flex justify-end">{fundsAction}</div>
          {fundsFormula}
        </div>
      ) : (
        <AppSection size="sm" title={copy.cash.onHandTitle} action={fundsAction}>
          {fundsFormula}
        </AppSection>
      )}

      {!cash.hasOpening && !cash.legacySettingsPresent ? (
        <FormDialog
          open={dialogMode === "opening"}
          onOpenChange={closeDialog}
          entityKey={requestKey}
          title={copy.cash.openingTitle}
          description={copy.cash.openingDescription}
          schema={openingSchema}
          defaultValues={openingValues}
          onSubmit={initializeFinanceFunds}
          submitLabel={copy.cash.openingSubmit}
          onSuccess={() => handleSuccess(copy.cash.openingSuccess)}
        >
          {(form) => (
            <>
              <MoneyVndField
                control={form.control}
                name="balance"
                label={copy.cash.openingBalanceLabel}
                required
              />
              <MoneyVndField
                control={form.control}
                name="bankBalance"
                label={copy.cash.openingBankLabel}
                required
              />
              <SelectField
                control={form.control}
                name="boundaryMode"
                label={copy.cash.openingBoundaryLabel}
                options={[
                  {
                    value: "cutover_now",
                    label: copy.cash.openingBoundaryNow,
                  },
                  {
                    value: "project_start_day",
                    label: copy.cash.openingBoundaryProjectStart,
                  },
                ]}
                description={copy.cash.openingBoundaryDescription}
                required
              />
              {form.watch("boundaryMode") === "project_start_day" ? (
                <BusinessDateField
                  control={form.control}
                  name="date"
                  label={copy.cash.openingDateLabel}
                  description={copy.cash.openingDateDescription}
                  required
                />
              ) : null}
              <TextareaField
                control={form.control}
                name="reason"
                label={copy.cash.openingReasonLabel}
                description={copy.cash.openingReasonDescription}
                maxLength={500}
                required
              />
              <Controller
                control={form.control}
                name="confirmed"
                render={({ field, fieldState }) => (
                  <Field data-invalid={!!fieldState.error}>
                    <div className="flex items-start gap-3">
                      <Checkbox
                        id="finance-opening-confirmed"
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        aria-invalid={!!fieldState.error}
                      />
                      <FieldLabel
                        htmlFor="finance-opening-confirmed"
                        className="font-normal leading-snug"
                      >
                        {copy.cash.openingConfirmation}
                      </FieldLabel>
                    </div>
                    {fieldState.error ? (
                      <FieldError errors={[fieldState.error]} />
                    ) : null}
                  </Field>
                )}
              />
            </>
          )}
        </FormDialog>
      ) : cash.hasOpening ? (
        <FormDialog
          open={dialogMode === "adjustment"}
          onOpenChange={closeDialog}
          entityKey={requestKey}
          title={copy.cash.adjustmentTitle}
          description={copy.cash.adjustmentDescription}
          schema={adjustmentSchema}
          defaultValues={adjustmentValues}
          onSubmit={createFinanceFundAdjustment}
          submitLabel={copy.cash.adjustmentSubmit}
          onSuccess={() => handleSuccess(copy.cash.adjustmentSuccess)}
        >
          {(form) => (
            <>
              <MoneyVndField
                control={form.control}
                name="cashDelta"
                label={copy.cash.adjustmentCashLabel}
                description={copy.cash.adjustmentSignedHint}
                allowNegative
                required
              />
              <MoneyVndField
                control={form.control}
                name="bankDelta"
                label={copy.cash.adjustmentBankLabel}
                description={copy.cash.adjustmentSignedHint}
                allowNegative
                required
              />
              <TextareaField
                control={form.control}
                name="reason"
                label={copy.cash.adjustmentReasonLabel}
                description={copy.cash.adjustmentReasonDescription}
                maxLength={500}
                required
              />
              <Controller
                control={form.control}
                name="confirmed"
                render={({ field, fieldState }) => (
                  <Field data-invalid={!!fieldState.error}>
                    <div className="flex items-start gap-3">
                      <Checkbox
                        id="finance-adjustment-confirmed"
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        aria-invalid={!!fieldState.error}
                      />
                      <FieldLabel
                        htmlFor="finance-adjustment-confirmed"
                        className="font-normal leading-snug"
                      >
                        {copy.cash.adjustmentConfirmation}
                      </FieldLabel>
                    </div>
                    {fieldState.error ? (
                      <FieldError errors={[fieldState.error]} />
                    ) : null}
                  </Field>
                )}
              />
            </>
          )}
        </FormDialog>
      ) : null}
    </>
  );
}
