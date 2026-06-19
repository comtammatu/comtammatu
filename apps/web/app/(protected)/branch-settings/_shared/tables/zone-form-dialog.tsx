"use client";

import { z } from "zod";
import { ACTIONS_VI } from "@comtammatu/shared/messages";
import { FormDialog, TextField, valuesToFormData } from "@/components/form";
import { messages } from "@lib/messages";
import { createZone, updateZone } from "./actions";
import type { ZoneRow } from "./zone-table";

const copy = messages.settings.tables;
const zoneSchema = z.object({
  name: z.string().trim().min(1, { error: copy.zoneNameRequired }),
  sort_order: z.string().optional(),
});

type ZoneFormValues = z.infer<typeof zoneSchema>;

function toFormValues(zone: ZoneRow | null | undefined): ZoneFormValues {
  return {
    name: zone?.name ?? "",
    sort_order: zone?.sort_order != null ? String(zone.sort_order) : "0",
  };
}

interface ZoneFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branchId: number;
  zone?: ZoneRow | null;
}

export function ZoneFormDialog({
  open,
  onOpenChange,
  branchId,
  zone,
}: ZoneFormDialogProps) {
  const isEdit = !!zone;

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      schema={zoneSchema}
      defaultValues={toFormValues(zone)}
      entityKey={zone?.id ?? "new"}
      title={isEdit ? copy.editZoneTitle : copy.createZoneTitle}
      successMessage={isEdit ? copy.zoneUpdated : copy.zoneCreated}
      submitLabel={isEdit ? ACTIONS_VI.update : ACTIONS_VI.create}
      onSubmit={async (values) => {
        const fd = valuesToFormData(values);
        fd.set("branch_id", String(branchId));
        if (isEdit && zone) {
          fd.set("id", String(zone.id));
          return updateZone(null, fd);
        }
        return createZone(null, fd);
      }}
    >
      {(form) => (
        <>
          <TextField
            control={form.control}
            name="name"
            label={copy.zoneName}
            placeholder={copy.zoneNamePlaceholder}
            required
          />
          <TextField
            control={form.control}
            name="sort_order"
            label={copy.zoneOrderLabel}
            type="number"
            min={0}
          />
        </>
      )}
    </FormDialog>
  );
}
