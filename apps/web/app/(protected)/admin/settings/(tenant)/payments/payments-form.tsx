"use client";

import { useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { SettingsFormSection } from "@/components/settings-form-section";
import { Button } from "@comtammatu/ui/components/button";
import { Frame } from "@comtammatu/ui/components/frame";
import { NoteCallout } from "@comtammatu/ui/components/note-callout";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { Input } from "@comtammatu/ui/components/input";
import { Label } from "@comtammatu/ui/components/label";
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
  enable_momo: z.boolean(),
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
  momoEnvConfigured: boolean;
}

export function PaymentsForm({
  settings,
  sepayEnvConfigured,
  momoEnvConfigured,
}: PaymentsFormProps) {
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<PaymentsFormValues, unknown, PaymentsFormValues>({
    resolver: zodResolver(paymentsSchema),
    defaultValues: {
      enable_vietqr:
        settings[SYSTEM_SETTING_KEYS.PAYMENT_ENABLE_VIETQR] === "true",
      enable_momo: settings[SYSTEM_SETTING_KEYS.PAYMENT_ENABLE_MOMO] === "true",
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
      if (values.enable_momo) {
        fd.set(SYSTEM_SETTING_KEYS.PAYMENT_ENABLE_MOMO, "true");
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
        <TabsList className="w-fit">
          <TabsTrigger value="connection">
            {messages.settings.payments.connectionTab}
          </TabsTrigger>
          <TabsTrigger value="edit">
            {messages.settings.payments.editTab}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="connection" className="mt-0 flex flex-col gap-4">
          <SettingsFormSection title={messages.settings.payments.sectionTitle}>
            <Frame className="flex flex-col gap-3 p-4">
              <Controller
                control={form.control}
                name="enable_vietqr"
                render={({ field }) => (
                  <div className="flex flex-row items-start justify-between gap-2">
                    <div className="flex flex-col gap-1">
                      <Label htmlFor="enable-vietqr" className="text-base">
                        {messages.settings.payments.vietqrLabel}
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        {messages.settings.payments.vietqrDescription}
                      </p>
                    </div>
                    <Switch
                      id="enable-vietqr"
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      className="mt-1"
                    />
                  </div>
                )}
              />

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="flex flex-col gap-1">
                  <Label htmlFor="vietqr-bank-code" className="text-xs">
                    {messages.settings.payments.bankCode}
                  </Label>
                  <Input
                    id="vietqr-bank-code"
                    placeholder="TCB"
                    autoCapitalize="characters"
                    {...form.register("vietqr_bank_code")}
                  />
                  {form.formState.errors.vietqr_bank_code && (
                    <p className="text-xs text-destructive">
                      {form.formState.errors.vietqr_bank_code.message}
                    </p>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="vietqr-account-no" className="text-xs">
                    {messages.settings.payments.accountNo}
                  </Label>
                  <Input
                    id="vietqr-account-no"
                    autoCapitalize="characters"
                    placeholder="19035xxxxxxxx"
                    {...form.register("vietqr_account_no")}
                  />
                  {form.formState.errors.vietqr_account_no && (
                    <p className="text-xs text-destructive">
                      {form.formState.errors.vietqr_account_no.message}
                    </p>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="vietqr-account-name" className="text-xs">
                    {messages.settings.payments.accountName}
                  </Label>
                  <Input
                    id="vietqr-account-name"
                    placeholder="HO KINH DOANH COM TAM MA TU"
                    {...form.register("vietqr_account_name")}
                  />
                  {form.formState.errors.vietqr_account_name && (
                    <p className="text-xs text-destructive">
                      {form.formState.errors.vietqr_account_name.message}
                    </p>
                  )}
                </div>
              </div>
              <p className="text-2xs text-muted-foreground">
                {messages.settings.payments.bankHelp}
              </p>

              <div className="flex flex-col gap-1">
                <Label htmlFor="vietqr-code-prefix" className="text-xs">
                  {messages.settings.payments.codePrefix}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {messages.settings.payments.codePrefixIntro}
                </p>
                <Input
                  id="vietqr-code-prefix"
                  autoCapitalize="characters"
                  placeholder="QAJZRU5550 MBBMS01382716 1"
                  aria-describedby="vietqr-code-prefix-help vietqr-code-prefix-preview"
                  {...form.register("vietqr_code_prefix")}
                />
                {form.formState.errors.vietqr_code_prefix && (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.vietqr_code_prefix.message}
                  </p>
                )}
                <p
                  id="vietqr-code-prefix-help"
                  className="text-2xs text-muted-foreground"
                >
                  {messages.settings.payments.codePrefixHelp}
                </p>
                <dl
                  id="vietqr-code-prefix-preview"
                  className="grid gap-2 text-xs sm:grid-cols-3"
                >
                  <div className="flex flex-col gap-1">
                    <dt className="font-medium text-muted-foreground">
                      {messages.settings.payments.codeModelAdminLabel}
                    </dt>
                    <dd>
                      <code className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs">
                        {normalizedCodePrefix ||
                          messages.settings.payments.codePreviewEmpty}
                      </code>
                    </dd>
                  </div>
                  <div className="flex flex-col gap-1">
                    <dt className="font-medium text-muted-foreground">
                      {messages.settings.payments.codeModelSuffixLabel}
                    </dt>
                    <dd>
                      <code className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs">
                        {SAMPLE_PAYMENT_SUFFIX}
                      </code>
                    </dd>
                  </div>
                  <div className="flex flex-col gap-1">
                    <dt className="font-medium text-muted-foreground">
                      {messages.settings.payments.codeModelFinalLabel}
                    </dt>
                    <dd>
                      {paymentCodePreview ? (
                        <code className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs">
                          {paymentCodePreview}
                        </code>
                      ) : (
                        <span className="text-muted-foreground">
                          {messages.settings.payments.codePreviewEmpty}
                        </span>
                      )}
                    </dd>
                  </div>
                </dl>
                <p className="text-2xs text-muted-foreground">
                  {messages.settings.payments.codePreviewHelp}
                </p>
              </div>
            </Frame>

            <div className="flex flex-col gap-2">
              <div className="flex flex-col gap-1">
                <Label className="text-base">
                  {messages.settings.payments.sepayLabel}
                </Label>
                <p className="text-sm text-muted-foreground">
                  {messages.settings.payments.sepayDescription}
                </p>
                <p className="text-xs text-muted-foreground">
                  {messages.settings.payments.envStatus}{" "}
                  {sepayEnvConfigured ? (
                    <span className="text-success">
                      {messages.settings.payments.envConfigured}
                    </span>
                  ) : (
                    <span className="text-warning">
                      {messages.settings.payments.envMissing}
                    </span>
                  )}
                </p>
                <code className="w-fit rounded-md bg-muted px-2 py-1 text-xs">
                  {messages.settings.payments.sepayEndpoint}
                </code>
              </div>
            </div>

            <Controller
              control={form.control}
              name="enable_momo"
              render={({ field }) => (
                <Frame className="flex flex-row items-start justify-between gap-2 p-4">
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="enable-momo" className="text-base">
                      MoMo
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      {messages.settings.payments.momoNeeds}{" "}
                      <code className="rounded-md bg-muted px-1 text-xs">
                        MOMO_PARTNER_CODE
                      </code>
                      ,{" "}
                      <code className="rounded-md bg-muted px-1 text-xs">
                        MOMO_ACCESS_KEY
                      </code>
                      ,{" "}
                      <code className="rounded-md bg-muted px-1 text-xs">
                        MOMO_SECRET_KEY
                      </code>
                      .
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {messages.settings.payments.envStatus}{" "}
                      {momoEnvConfigured ? (
                        <span className="text-success">
                          {messages.settings.payments.envConfigured}
                        </span>
                      ) : (
                        <span className="text-warning">
                          {messages.settings.payments.envMissing}
                        </span>
                      )}
                    </p>
                  </div>
                  <Switch
                    id="enable-momo"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    disabled={!momoEnvConfigured}
                    className="mt-1"
                  />
                </Frame>
              )}
            />
          </SettingsFormSection>
        </TabsContent>

        <TabsContent value="edit" className="mt-0">
          <SettingsFormSection
            title={messages.settings.payments.contentSectionTitle}
          >
            <div className="flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">
                {messages.settings.payments.contentHelp}
              </p>
              <NoteCallout
                label={messages.settings.payments.contentCategoryRuleLabel}
              >
                {messages.settings.payments.contentCategoryRule}
              </NoteCallout>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="flex flex-col gap-1">
                  <Label htmlFor="content-prefix" className="text-xs">
                    {messages.settings.payments.contentPrefix}
                  </Label>
                  <Input
                    id="content-prefix"
                    autoCapitalize="characters"
                    placeholder="MATU"
                    {...form.register("content_prefix")}
                  />
                  {form.formState.errors.content_prefix && (
                    <p className="text-xs text-destructive">
                      {form.formState.errors.content_prefix.message}
                    </p>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="content-expense-token" className="text-xs">
                    {messages.settings.payments.contentExpenseToken}
                  </Label>
                  <Input
                    id="content-expense-token"
                    autoCapitalize="characters"
                    placeholder="CHI"
                    {...form.register("content_expense_token")}
                  />
                  {form.formState.errors.content_expense_token && (
                    <p className="text-xs text-destructive">
                      {form.formState.errors.content_expense_token.message}
                    </p>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <Label
                    htmlFor="content-cash-deposit-token"
                    className="text-xs"
                  >
                    {messages.settings.payments.contentCashDepositToken}
                  </Label>
                  <Input
                    id="content-cash-deposit-token"
                    autoCapitalize="characters"
                    placeholder="NOP"
                    {...form.register("content_cash_deposit_token")}
                  />
                  {form.formState.errors.content_cash_deposit_token && (
                    <p className="text-xs text-destructive">
                      {form.formState.errors.content_cash_deposit_token.message}
                    </p>
                  )}
                </div>
              </div>

              <dl className="grid gap-3 text-xs sm:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <dt className="font-medium text-muted-foreground">
                    {messages.settings.payments.contentExpensePreview}
                  </dt>
                  <dd>
                    <code className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs">
                      {contentPreview(normalizedExpenseToken, "123")}
                    </code>
                  </dd>
                  <p className="text-2xs text-muted-foreground">
                    {messages.settings.payments.contentExpenseHelp}
                  </p>
                </div>
                <div className="flex flex-col gap-1">
                  <dt className="font-medium text-muted-foreground">
                    {messages.settings.payments.contentCashDepositPreview}
                  </dt>
                  <dd>
                    <code className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs">
                      {contentPreview(normalizedCashDepositToken)}
                    </code>
                  </dd>
                  <p className="text-2xs text-muted-foreground">
                    {messages.settings.payments.contentCashDepositHelp}
                  </p>
                </div>
              </dl>
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
