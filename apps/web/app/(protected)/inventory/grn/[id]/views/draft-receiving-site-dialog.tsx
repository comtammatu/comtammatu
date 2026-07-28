"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { Pencil as IconPencil } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { notify } from "@comtammatu/ui/lib/notify";
import { ACTIONS_VI } from "@comtammatu/shared/messages";
import { FormDialog, SelectField } from "@/components/form";
import { updateDraftGrnReceivingSite } from "../../../grn-actions";
import {
  GRN_DETAIL_COPY as grnCopy,
  type ReceivingLocationOption,
} from "@lib/inventory/grn-detail-model";

const draftReceivingSiteSchema = z.object({
  targetLocationId: z.string().min(1, {
    error: grnCopy.draftReceiving.invalidLocation,
  }),
});

type DraftReceivingSiteValues = {
  targetLocationId: string;
};

type DraftReceivingSiteDialogProps = {
  grnId: number;
  grnCode: string;
  currentLocationId?: number | null;
  locationOptions: ReceivingLocationOption[];
  buttonSize?: "default" | "touch";
  disabledReason?: string;
};

function locationOptionLabel(option: ReceivingLocationOption) {
  return option.isDefaultReceive
    ? `${option.branchName} - ${option.name} (mặc định)`
    : `${option.branchName} - ${option.name}`;
}

export function DraftReceivingSiteDialog({
  grnId,
  grnCode,
  currentLocationId = null,
  locationOptions,
  buttonSize = "default",
  disabledReason,
}: DraftReceivingSiteDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const copy = grnCopy.draftReceiving;
  const targetLocations = useMemo(
    () =>
      locationOptions.filter((location) => location.id !== currentLocationId),
    [currentLocationId, locationOptions],
  );
  const defaultValues = useMemo<DraftReceivingSiteValues>(
    () => ({
      targetLocationId: targetLocations[0] ? String(targetLocations[0].id) : "",
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
  async function handleSubmit(values: DraftReceivingSiteValues) {
    const targetLocation = targetLocations.find(
      (location) => String(location.id) === values.targetLocationId,
    );
    if (!targetLocation) {
      return { success: false as const, error: copy.invalidLocation };
    }

    return updateDraftGrnReceivingSite({
      grnId,
      targetBranchId: targetLocation.branchId,
      targetLocationId: targetLocation.id,
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
        <IconPencil className="size-4" />
        {copy.action}
      </Button>

      <FormDialog
        open={open}
        onOpenChange={setOpen}
        title={`${copy.title} - ${grnCode}`}
        description={copy.description}
        schema={draftReceivingSiteSchema}
        defaultValues={defaultValues}
        entityKey={`${grnId}-${defaultValues.targetLocationId}`}
        onSubmit={handleSubmit}
        onSuccess={() => {
          notify.success(grnCopy.draftReceiving.success);
          router.refresh();
        }}
        submitLabel={copy.submit}
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
          </>
        )}
      </FormDialog>
    </>
  );
}
