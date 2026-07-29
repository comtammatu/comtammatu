"use client";

import { useMemo } from "react";
import { z } from "zod";
import { FormDialog, TextField } from "@/components/form";
import { createSupplier, updateSupplier } from "../procurement-actions";

import { ACTIONS_VI } from "@comtammatu/shared/messages";
export interface SupplierRow {
  id: number;
  name: string;
  tax_code: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  is_active: boolean;
  ingredient_count?: number;
}

const supplierSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { error: "Tên nhà cung cấp không được trống" }),
  tax_code: z
    .string()
    .trim()
    .max(20, { error: "Mã số thuế tối đa 20 ký tự" })
    .optional(),
  phone: z
    .string()
    .trim()
    .max(30, { error: "Số điện thoại tối đa 30 ký tự" })
    .optional(),
  address: z
    .string()
    .trim()
    .max(300, { error: "Địa chỉ tối đa 300 ký tự" })
    .optional(),
});

type SupplierFormValues = z.infer<typeof supplierSchema>;

function toFormValues(supplier: SupplierRow | null): SupplierFormValues {
  return {
    name: supplier?.name ?? "",
    tax_code: supplier?.tax_code ?? "",
    phone: supplier?.phone ?? "",
    address: supplier?.address ?? "",
  };
}

interface SupplierDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplier: SupplierRow | null;
  onSaved: () => void;
}

export function SupplierDialog({
  open,
  onOpenChange,
  supplier,
  onSaved,
}: SupplierDialogProps) {
  const isEdit = supplier !== null;
  const defaultValues = useMemo(() => toFormValues(supplier), [supplier]);

  async function handleSubmit(values: SupplierFormValues) {
    const payload = {
      name: values.name,
      tax_code: values.tax_code || undefined,
      phone: values.phone || undefined,
      address: values.address || undefined,
    };

    const result =
      isEdit && supplier
        ? await updateSupplier(supplier.id, payload)
        : await createSupplier(payload);
    if (result.success) {
      onSaved();
    }
    return result;
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      schema={supplierSchema}
      defaultValues={defaultValues}
      entityKey={supplier?.id ?? "new-supplier"}
      title={isEdit ? "Sửa nhà cung cấp" : "Thêm nhà cung cấp"}
      submitLabel={isEdit ? ACTIONS_VI.update : ACTIONS_VI.save}
      successMessage={
        isEdit ? "Đã cập nhật nhà cung cấp" : "Đã tạo nhà cung cấp"
      }
      contentClassName="sm:max-w-md"
      onSubmit={handleSubmit}
    >
      {(form) => (
        <>
          <TextField
            control={form.control}
            name="name"
            label="Tên"
            required
            autoFocus
          />
          <TextField
            control={form.control}
            name="tax_code"
            label="Mã số thuế"
          />
          <TextField control={form.control} name="phone" label="Điện thoại" />
          <TextField control={form.control} name="address" label="Địa chỉ" />
        </>
      )}
    </FormDialog>
  );
}
