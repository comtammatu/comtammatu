"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@comtammatu/ui/components/button";
import { Spinner } from "@comtammatu/ui/components/spinner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@comtammatu/ui/components/card";
import { FieldGroup } from "@comtammatu/ui/components/field";
import { toast } from "@comtammatu/ui/components/sonner";
import { ERRORS_VI } from "@comtammatu/shared/messages";
import { SYSTEM_SETTING_KEYS } from "@comtammatu/shared/settings";
import { TextField, valuesToFormData } from "@/components/form";
import { messages } from "@lib/messages";
import { updateSettings, updateTenantIdentity } from "./actions";

const copy = messages.settings.general;

const settingsSchema = z.object({
  currency: z.string().trim(),
});

const identitySchema = z.object({
  legal_name: z.string().trim(),
  tax_code: z
    .string()
    .trim()
    .refine((v) => !v || /^\d{10}(-?\d{3})?$/.test(v), {
      error: "Mã số thuế phải là 10 hoặc 13 chữ số",
    }),
  legal_address: z.string().trim(),
  representative: z.string().trim(),
});

type SettingsFormValues = z.infer<typeof settingsSchema>;
type IdentityFormValues = z.infer<typeof identitySchema>;

interface SettingsFormProps {
  settings: Record<string, string>;
  identity: IdentityFormValues;
}

export function SettingsForm({ settings, identity }: SettingsFormProps) {
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const [isIdentityPending, startIdentityTransition] = useTransition();
  const [identityError, setIdentityError] = useState<string | null>(null);

  const form = useForm<SettingsFormValues, unknown, SettingsFormValues>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      currency: settings[SYSTEM_SETTING_KEYS.CURRENCY] ?? "VND",
    },
  });

  const identityForm = useForm<
    IdentityFormValues,
    unknown,
    IdentityFormValues
  >({
    resolver: zodResolver(identitySchema),
    defaultValues: {
      legal_name: identity.legal_name,
      tax_code: identity.tax_code,
      legal_address: identity.legal_address,
      representative: identity.representative,
    },
  });

  function onValid(values: SettingsFormValues) {
    startTransition(async () => {
      setServerError(null);
      const fd = valuesToFormData(values);
      const result = await updateSettings(null, fd);
      if (!result.success) {
        setServerError(result.error ?? ERRORS_VI.fallback);
        return;
      }
      toast.success(copy.saved);
    });
  }

  function onIdentityValid(values: IdentityFormValues) {
    startIdentityTransition(async () => {
      setIdentityError(null);
      const fd = valuesToFormData(values);
      const result = await updateTenantIdentity(null, fd);
      if (!result.success) {
        setIdentityError(result.error ?? ERRORS_VI.fallback);
        return;
      }
      toast.success(copy.identitySaved);
    });
  }

  return (
    <div className="space-y-6">
      <form
        onSubmit={form.handleSubmit(onValid)}
        noValidate
        className="space-y-6"
      >
        <Card>
          <CardHeader>
            <CardTitle>{copy.taxFeesTitle}</CardTitle>
          </CardHeader>
          <CardContent>
            <FieldGroup className="grid gap-4 sm:grid-cols-2">
              <TextField
                control={form.control}
                name="currency"
                label={copy.currencyLabel}
              />
            </FieldGroup>
          </CardContent>
        </Card>

        {serverError && (
          <p className="text-sm text-destructive" role="alert">
            {serverError}
          </p>
        )}

        <div className="flex justify-end">
          <Button type="submit" disabled={isPending}>
            {isPending && <Spinner className="mr-2" />}
            {copy.saveSettings}
          </Button>
        </div>
      </form>

      <form
        onSubmit={identityForm.handleSubmit(onIdentityValid)}
        noValidate
        className="space-y-6"
      >
        <Card>
          <CardHeader>
            <CardTitle>{copy.identityTitle}</CardTitle>
            <CardDescription>{copy.identityDescription}</CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup className="grid gap-4 sm:grid-cols-2">
              <TextField
                control={identityForm.control}
                name="legal_name"
                label={copy.legalNameLabel}
              />
              <TextField
                control={identityForm.control}
                name="tax_code"
                label={copy.taxCodeLabel}
                placeholder="077200004194"
              />
              <TextField
                control={identityForm.control}
                name="legal_address"
                label={copy.legalAddressLabel}
              />
              <TextField
                control={identityForm.control}
                name="representative"
                label={copy.representativeLabel}
              />
            </FieldGroup>
          </CardContent>
        </Card>

        {identityError && (
          <p className="text-sm text-destructive" role="alert">
            {identityError}
          </p>
        )}

        <div className="flex justify-end">
          <Button type="submit" disabled={isIdentityPending}>
            {isIdentityPending && <Spinner className="mr-2" />}
            {copy.saveIdentity}
          </Button>
        </div>
      </form>
    </div>
  );
}
