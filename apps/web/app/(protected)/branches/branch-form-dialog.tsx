"use client";

import { z } from "zod";
import { FormDialog, TextField, valuesToFormData } from "@/components/form";
import { branchCodeSchema } from "@lib/branch-code";
import { createBranch, updateBranch } from "./actions";
import type { BranchRow } from "./branch-table";

import { ACTIONS_VI } from "@comtammatu/shared/messages";
import { messages } from "@lib/messages";

const branchSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { error: "Tên điểm vận hành không được trống" }),
  code: branchCodeSchema,
  address: z
    .string()
    .trim()
    .max(300, { error: "Địa chỉ tối đa 300 ký tự" })
    .optional(),
  phone: z
    .string()
    .trim()
    .max(30, { error: "Số điện thoại tối đa 30 ký tự" })
    .optional(),
});

type BranchFormValues = z.infer<typeof branchSchema>;

function toFormValues(branch: BranchRow | null | undefined): BranchFormValues {
  return {
    name: branch?.name ?? "",
    code: branch?.code ?? "",
    address: branch?.address ?? "",
    phone: branch?.phone ?? "",
  };
}

interface BranchFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branch?: BranchRow | null;
}

export function BranchFormDialog({
  open,
  onOpenChange,
  branch,
}: BranchFormDialogProps) {
  const isEdit = !!branch;

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      schema={branchSchema}
      defaultValues={toFormValues(branch)}
      entityKey={branch?.id ?? "new"}
      title={
        isEdit
          ? messages.settings.branchForm.editTitle
          : messages.settings.branchForm.createTitle
      }
      successMessage={
        isEdit
          ? messages.settings.branchForm.updated
          : messages.settings.branchForm.created
      }
      submitLabel={isEdit ? ACTIONS_VI.update : ACTIONS_VI.create}
      onSubmit={async (values) => {
        const fd = valuesToFormData(values);
        if (isEdit && branch) {
          fd.set("id", String(branch.id));
          return updateBranch(null, fd);
        }
        return createBranch(null, fd);
      }}
    >
      {(form) => (
        <>
          <TextField
            control={form.control}
            name="name"
            label={messages.settings.branchForm.nameLabel}
            placeholder={messages.settings.branchForm.namePlaceholder}
            required
          />
          {!isEdit ? (
            <TextField
              control={form.control}
              name="code"
              label={messages.settings.branchForm.codeLabel}
              placeholder={messages.settings.branchForm.codePlaceholder}
              required
            />
          ) : null}
          <TextField
            control={form.control}
            name="address"
            label={messages.settings.branchForm.addressLabel}
            placeholder={messages.settings.branchForm.addressPlaceholder}
          />
          <TextField
            control={form.control}
            name="phone"
            label={messages.settings.branchForm.phoneLabel}
            type="tel"
            placeholder={messages.settings.branchForm.phonePlaceholder}
          />
        </>
      )}
    </FormDialog>
  );
}
