"use client";

import { z } from "zod";
import { useRouter } from "next/navigation";
import { FormDialog, NumberField, SelectField } from "@/components/form";
import { bulkCreateTables } from "./actions";
import type { ZoneRow } from "./zone-table";
import { toast } from "@comtammatu/ui/components/sonner";

import { messages } from "@lib/messages";

const NO_ZONE = "none";

const bulkTableSchema = z
  .object({
    from_number: z
      .string()
      .trim()
      .min(1, { error: "Số bàn bắt đầu không được trống" })
      .refine((value) => Number(value) >= 1, {
        error: "Số bàn bắt đầu phải ≥ 1",
      }),
    to_number: z
      .string()
      .trim()
      .min(1, { error: "Số bàn kết thúc không được trống" })
      .refine((value) => Number(value) >= 1, {
        error: "Số bàn kết thúc phải ≥ 1",
      }),
    zone_id: z.string().optional(),
  })
  .refine(
    (values) => Number(values.to_number) >= Number(values.from_number),
    {
      error: messages.settings.tables.bulkCreateRangeInvalid,
      path: ["to_number"],
    },
  );

type BulkTableFormValues = z.infer<typeof bulkTableSchema>;

interface BulkTableFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branchId: number;
  zones: ZoneRow[];
}

export function BulkTableFormDialog({
  open,
  onOpenChange,
  branchId,
  zones,
}: BulkTableFormDialogProps) {
  const router = useRouter();
  const copy = messages.settings.tables;

  const zoneOptions = [
    { value: NO_ZONE, label: "Không có khu vực" },
    ...zones.map((zone) => ({ value: zone.id.toString(), label: zone.name })),
  ];

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      schema={bulkTableSchema}
      defaultValues={{
        from_number: "",
        to_number: "",
        zone_id: NO_ZONE,
      }}
      entityKey="bulk"
      title={copy.bulkCreateTitle}
      description={copy.bulkCreateDescription}
      submitLabel={copy.bulkCreateSubmit}
      onSubmit={async (values: BulkTableFormValues) => {
        const payload: {
          branch_id: number;
          from_number: number;
          to_number: number;
          zone_id?: number;
        } = {
          branch_id: branchId,
          from_number: Number(values.from_number),
          to_number: Number(values.to_number),
        };
        if (values.zone_id && values.zone_id !== NO_ZONE) {
          payload.zone_id = Number(values.zone_id);
        }
        return bulkCreateTables(payload);
      }}
      onSuccess={(_result, values) => {
        const created =
          Number(values.to_number) - Number(values.from_number) + 1;
        toast.success(copy.bulkCreated(created));
        router.refresh();
      }}
    >
      {(form) => (
        <>
          <NumberField
            control={form.control}
            name="from_number"
            label={copy.fromNumber}
            placeholder={copy.fromNumberPlaceholder}
            allowNegative={false}
            required
          />
          <NumberField
            control={form.control}
            name="to_number"
            label={copy.toNumber}
            placeholder={copy.toNumberPlaceholder}
            allowNegative={false}
            required
          />
          <SelectField
            control={form.control}
            name="zone_id"
            label="Khu vực"
            options={zoneOptions}
          />
        </>
      )}
    </FormDialog>
  );
}
