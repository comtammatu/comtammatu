"use client";

import { z } from "zod";
import { ACTIONS_VI } from "@comtammatu/shared/messages";
import { FormDialog, TextField, valuesToFormData } from "@/components/form";
import { createZone, updateZone } from "./actions";
import type { ZoneRow } from "./zone-table";

const zoneSchema = z.object({
  name: z.string().trim().min(1, { error: "Tên khu vực không được trống" }),
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
      title={isEdit ? "Chỉnh sửa khu vực" : "Thêm khu vực mới"}
      description={
        isEdit ? "Chỉnh sửa thông tin khu vực" : "Nhập thông tin khu vực mới"
      }
      successMessage={isEdit ? "Đã cập nhật khu vực" : "Đã tạo khu vực mới"}
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
            label="Tên khu vực"
            placeholder="VD: Tầng 1, Sân vườn, VIP"
            required
          />
          <TextField
            control={form.control}
            name="sort_order"
            label="Thứ tự hiển thị"
            type="number"
            min={0}
          />
        </>
      )}
    </FormDialog>
  );
}
