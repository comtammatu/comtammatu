"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@comtammatu/ui/components/button";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { toast } from "@comtammatu/ui/components/sonner";
import { ERRORS_VI } from "@comtammatu/shared/messages";
import { TextField, valuesToFormData } from "@/components/form";
import { SettingsFormSection } from "@/components/settings-form-section";
import { messages } from "@lib/messages";
import { updateTenantIdentity } from "./actions";

const copy = messages.settings.general;

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

type IdentityFormValues = z.infer<typeof identitySchema>;

interface SettingsFormProps {
  identity: IdentityFormValues;
}

export function SettingsForm({ identity }: SettingsFormProps) {
  const [isIdentityPending, startIdentityTransition] = useTransition();
  const [identityError, setIdentityError] = useState<string | null>(null);

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
    <form
      onSubmit={identityForm.handleSubmit(onIdentityValid)}
      noValidate
      className="flex flex-col gap-4"
    >
      <SettingsFormSection
        title={copy.identityTitle}
        description={copy.identityDescription}
        groupClassName="grid gap-4 sm:grid-cols-2"
      >
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
      </SettingsFormSection>

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
  );
}
