"use client";

import { useMemo, useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { SettingsFormSection } from "@/components/settings-form-section";
import { ComboboxField, TextField } from "@/components/form";
import { DescriptionList } from "@/components/surface";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@comtammatu/ui/components/collapsible";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@comtammatu/ui/components/field";
import { NoteCallout } from "@comtammatu/ui/components/note-callout";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { Input } from "@comtammatu/ui/components/input";
import { Switch } from "@comtammatu/ui/components/switch";
import { toast } from "@comtammatu/ui/components/sonner";
import { ERRORS_VI } from "@comtammatu/shared/messages";
import { SYSTEM_SETTING_KEYS } from "@comtammatu/shared/settings";
import { messages } from "@lib/messages";
import { findVietQrBank, type VietQrBank } from "@lib/vietqr/banks";
import { updatePaymentSettings } from "./actions";

const SAMPLE_PAYMENT_SUFFIX = "A1B2C3D4E5F6";
const copy = messages.settings.payments;

const paymentContentTokenSchema = z
  .string()
  .trim()
  .min(2)
  .max(16)
  .regex(/^[A-Za-z0-9]+$/, {
    error: "Mã nội dung chỉ chứa chữ và số, không khoảng trắng.",
  });

const paymentsSchema = z.object({
  enable_vietqr: z.boolean(),
  vietqr_bank_code: z
    .string()
    .trim()
    .max(32)
    .regex(/^[A-Za-z0-9]*$/, {
      error: "Mã NH chỉ chứa chữ và số (vd: TCB, VCB, 970407).",
    }),
  vietqr_account_no: z
    .string()
    .trim()
    .max(32)
    .regex(/^[A-Za-z0-9]*$/, {
      error: "STK chỉ chứa chữ và số (không khoảng trắng).",
    }),
  vietqr_account_name: z.string().trim().max(64),
  vietqr_code_prefix: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .regex(/^[A-Za-z0-9 ]+$/, {
      error: "Tiền tố chỉ chứa chữ, số và khoảng trắng.",
    }),
  content_prefix: paymentContentTokenSchema,
  content_expense_token: paymentContentTokenSchema,
  content_cash_deposit_token: paymentContentTokenSchema,
});

type PaymentsFormValues = z.infer<typeof paymentsSchema>;

function normalizePaymentCodePrefix(value: string): string {
  return value.toUpperCase().replace(/\s+/g, " ").trim();
}

function normalizePaymentContentToken(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "")
    .trim();
}

interface PaymentsFormProps {
  settings: Record<string, string>;
  banks: VietQrBank[];
  banksUnavailable: boolean;
  sepayEnvConfigured: boolean;
}

