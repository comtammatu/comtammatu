"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { CopyPlus as IconCopyPlus } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { notify } from "@comtammatu/ui/lib/notify";
import { ACTIONS_VI } from "@comtammatu/shared/messages";
import { FormDialog, SelectField, TextareaField } from "@/components/form";
import {
  recreateGrnAtReceivingSite,
  updateDraftGrnReceivingSite,
} from "../../../grn-actions";
import {
  GRN_DETAIL_COPY as grnCopy,
  type RecreateReceivingLocationOption,
} from "@lib/inventory/grn-detail-model";

const draftReceivingSiteSchema = z.object({
  targetLocationId: z.string().min(1, {
    error: grnCopy.draftReceiving.invalidLocation,
  }),
});

const recreateReceivingSiteSchema = z.object({
  targetLocationId: z.string().min(1, {
    error: grnCopy.recreate.invalidLocation,
  }),
  reason: z
    .string()
    .trim()
    .min(10, { error: grnCopy.recreate.reasonMinLength })
    .max(500, { error: grnCopy.recreate.reasonMaxLength }),
});

type RecreateReceivingSiteValues = {
  targetLocationId: string;
  reason?: string;
};

type RecreateReceivingSiteResult = {
  newId: number;
  newGrnNumber: string;
};

type RecreateReceivingSiteDialogProps = {
  grnId: number;
  grnCode: string;
  currentLocationId?: number | null;
  locationOptions: RecreateReceivingLocationOption[];
  grnListBasePath: string;
  buttonSize?: "default" | "touch";
  mode?: "confirmed" | "draft";
  disabledReason?: string;
};

function locationOptionLabel(option: RecreateReceivingLocationOption) {
  return option.isDefaultReceive
    ? `${option.branchName} - ${option.name} (mặc định)`
    : `${option.branchName} - ${option.name}`;
}

export function RecreateReceivingSiteDialog({
  grnId,
  grnCode,
  currentLocationId = null,
  locationOptions,
  grnListBasePath,
  buttonSize = "default",
  mode = "confirmed",
  disabledReason,
}: RecreateReceivingSiteDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const copy = mode === "draft" ? grnCopy.draftReceiving : grnCopy.recreate;
  const targetLocations = useMemo(
    () =>
      locationOptions.filter((location) => location.id !== currentLocationId),
    [currentLocationId, locationOptions],
  );
  const defaultValues = useMemo<RecreateReceivingSiteValues>(
    () => ({
      targetLocationId: targetLocations[0] ? String(targetLocations[0].id) : "",
      reason: "",
    }),
    [targetLocations],
  );
  const selectOptions = useMemo(
    () =>
      targetLocations.map((location) => ({
        value: String(location.id),
        label: locationOptionLabel(location),
      })),
    [targetLocations],
  );
  const disabled = targetLocations.length === 0 || Boolean(disabledReason);
  const schema = (
    mode === "draft" ? draftReceivingSiteSchema : recreateReceivingSiteSchema
  ) as z.ZodType<RecreateReceivingSiteValues>;

  async function handleSubmit(values: RecreateReceivingSiteValues) {
    const targetLocation = targetLocations.find(
      (location) => String(location.id) === values.targetLocationId,
    );
    if (!targetLocation) {
      return { success: false as const, error: copy.invalidLocation };
    }

    if (mode === "draft") {
      return updateDraftGrnReceivingSite({
        grnId,
        targetBranchId: targetLocation.branchId,
        targetLocationId: targetLocation.id,
      });
    }

    return recreateGrnAtReceivingSite({
      grnId,
      targetBranchId: targetLocation.branchId,
      targetLocationId: targetLocation.id,
      reason: (values.reason ?? "").trim(),
    });
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size={buttonSize}
        disabled={disabled}
        title={
          disabled ? (disabledReason ?? copy.noTargetLocations) : undefined
        }
        onClick={() => setOpen(true)}
      >
        <IconCopyPlus className="size-4" />
        {copy.action}
      </Button>

      <FormDialog
        open={open}
        onOpenChange={setOpen}
        title={`${copy.title} - ${grnCode}`}
        description={copy.description}
        schema={schema}
        defaultValues={defaultValues}
        entityKey={`${mode}-${grnId}-${defaultValues.targetLocationId}`}
        onSubmit={handleSubmit}
        onSuccess={(result) => {
          if (mode === "draft") {
            notify.success(grnCopy.draftReceiving.success);
            router.refresh();
            return;
          }
          const data = result.data as RecreateReceivingSiteResult | undefined;
          if (!data?.newId) {
            router.refresh();
            return;
          }
          notify.success(grnCopy.recreate.success(data.newGrnNumber));
          router.push(`${grnListBasePath}/${data.newId}`);
          router.refresh();
        }}
        submitLabel={copy.submit}
        submitVariant={mode === "draft" ? "default" : "destructive"}
        cancelLabel={ACTIONS_VI.cancel}
        contentClassName="sm:max-w-lg"
      >
        {(form) => (
          <>
            <p className="text-sm text-muted-foreground">{copy.warning}</p>
            <SelectField
              control={form.control}
              name="targetLocationId"
              label={copy.targetLocationLabel}
              options={selectOptions}
              placeholder={copy.targetLocationPlaceholder}
              required
            />
            {mode === "confirmed" ? (
              <TextareaField
                control={form.control}
                name="reason"
                label={grnCopy.recreate.reasonLabel}
                rows={4}
                maxLength={500}
                placeholder={grnCopy.recreate.reasonPlaceholder}
                required
              />
            ) : null}
          </>
        )}
      </FormDialog>
    </>
  );
}
