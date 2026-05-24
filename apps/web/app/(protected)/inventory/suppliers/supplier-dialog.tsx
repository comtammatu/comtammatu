"use client";

import { useEffect, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@comtammatu/ui/components/dialog";
import { FieldGroup } from "@comtammatu/ui/components/field";
import { Button } from "@comtammatu/ui/components/button";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { toast } from "@comtammatu/ui/components/sonner";
import { TextField, TextareaField } from "@/components/form";
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
}

const supplierSchema = z.object({
  name: z.string().trim().min(1, { error: "Tên nhà cung cấp không được trống" }),
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
  notes: z
    .string()
    .trim()
    .max(500, { error: "Ghi chú tối đa 500 ký tự" })
    .optional(),
});

type SupplierFormValues = z.infer<typeof supplierSchema>;

function toFormValues(supplier: SupplierRow | null): SupplierFormValues {
  return {
    name: supplier?.name ?? "",
    tax_code: supplier?.tax_code ?? "",
    phone: supplier?.phone ?? "",
    address: supplier?.address ?? "",
    notes: supplier?.notes ?? "",
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
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<SupplierFormValues>({
    resolver: zodResolver(supplierSchema),
    defaultValues: toFormValues(supplier),
  });

  useEffect(() => {
    if (open) {
      form.reset(toFormValues(supplier));
      setServerError(null);
    }
  }, [open, supplier, form]);

  function onValid(values: SupplierFormValues) {
    const payload = {
      name: values.name,
      tax_code: values.tax_code || undefined,
      phone: values.phone || undefined,
      address: values.address || undefined,
      notes: values.notes || undefined,
    };

    startTransition(async () => {
      setServerError(null);
      if (isEdit) {
        const res = await updateSupplier(supplier.id, payload);
        if (!res.success) {
          setServerError(res.error ?? "Không cập nhật được");
          return;
        }
        toast.success("Đã cập nhật nhà cung cấp");
      } else {
        const res = await createSupplier(payload);
        if (!res.success) {
          setServerError(res.error ?? "Không tạo được");
          return;
        }
        toast.success("Đã tạo nhà cung cấp");
      }
      onOpenChange(false);
      onSaved();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-md"
        key={supplier?.id ?? "new-supplier"}
      >
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Sửa nhà cung cấp" : "Thêm nhà cung cấp"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onValid)} noValidate>
          <FieldGroup>
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
            <TextareaField
              control={form.control}
              name="notes"
              label="Ghi chú"
              rows={3}
            />

            {serverError && (
              <p className="text-sm text-destructive" role="alert">
                {serverError}
              </p>
            )}
          </FieldGroup>

          <DialogFooter className="pt-6">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              {ACTIONS_VI.cancel}
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Spinner className="mr-2" />}
              {isEdit ? ACTIONS_VI.update : ACTIONS_VI.save}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
