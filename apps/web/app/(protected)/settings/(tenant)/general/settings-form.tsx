"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@comtammatu/ui/components/button";
import { Badge } from "@comtammatu/ui/components/badge";
import { confirm } from "@comtammatu/ui/components/confirm-dialog";
import { NoteCallout } from "@comtammatu/ui/components/note-callout";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { toast } from "@comtammatu/ui/components/sonner";
import { ERRORS_VI } from "@comtammatu/shared/messages";
import { TextField, valuesToFormData } from "@/components/form";
import { SettingsFormSection } from "@/components/settings-form-section";
import { DescriptionList } from "@/components/surface";
import { messages } from "@lib/messages";
import { activateInvoiceProfile, updateTenantIdentity } from "./actions";

const copy = messages.settings.general;

const identitySchema = z.object({
  legal_name: z.string().trim(),
  tax_code: z
    .string()
    .trim()
    .refine((v) => !v || /^\d{10}(-\d{3})?$/.test(v), {
      error: "Mã số thuế phải là 10 chữ số hoặc 13 chữ số có dấu gạch nối",
    }),
  legal_address: z.string().trim(),
  representative: z.string().trim(),
});

type IdentityFormValues = z.infer<typeof identitySchema>;

interface SettingsFormProps {
  identity: IdentityFormValues;
  invoiceProfile: {
    id: number;
    version: number;
    template_code: string;
    invoice_series: string;
    status: string;
    seller_tax_code: string | null;
  } | null;
}

export function SettingsForm({ identity, invoiceProfile }: SettingsFormProps) {
  const router = useRouter();
  const [isIdentityPending, startIdentityTransition] = useTransition();
  const [isActivationPending, startActivationTransition] = useTransition();
  const [identityError, setIdentityError] = useState<string | null>(null);
  const [activationError, setActivationError] = useState<string | null>(null);

  const identityForm = useForm<IdentityFormValues, unknown, IdentityFormValues>(
    {
      resolver: zodResolver(identitySchema),
      defaultValues: {
        legal_name: identity.legal_name,
        tax_code: identity.tax_code,
        legal_address: identity.legal_address,
        representative: identity.representative,
      },
    },
  );
  const currentIdentity = identityForm.watch();
  const identityComplete =
    currentIdentity.legal_name.trim() !== "" &&
    /^\d{10}(-\d{3})?$/.test(currentIdentity.tax_code.trim()) &&
    currentIdentity.legal_address.trim() !== "" &&
    currentIdentity.representative.trim() !== "";
  const identitySaved = !identityForm.formState.isDirty;
  const canActivate =
    invoiceProfile?.status === "draft" &&
    identityComplete &&
    identitySaved &&
    !isActivationPending;

  function onIdentityValid(values: IdentityFormValues) {
    startIdentityTransition(async () => {
      setIdentityError(null);
      const fd = valuesToFormData(values);
      const result = await updateTenantIdentity(null, fd);
      if (!result.success) {
        setIdentityError(result.error ?? ERRORS_VI.fallback);
        return;
      }
      identityForm.reset(values);
      toast.success(copy.identitySaved);
    });
  }

  async function onActivateInvoiceProfile() {
    if (!invoiceProfile) return;
    const confirmed = await confirm({
      title: copy.activationConfirmTitle,
      description: copy.activationConfirmDescription,
      confirmText: copy.activateInvoiceProfile,
      details: [
        { label: copy.taxCodeLabel, value: currentIdentity.tax_code },
        {
          label: copy.templateCodeLabel,
          value: invoiceProfile.template_code,
        },
        {
          label: copy.invoiceSeriesLabel,
          value: invoiceProfile.invoice_series,
        },
      ],
    });
    if (!confirmed) return;

    startActivationTransition(async () => {
      setActivationError(null);
      const result = await activateInvoiceProfile({});
      if (!result.success) {
        setActivationError(result.error ?? ERRORS_VI.fallback);
        return;
      }
      toast.success(copy.invoiceProfileActivated);
      router.refresh();
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
        <Button
          type="submit"
          disabled={isIdentityPending || !identityForm.formState.isDirty}
        >
          {isIdentityPending && <Spinner className="mr-2" />}
          {copy.saveIdentity}
        </Button>
      </div>

      <SettingsFormSection
        title={copy.invoiceProfileTitle}
        description={copy.invoiceProfileDescription}
      >
        {invoiceProfile ? (
          <DescriptionList
            className="grid gap-3 sm:grid-cols-2"
            items={[
              {
                term: copy.templateCodeLabel,
                description: (
                  <code className="font-mono">
                    {invoiceProfile.template_code}
                  </code>
                ),
              },
              {
                term: copy.invoiceSeriesLabel,
                description: (
                  <code className="font-mono">
                    {invoiceProfile.invoice_series}
                  </code>
                ),
              },
              {
                term: copy.profileStatusLabel,
                description: (
                  <Badge
                    variant={
                      invoiceProfile.status === "active"
                        ? "success"
                        : "secondary"
                    }
                  >
                    {invoiceProfile.status === "active"
                      ? copy.profileStatusActive
                      : copy.profileStatusDraft}
                  </Badge>
                ),
              },
            ]}
          />
        ) : (
          <p className="text-sm text-destructive" role="alert">
            {copy.invoiceProfileMissing}
          </p>
        )}

        {invoiceProfile?.status === "draft" && (
          <>
            <NoteCallout tone={canActivate ? "muted" : "warning"}>
              {!identityComplete
                ? copy.activationRequiresIdentity
                : !identitySaved
                  ? copy.activationSaveFirst
                  : copy.activationReady}
            </NoteCallout>
            {activationError && (
              <p className="text-sm text-destructive" role="alert">
                {activationError}
              </p>
            )}
            <div className="flex justify-end">
              <Button
                type="button"
                disabled={!canActivate}
                onClick={onActivateInvoiceProfile}
              >
                {isActivationPending && <Spinner className="mr-2" />}
                {copy.activateInvoiceProfile}
              </Button>
            </div>
          </>
        )}
      </SettingsFormSection>
    </form>
  );
}
