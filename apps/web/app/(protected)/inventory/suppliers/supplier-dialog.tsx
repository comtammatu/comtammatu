"use client";

import { useEffect, useMemo, useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import { z } from "zod";
import { FormDialog, FormSheet, TextField } from "@/components/form";
import { createSupplier, updateSupplier } from "../procurement-actions";
import { ResponsiveActionButton } from "@/components/responsive-action-button";
import { Spinner } from "@comtammatu/ui/components/spinner";
import {
  isBusinessTaxCode,
  lookupBusinessTaxCode,
} from "@lib/hddt/business-tax-lookup";
import { messages } from "@lib/messages";

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
type TaxLookupStatus =
  "idle" | "loading" | "found" | "not-found" | "unavailable" | "invalid";

const taxLookupCopy = messages.inventory.suppliers.taxLookup;

function SupplierTaxCodeField({
  form,
}: {
  form: UseFormReturn<SupplierFormValues>;
}) {
  const taxCode = form.watch("tax_code") ?? "";
  const [status, setStatus] = useState<TaxLookupStatus>("idle");

  useEffect(() => setStatus("idle"), [taxCode]);

  async function handleLookup() {
    const normalized = taxCode.trim();
    if (!isBusinessTaxCode(normalized)) {
      setStatus("invalid");
      return;
    }

    setStatus("loading");
    try {
      const business = await lookupBusinessTaxCode(normalized);
      if ((form.getValues("tax_code") ?? "").trim() !== normalized) return;
      if (!business) {
        setStatus("not-found");
        return;
      }
      form.setValue("name", business.name, {
        shouldDirty: true,
        shouldValidate: true,
      });
      form.setValue("address", business.address, {
        shouldDirty: true,
        shouldValidate: true,
      });
      setStatus("found");
    } catch {
      if ((form.getValues("tax_code") ?? "").trim() === normalized) {
        setStatus("unavailable");
      }
    }
  }

  const message =
    status === "loading"
      ? taxLookupCopy.loading
      : status === "found"
        ? taxLookupCopy.found
        : status === "not-found"
          ? taxLookupCopy.notFound
          : status === "unavailable"
            ? taxLookupCopy.unavailable
            : status === "invalid"
              ? taxLookupCopy.invalid
              : null;

  return (
    <div className="grid gap-2">
      <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
        <TextField
          control={form.control}
          name="tax_code"
          label="Mã số thuế"
          inputMode="numeric"
          maxLength={14}
          autoComplete="off"
          spellCheck={false}
        />
        <ResponsiveActionButton
          type="button"
          variant="outline"
          disabled={!taxCode.trim() || status === "loading"}
          onClick={() => void handleLookup()}
        >
          {status === "loading" ? <Spinner /> : null}
          {taxLookupCopy.action}
        </ResponsiveActionButton>
      </div>
      {message ? (
        <p
          role="status"
          aria-live="polite"
          className="text-xs text-muted-foreground"
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}

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
  chrome?: "dialog" | "sheet";
}

export function SupplierDialog({
  open,
  onOpenChange,
  supplier,
  onSaved,
  chrome = "dialog",
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

  const FormChrome = chrome === "sheet" ? FormSheet : FormDialog;

  return (
    <FormChrome
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
          <SupplierTaxCodeField form={form} />
          <TextField control={form.control} name="phone" label="Điện thoại" />
          <TextField control={form.control} name="address" label="Địa chỉ" />
        </>
      )}
    </FormChrome>
  );
}