export function PaymentsForm({
  settings,
  banks,
  banksUnavailable,
  sepayEnvConfigured,
}: PaymentsFormProps) {
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const storedBank = settings[SYSTEM_SETTING_KEYS.PAYMENT_VIETQR_BANK_CODE] ?? "";
  const resolvedBankCode =
    findVietQrBank(banks, storedBank)?.code ?? storedBank.toUpperCase();

  const form = useForm<PaymentsFormValues, unknown, PaymentsFormValues>({
    resolver: zodResolver(paymentsSchema),
    defaultValues: {
      enable_vietqr:
        settings[SYSTEM_SETTING_KEYS.PAYMENT_ENABLE_VIETQR] === "true",
      vietqr_bank_code: resolvedBankCode,
      vietqr_account_no:
        settings[SYSTEM_SETTING_KEYS.PAYMENT_VIETQR_ACCOUNT_NO] ?? "",
      vietqr_account_name:
        settings[SYSTEM_SETTING_KEYS.PAYMENT_VIETQR_ACCOUNT_NAME] ?? "",
      vietqr_code_prefix:
        settings[SYSTEM_SETTING_KEYS.PAYMENT_VIETQR_CODE_PREFIX] ?? "",
      content_prefix:
        settings[SYSTEM_SETTING_KEYS.PAYMENT_CONTENT_PREFIX] ?? "MATU",
      content_expense_token:
        settings[SYSTEM_SETTING_KEYS.PAYMENT_CONTENT_EXPENSE_TOKEN] ?? "CHI",
      content_cash_deposit_token:
        settings[SYSTEM_SETTING_KEYS.PAYMENT_CONTENT_CASH_DEPOSIT_TOKEN] ??
        "NOP",
    },
  });

  const enableVietqr = form.watch("enable_vietqr");
  const normalizedCodePrefix = normalizePaymentCodePrefix(
    form.watch("vietqr_code_prefix"),
  );
  const paymentCodePreview = normalizedCodePrefix
    ? `${normalizedCodePrefix} ${SAMPLE_PAYMENT_SUFFIX}`
    : null;
  const codePrefixError = form.formState.errors.vietqr_code_prefix;
  const normalizedContentPrefix = normalizePaymentContentToken(
    form.watch("content_prefix"),
  );
  const normalizedExpenseToken = normalizePaymentContentToken(
    form.watch("content_expense_token"),
  );
  const normalizedCashDepositToken = normalizePaymentContentToken(
    form.watch("content_cash_deposit_token"),
  );
  const contentPreview = (token: string, suffix?: string) =>
    normalizedContentPrefix && token
      ? `${normalizedContentPrefix} ${token}${suffix ? ` ${suffix}` : ""}`
      : copy.codePreviewEmpty;

  const bankOptions = useMemo(
    () =>
      banks.map((bank) => ({
        value: bank.code,
        label: bank.shortName,
        hint: bank.code,
        keywords: [bank.code, bank.bin, bank.name, bank.shortName],
      })),
    [banks],
  );

  function onValid(values: PaymentsFormValues) {
    startTransition(async () => {
      setServerError(null);
      const fd = new FormData();
      if (values.enable_vietqr) {
        fd.set(SYSTEM_SETTING_KEYS.PAYMENT_ENABLE_VIETQR, "true");
      }
      fd.set(
        SYSTEM_SETTING_KEYS.PAYMENT_VIETQR_BANK_CODE,
        values.vietqr_bank_code,
      );
      fd.set(
        SYSTEM_SETTING_KEYS.PAYMENT_VIETQR_ACCOUNT_NO,
        values.vietqr_account_no,
      );
      fd.set(
        SYSTEM_SETTING_KEYS.PAYMENT_VIETQR_ACCOUNT_NAME,
        values.vietqr_account_name,
      );
      fd.set(
        SYSTEM_SETTING_KEYS.PAYMENT_VIETQR_CODE_PREFIX,
        values.vietqr_code_prefix,
      );
      fd.set(SYSTEM_SETTING_KEYS.PAYMENT_CONTENT_PREFIX, values.content_prefix);
      fd.set(
        SYSTEM_SETTING_KEYS.PAYMENT_CONTENT_EXPENSE_TOKEN,
        values.content_expense_token,
      );
      fd.set(
        SYSTEM_SETTING_KEYS.PAYMENT_CONTENT_CASH_DEPOSIT_TOKEN,
        values.content_cash_deposit_token,
      );
      const result = await updatePaymentSettings(null, fd);
      if (!result.success) {
        setServerError(result.error ?? ERRORS_VI.fallback);
        return;
      }
      form.reset(values);
      toast.success(copy.saved);
    });
  }

  return (
    <form
      onSubmit={form.handleSubmit(onValid)}
      noValidate
      className="flex flex-col gap-4"
    >
      <SettingsFormSection
        title={copy.accountSectionTitle}
        description={copy.accountSectionDescription}
      >
        <Controller
          control={form.control}
          name="enable_vietqr"
          render={({ field }) => (
            <Field orientation="horizontal">
              <FieldContent>
                <FieldLabel htmlFor="enable-vietqr">{copy.vietqrLabel}</FieldLabel>
                <FieldDescription id="enable-vietqr-description">
                  {field.value ? copy.vietqrEnabled : copy.vietqrDisabled}
                </FieldDescription>
              </FieldContent>
              <Switch
                id="enable-vietqr"
                checked={field.value}
                onCheckedChange={field.onChange}
                aria-describedby="enable-vietqr-description"
              />
            </Field>
          )}
        />

        {enableVietqr ? (
          <div className="flex flex-col gap-3">
            {banksUnavailable ? (
              <NoteCallout tone="warning">{copy.bankListUnavailable}</NoteCallout>
            ) : null}

            {bankOptions.length > 0 ? (
              <ComboboxField
                control={form.control}
                name="vietqr_bank_code"
                id="vietqr-bank-code"
                label={copy.bankCode}
                options={bankOptions}
                placeholder={copy.bankPlaceholder}
                searchPlaceholder={copy.bankSearchPlaceholder}
                emptyMessage={copy.bankEmpty}
              />
            ) : (
              <TextField
                control={form.control}
                name="vietqr_bank_code"
                id="vietqr-bank-code"
                label={copy.bankCode}
                autoCapitalize="characters"
                placeholder="TCB"
              />
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <TextField
                control={form.control}
                name="vietqr_account_no"
                id="vietqr-account-no"
                label={copy.accountNo}
                autoCapitalize="characters"
                placeholder="19035xxxxxxxx"
              />
              <TextField
                control={form.control}
                name="vietqr_account_name"
                id="vietqr-account-name"
                label={copy.accountName}
                placeholder="CONG TY CO PHAN CHEN SU"
              />
            </div>
          </div>
        ) : null}
      </SettingsFormSection>

      {enableVietqr ? (
        <SettingsFormSection
          title={copy.memoSectionTitle}
          description={copy.memoSectionDescription}
        >
          <Field>
            <FieldLabel htmlFor="vietqr-code-prefix">{copy.codePrefix}</FieldLabel>
            <Input
              id="vietqr-code-prefix"
              autoCapitalize="characters"
              placeholder="QAJZRU5550 MBBMS01382716 1"
              aria-invalid={Boolean(codePrefixError)}
              aria-describedby={`vietqr-code-prefix-help${
                codePrefixError ? " vietqr-code-prefix-error" : ""
              }`}
              {...form.register("vietqr_code_prefix")}
            />
            {codePrefixError ? (
              <FieldError
                id="vietqr-code-prefix-error"
                errors={[codePrefixError]}
              />
            ) : null}
            <FieldDescription id="vietqr-code-prefix-help">
              {copy.codePrefixHelp}
            </FieldDescription>
          </Field>
          <DescriptionList
            items={[
              {
                term: copy.codePreviewLabel,
                description: paymentCodePreview ? (
                  <code className="font-mono text-xs">{paymentCodePreview}</code>
                ) : (
                  copy.codePreviewEmpty
                ),
              },
            ]}
          />
        </SettingsFormSection>
      ) : null}

      <SettingsFormSection
        title={copy.sepayLabel}
        description={copy.sepayDescription}
      >
        <DescriptionList
          className="grid gap-3 sm:grid-cols-2"
          items={[
            {
              term: copy.envStatus,
              description: (
                <Badge variant={sepayEnvConfigured ? "success" : "warning"}>
                  {sepayEnvConfigured ? copy.envConfigured : copy.envMissing}
                </Badge>
              ),
            },
            {
              term: copy.sepayEndpointLabel,
              description: (
                <code className="font-mono text-xs">{copy.sepayEndpoint}</code>
              ),
            },
          ]}
        />
        {!sepayEnvConfigured ? (
          <NoteCallout tone="warning">{copy.sepayEnvMissingNote}</NoteCallout>
        ) : null}
      </SettingsFormSection>

      <Collapsible>
        <CollapsibleTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full justify-start px-0"
            />
          }
        >
          {copy.contentSectionToggle}
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2">
          <SettingsFormSection
            title={copy.contentSectionTitle}
            description={copy.contentHelp}
          >
            <NoteCallout tone="muted">{copy.contentCategoryRule}</NoteCallout>
            <div className="grid gap-3 sm:grid-cols-3">
              <TextField
                control={form.control}
                name="content_prefix"
                id="content-prefix"
                label={copy.contentPrefix}
                autoCapitalize="characters"
                placeholder="MATU"
              />
              <TextField
                control={form.control}
                name="content_expense_token"
                id="content-expense-token"
                label={copy.contentExpenseToken}
                autoCapitalize="characters"
                placeholder="CHI"
              />
              <TextField
                control={form.control}
                name="content_cash_deposit_token"
                id="content-cash-deposit-token"
                label={copy.contentCashDepositToken}
                autoCapitalize="characters"
                placeholder="NOP"
              />
            </div>
            <DescriptionList
              className="grid gap-3 sm:grid-cols-2"
              items={[
                {
                  term: copy.contentExpensePreview,
                  description: (
                    <code className="font-mono text-xs">
                      {contentPreview(normalizedExpenseToken, "123")}
                    </code>
                  ),
                },
                {
                  term: copy.contentCashDepositPreview,
                  description: (
                    <code className="font-mono text-xs">
                      {contentPreview(normalizedCashDepositToken, "12")}
                    </code>
                  ),
                },
              ]}
            />
          </SettingsFormSection>
        </CollapsibleContent>
      </Collapsible>

      {serverError && (
        <p className="text-sm text-destructive" role="alert">
          {serverError}
        </p>
      )}

      <div className="flex justify-end">
        <Button
          type="submit"
          disabled={isPending || !form.formState.isDirty}
        >
          {isPending && <Spinner className="mr-2" />}
          {copy.saveSettings}
        </Button>
      </div>
    </form>
  );
}
