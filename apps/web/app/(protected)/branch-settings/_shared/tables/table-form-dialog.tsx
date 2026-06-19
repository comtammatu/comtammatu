"use client";

import { z } from "zod";
import {
  FormDialog,
  SelectField,
  TextField,
  valuesToFormData,
} from "@/components/form";
import { createTable, updateTable } from "./actions";
import { TABLE_STATE_OPTIONS, TABLE_STATE_VALUES } from "./constants";
import type { ZoneRow } from "./zone-table";
import type { TableRow } from "./table-table";

import { ACTIONS_VI } from "@comtammatu/shared/messages";
const NO_ZONE = "none";

const tableSchema = z.object({
  number: z
    .string()
    .trim()
    .min(1, { error: "Số bàn không được trống" })
    .refine((v) => Number(v) >= 1, { error: "Số bàn phải ≥ 1" }),
  zone_id: z.string().optional(),
  status: z.enum(TABLE_STATE_VALUES).optional(),
});

type TableFormValues = z.infer<typeof tableSchema>;

function toFormValues(table: TableRow | null | undefined): TableFormValues {
  return {
    number: table?.number != null ? String(table.number) : "",
    zone_id: table?.zone_id != null ? String(table.zone_id) : NO_ZONE,
    status: table?.status as TableFormValues["status"],
  };
}

interface TableFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branchId: number;
  zones: ZoneRow[];
  table?: TableRow | null;
}

export function TableFormDialog({
  open,
  onOpenChange,
  branchId,
  zones,
  table,
}: TableFormDialogProps) {
  const isEdit = !!table;

  const zoneOptions = [
    { value: NO_ZONE, label: "Không có khu vực" },
    ...zones.map((z) => ({ value: z.id.toString(), label: z.name })),
  ];

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      schema={tableSchema}
      defaultValues={toFormValues(table)}
      entityKey={table?.id ?? "new"}
      title={isEdit ? "Chỉnh sửa bàn" : "Thêm bàn mới"}
      successMessage={isEdit ? "Đã cập nhật bàn" : "Đã tạo bàn mới"}
      submitLabel={isEdit ? ACTIONS_VI.update : ACTIONS_VI.create}
      onSubmit={async (values) => {
        const payload: Record<string, unknown> = {
          number: values.number,
        };
        if (values.zone_id && values.zone_id !== NO_ZONE) {
          payload.zone_id = values.zone_id;
        }
        if (isEdit && values.status) {
          payload.status = values.status;
        }
        const fd = valuesToFormData(payload);
        fd.set("branch_id", String(branchId));
        if (isEdit && table) {
          fd.set("id", String(table.id));
          return updateTable(null, fd);
        }
        return createTable(null, fd);
      }}
    >
      {(form) => (
        <>
          <TextField
            control={form.control}
            name="number"
            label="Số bàn"
            type="number"
            min={1}
            placeholder="VD: 1, 2, 3..."
            required
          />
          <SelectField
            control={form.control}
            name="zone_id"
            label="Khu vực"
            options={zoneOptions}
          />
          {isEdit && (
            <SelectField
              control={form.control}
              name="status"
              label="Trạng thái"
              options={TABLE_STATE_OPTIONS}
            />
          )}
        </>
      )}
    </FormDialog>
  );
}
