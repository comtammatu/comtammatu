"use client";

import { useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { SettingsFormSection } from "@/components/settings-form-section";
import { TextField } from "@/components/form";
import { DescriptionList } from "@/components/surface";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@comtammatu/ui/components/tabs";
import { toast } from "@comtammatu/ui/components/sonner";
import { ERRORS_VI } from "@comtammatu/shared/messages";
import { SYSTEM_SETTING_KEYS } from "@comtammatu/shared/settings";
import { messages } from "@lib/messages";
import { updatePaymentSettings } from "./actions";

const SAMPLE_PAYMENT_SUFFIX = "A1B2C3D4E5F6";

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
  sepayEnvConfigured: boolean;
}

export function PaymentsForm({
  settings,
  sepayEnvConfigured,
}: PaymentsFormProps) {
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<PaymentsFormValues, unknown, PaymentsFormValues>({
    resolver: zodResolver(paymentsSchema),
    defaultValues: {
      enable_vietqr:
        settings[SYSTEM_SETTING_KEYS.PAYMENT_ENABLE_VIETQR] === "true",
      vietqr_bank_code:
        settings[SYSTEM_SETTING_KEYS.PAYMENT_VIETQR_BANK_CODE] ?? "",
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
      : messages.settings.payments.codePreviewEmpty;

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
      toast.success(messages.settings.payments.saved);
    });
  }

  return (
    <form
      onSubmit={form.handleSubmit(onValid)}
      noValidate
      className="flex flex-col gap-4"
    >
      <Tabs defaultValue="connection" className="flex flex-col gap-4">
        <TabsList size="touch" className="w-fit">
          <TabsTrigger value="connection">
            {messages.settings.payments.connectionTab}
          </TabsTrigger>
          <TabsTrigger value="edit">
            {messages.settings.payments.editTab}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="connection" className="mt-0 flex flex-col gap-4">
          <SettingsFormSection
            title={messages.settings.payments.sectionTitle}
            description={messages.settings.payments.vietqrDescription}
          >
            <Controller
              control={form.control}
              name="enable_vietqr"
              render={({ field }) => (
                <Field orientation="horizontal">
                  <FieldContent>
                    <FieldLabel htmlFor="enable-vietqr">
                      {messages.settings.payments.vietqrLabel}
                    </FieldLabel>
                    <FieldDescription id="enable-vietqr-description">
                      {field.value
                        ? messages.settings.payments.vietqrEnabled
                        : messages.settings.payments.vietqrDisabled}
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

            <div className="grid items-start gap-3 sm:grid-cols-3">
              <TextField
                control={form.control}
                name="vietqr_bank_code"
                id="vietqr-bank-code"
                label={messages.settings.payments.bankCode}
                placeholder={messages.settings.payments.bankCodePlaceholder}
                autoCapitalize="characters"
              />
              <TextField
                control={form.control}
                name="vietqr_account_no"
                id="vietqr-account-no"
                label={messages.settings.payments.accountNo}
                autoCapitalize="characters"
                placeholder="19035xxxxxxxx"
              />
              <TextField
                control={form.control}
                name="vietqr_account_name"
                id="vietqr-account-name"
                label={messages.settings.payments.accountName}
                placeholder="CONG TY CO PHAN CHEN SU"
              />
            </div>

            <Field>
              <FieldLabel htmlFor="vietqr-code-prefix">
                {messages.settings.payments.codePrefix}
              </FieldLabel>
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
                {messages.settings.payments.codePrefixHelp}
              </FieldDescription>
            </Field>
            <DescriptionList
              className="grid gap-3 sm:grid-cols-3"
              items={[
                {
                  term: messages.settings.payments.codeModelOwnerLabel,
                  description: (
                    <code className="font-mono text-xs">
                      {normalizedCodePrefix ||
                        messages.settings.payments.codePreviewEmpty}
                    </code>
                  ),
                },
                {
                  term: messages.settings.payments.codeModelSuffixLabel,
                  description: (
                    <code className="font-mono text-xs">
                      {SAMPLE_PAYMENT_SUFFIX}
                    </code>
                  ),
                },
                {
                  term: messages.settings.payments.codeModelFinalLabel,
                  description: paymentCodePreview ? (
                    <code className="font-mono text-xs">
                      {paymentCodePreview}
                    </code>
                  ) : (
                    messages.settings.payments.codePreviewEmpty
                  ),
                },
              ]}
            />
          </SettingsFormSection>

          <SettingsFormSection
            title={messages.settings.payments.sepayLabel}
            description={messages.settings.payments.sepayDescription}
          >
            <DescriptionList
              className="grid gap-3 sm:grid-cols-2"
              items={[
                {
                  term: messages.settings.payments.envStatus,
                  description: (
                    <Badge variant={sepayEnvConfigured ? "success" : "warning"}>
                      {sepayEnvConfigured
                        ? messages.settings.payments.envConfigured
                        : messages.settings.payments.envMissing}
                    </Badge>
                  ),
                },
                {
                  term: messages.settings.payments.sepayEndpointLabel,
                  description: (
                    <code className="font-mono text-xs">
                      {messages.settings.payments.sepayEndpoint}
                    </code>
                  ),
                },
              ]}
            />
          </SettingsFormSection>
        </TabsContent>

        <TabsContent value="edit" className="mt-0">
          <SettingsFormSection
            title={messages.settings.payments.contentSectionTitle}
            description={messages.settings.payments.contentHelp}
          >
            <div className="flex flex-col gap-4">
              <NoteCallout
                label={messages.settings.payments.contentCategoryRuleLabel}
              >
                {messages.settings.payments.contentCategoryRule}
              </NoteCallout>

              <div className="grid gap-3 sm:grid-cols-3">
                <TextField
                  control={form.control}
                  name="content_prefix"
                  id="content-prefix"
                  label={messages.settings.payments.contentPrefix}
                  autoCapitalize="characters"
                  placeholder="MATU"
                />
                <TextField
                  control={form.control}
                  name="content_expense_token"
                  id="content-expense-token"
                  label={messages.settings.payments.contentExpenseToken}
                  autoCapitalize="characters"
                  placeholder="CHI"
                />
                <TextField
                  control={form.control}
                  name="content_cash_deposit_token"
                  id="content-cash-deposit-token"
                  label={messages.settings.payments.contentCashDepositToken}
                  autoCapitalize="characters"
                  placeholder="NOP"
                />
              </div>

              <DescriptionList
                className="grid gap-3 sm:grid-cols-2"
                items={[
                  {
                    term: messages.settings.payments.contentExpensePreview,
                    description: (
                      <code className="font-mono text-xs">
                        {contentPreview(normalizedExpenseToken, "123")}
                      </code>
                    ),
                  },
                  {
                    term: messages.settings.payments.contentCashDepositPreview,
                    description: (
                      <code className="font-mono text-xs">
                        {contentPreview(normalizedCashDepositToken)}
                      </code>
                    ),
                  },
                ]}
              />
            </div>
          </SettingsFormSection>
        </TabsContent>
      </Tabs>

      {serverError && (
        <p className="text-sm text-destructive" role="alert">
          {serverError}
        </p>
      )}

      <div className="flex justify-end">
        <Button type="submit" disabled={isPending}>
          {isPending && <Spinner className="mr-2" />}
          {messages.settings.payments.saveSettings}
        </Button>
      </div>
    </form>
  );
}
