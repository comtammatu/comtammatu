"use client";

import { useMemo, useState, type ReactNode } from "react";
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
  initializeBranchCashOpening,
  initializeFinanceFunds,
} from "../cash-actions";
import type { CashSummary } from "../_lib/cash-cockpit";
import type { FinanceLocation } from "../_lib/finance-params";

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
const requiredFundDelta = z
  .string()
  .trim()
  .min(1, copy.cash.adjustmentZero)
  .refine((value) => {
    return (
      SIGNED_FUND_AMOUNT.test(value) &&
      (() => {
        const amount = parseMoneyToMinorUnits(value);
        return (
          amount !== 0n &&
          amount >= -MAX_FUND_MINOR_UNITS &&
          amount <= MAX_FUND_MINOR_UNITS
        );
      })()
    );
  }, copy.cash.adjustmentAmountInvalid);

function openingSchema(requireBank: boolean, branchIds: number[]) {
  const branchCash = Object.fromEntries(
    branchIds.map((id) => [String(id), requiredFundAmount]),
  );
  return z.object({
    bankBalance: requireBank ? requiredFundAmount : z.string(),
    boundaryMode: z.enum(["cutover_now", "project_start_day"]),
    date: z.string().date(copy.cash.openingDateInvalid),
    reason: z
      .string()
      .trim()
      .min(5, copy.cash.openingReasonRequired)
      .max(500, copy.cash.openingReasonTooLong),
    confirmed: z
      .boolean()
      .refine(Boolean, copy.cash.openingConfirmationRequired),
    idempotencyKey: z.string().uuid(),
    branchCash: z.object(branchCash),
  });
}

const adjustmentSchema = z
  .object({
    scope: z.enum(["cash", "bank"]),
    branchId: z.string(),
    delta: requiredFundDelta,
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
  .superRefine((value, ctx) => {
    if (value.scope !== "cash") return;
    const branchId = Number(value.branchId);
    if (!Number.isInteger(branchId) || branchId <= 0) {
      ctx.addIssue({
        code: "custom",
        message: copy.cash.adjustmentBranchRequired,
        path: ["branchId"],
      });
    }
  });

type OpeningValues = z.infer<ReturnType<typeof openingSchema>>;
type AdjustmentValues = z.infer<typeof adjustmentSchema>;
type DialogMode = "opening" | "adjustment" | null;

export function CurrentFundsSection({
  cash,
  location,
  selectedBranchId,
  vietqrRevenue,
  title,
  children,
}: {
  cash: CashSummary;
  location: FinanceLocation;
  selectedBranchId: number | null;
  vietqrRevenue: number;
  title?: string;
  children?: ReactNode;
}) {
  const router = useRouter();
  const isTouchLayout = useIsMobile(1024);
  const [dialogMode, setDialogMode] = useState<DialogMode>(null);
  const [requestKey, setRequestKey] = useState("");
  const isBranchScope = location === "branch" && selectedBranchId != null;
  const selectedBook = isBranchScope
    ? (cash.branches.find((branch) => branch.branchId === selectedBranchId) ??
      null)
    : null;
  const missingBranches = cash.branches.filter((branch) => !branch.hasOpening);
  const missingBranchKey = missingBranches
    .map((branch) => String(branch.branchId))
    .join(",");
  const openedBranches = cash.branches.filter((branch) => branch.hasOpening);
  const requireBank = !cash.hasCompanyOpening;
  const booksReady = cash.hasCompanyOpening && cash.branchesComplete;
  const cashReady = isBranchScope
    ? Boolean(selectedBook?.hasOpening)
    : cash.branchesComplete;
  const bankReady = cash.hasCompanyOpening;
  const openingDate = formatVNDateTime(
    isBranchScope
      ? (selectedBook?.openingEffectiveAt ?? null)
      : cash.openingEffectiveAt,
  );
  const branchCashOnHand = selectedBook?.cashOnHand ?? 0;
  const displayCash = isBranchScope ? branchCashOnHand : cash.cashOnHand;
  const totalOnHand = cash.cashOnHand + cash.bankOnHand;
  const currentOpeningSchema = useMemo(
    () =>
      openingSchema(
        requireBank,
        missingBranchKey
          ? missingBranchKey.split(",").map((id) => Number(id))
          : [],
      ),
    [missingBranchKey, requireBank],
  );
  const openingValues = useMemo<OpeningValues>(
    () => ({
      bankBalance: "",
      boundaryMode: "cutover_now",
      date: getVNDateString(),
      reason: "",
      confirmed: false,
      idempotencyKey: requestKey,
      branchCash: Object.fromEntries(
        missingBranches.map((branch) => [String(branch.branchId), ""]),
      ),
    }),
    [missingBranchKey, requestKey],
  );
  const adjustmentValues = useMemo<AdjustmentValues>(
    () => ({
      scope: "cash",
      branchId:
        selectedBranchId != null
          ? String(selectedBranchId)
          : String(openedBranches[0]?.branchId ?? ""),
      delta: "",
      reason: "",
      confirmed: false,
      idempotencyKey: requestKey,
    }),
    [openedBranches, requestKey, selectedBranchId],
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

  async function submitOpening(values: OpeningValues) {
    if (requireBank) {
      const bankResult = await initializeFinanceFunds({
        bankBalance: values.bankBalance,
        boundaryMode: values.boundaryMode,
        date: values.date,
        reason: values.reason,
        confirmed: values.confirmed,
        idempotencyKey: values.idempotencyKey,
      });
      if (!bankResult.success) return bankResult;
    }
    for (const branch of missingBranches) {
      const amount = values.branchCash[String(branch.branchId)];
      if (amount == null) continue;
      const result = await initializeBranchCashOpening({
        branchId: branch.branchId,
        balance: amount,
        boundaryMode: values.boundaryMode,
        date: values.date,
        reason: values.reason,
        confirmed: values.confirmed,
        idempotencyKey: crypto.randomUUID(),
      });
      if (!result.success) return result;
    }
    return { success: true as const };
  }

  async function submitAdjustment(values: AdjustmentValues) {
    const branchId = Number(values.branchId);
    return createFinanceFundAdjustment({
      cashDelta: values.scope === "cash" ? values.delta : "0",
      bankDelta: values.scope === "bank" ? values.delta : "0",
      branchId: values.scope === "cash" ? branchId : null,
      reason: values.reason,
      confirmed: values.confirmed,
      idempotencyKey: values.idempotencyKey,
    });
  }

  const fundsAction = (
    <Button
      variant="outline"
      size={isTouchLayout ? "touch" : "sm"}
      disabled={!cash.hasCompanyOpening && cash.legacySettingsPresent}
      onClick={() => openDialog(booksReady ? "adjustment" : "opening")}
    >
      {booksReady
        ? copy.cash.adjustmentAction
        : cash.legacySettingsPresent && !cash.hasCompanyOpening
          ? copy.cash.legacyBlockedAction
          : copy.cash.setOpening}
    </Button>
  );

  const companyFormula = (
    <KpiRow
      density="compact"
      className="grid-cols-1 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)]"
    >
      <div className="min-w-0 md:grid md:gap-2 xl:contents">
        <span className="min-h-0 md:min-h-6 xl:absolute xl:size-0" aria-hidden />
        <KpiCard
          density="compact"
          icon={<IconWallet className="size-4 text-muted-foreground" />}
          label={copy.basic.kpis.cashOnHand}
          labelTooltip={
            cashReady
              ? copy.cash.onHandBreakdown(
                  formatVND(cash.openingBalance),
                  formatVND(cash.cashInSince),
                  formatVND(cash.cashOutSince),
                  formatVND(cash.cashAdjustments),
                )
              : undefined
          }
          value={cashReady ? formatVND(cash.cashOnHand) : copy.cash.verifying}
          shortValue={cashReady ? formatCompactVND(cash.cashOnHand) : undefined}
          hint={
            cashReady
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
            bankReady
              ? copy.cash.bankBreakdown(
                  formatVND(cash.bankOpeningBalance),
                  formatVND(cash.bankInSince),
                  formatVND(cash.bankOutSince),
                  formatVND(cash.bankAdjustments),
                )
              : undefined
          }
          value={bankReady ? formatVND(cash.bankOnHand) : copy.cash.verifying}
          shortValue={bankReady ? formatCompactVND(cash.bankOnHand) : undefined}
          hint={
            bankReady
              ? copy.cash.openingMeta(formatVNDateTime(cash.openingEffectiveAt))
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
            cashReady && bankReady ? formatVND(totalOnHand) : copy.cash.verifying
          }
          shortValue={
            cashReady && bankReady ? formatCompactVND(totalOnHand) : undefined
          }
          tone={cashReady && bankReady ? "primary" : "warning"}
        />
      </div>
    </KpiRow>
  );

  const branchFormula = (
    <KpiRow density="compact" className="grid-cols-1 sm:grid-cols-2">
      <KpiCard
        density="compact"
        icon={<IconWallet className="size-4 text-muted-foreground" />}
        label={copy.basic.kpis.cashOnHand}
        labelTooltip={
          selectedBook?.hasOpening
            ? copy.cash.onHandBreakdown(
                formatVND(selectedBook.openingBalance),
                formatVND(selectedBook.cashInSince),
                formatVND(selectedBook.cashOutSince),
                formatVND(selectedBook.cashAdjustments),
              )
            : undefined
        }
        value={cashReady ? formatVND(displayCash) : copy.cash.verifying}
        shortValue={cashReady ? formatCompactVND(displayCash) : undefined}
        hint={
          cashReady
            ? copy.cash.openingMeta(openingDate)
            : cash.legacySettingsPresent
              ? copy.cash.noOpeningLegacy
              : undefined
        }
      />
      <KpiCard
        density="compact"
        label={copy.basic.kpis.vietqrRevenue}
        value={formatVND(vietqrRevenue)}
        shortValue={formatCompactVND(vietqrRevenue)}
        hint={copy.cash.vietqrPeriodHint}
      />
    </KpiRow>
  );

  return (
    <>
      <AppSection
        size="sm"
        title={title ?? copy.cash.onHandTitle}
        action={fundsAction}
      >
        {isBranchScope ? branchFormula : companyFormula}
        {!isBranchScope && cash.branches.length > 0 ? (
          <div className="grid gap-2">
            <p className="text-xs font-medium text-muted-foreground">
              {copy.cash.branchBooksTitle}
            </p>
            <ul className="grid gap-1">
              {cash.branches.map((branch) => (
                <li
                  key={branch.branchId}
                  className="flex items-baseline justify-between gap-3 text-sm"
                >
                  <span>{branch.branchName}</span>
                  <span className="font-mono tabular-nums">
                    {branch.hasOpening
                      ? formatVND(branch.cashOnHand)
                      : copy.cash.verifying}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {children}
      </AppSection>

      {!booksReady && !(cash.legacySettingsPresent && !cash.hasCompanyOpening) ? (
        <FormDialog
          open={dialogMode === "opening"}
          onOpenChange={closeDialog}
          entityKey={requestKey}
          title={copy.cash.openingTitle}
          description={copy.cash.openingDescription}
          schema={currentOpeningSchema}
          defaultValues={openingValues}
          onSubmit={submitOpening}
          submitLabel={copy.cash.openingSubmit}
          onSuccess={() => handleSuccess(copy.cash.openingSuccess)}
        >
          {(form) => (
            <>
              {requireBank ? (
                <MoneyVndField
                  control={form.control}
                  name="bankBalance"
                  label={copy.cash.openingBankLabel}
                  required
                />
              ) : null}
              {missingBranches.map((branch) => (
                <MoneyVndField
                  key={branch.branchId}
                  control={form.control}
                  name={`branchCash.${String(branch.branchId)}`}
                  label={copy.cash.openingBranchCashLabel(branch.branchName)}
                  required
                />
              ))}
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
      ) : booksReady ? (
        <FormDialog
          open={dialogMode === "adjustment"}
          onOpenChange={closeDialog}
          entityKey={requestKey}
          title={copy.cash.adjustmentTitle}
          description={copy.cash.adjustmentDescription}
          schema={adjustmentSchema}
          defaultValues={adjustmentValues}
          onSubmit={submitAdjustment}
          submitLabel={copy.cash.adjustmentSubmit}
          onSuccess={() => handleSuccess(copy.cash.adjustmentSuccess)}
        >
          {(form) => (
            <>
              <SelectField
                control={form.control}
                name="scope"
                label={copy.cash.adjustmentScopeLabel}
                options={[
                  {
                    value: "cash",
                    label: copy.cash.adjustmentScopeCash,
                  },
                  {
                    value: "bank",
                    label: copy.cash.adjustmentScopeBank,
                  },
                ]}
                required
              />
              {form.watch("scope") === "cash" ? (
                <SelectField
                  control={form.control}
                  name="branchId"
                  label={copy.cash.adjustmentBranchLabel}
                  options={openedBranches.map((branch) => ({
                    value: String(branch.branchId),
                    label: branch.branchName,
                  }))}
                  required
                />
              ) : null}
              <MoneyVndField
                control={form.control}
                name="delta"
                label={
                  form.watch("scope") === "bank"
                    ? copy.cash.adjustmentBankLabel
                    : copy.cash.adjustmentCashLabel
                }
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
