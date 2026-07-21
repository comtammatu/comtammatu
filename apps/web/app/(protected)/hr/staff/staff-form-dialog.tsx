"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { ACTIONS_VI } from "@comtammatu/shared/messages";
import { requiredBranchKindForPositionCode } from "@comtammatu/shared/auth";
import {
  FormDialog,
  SelectField,
  TextField,
  valuesToFormData,
} from "@/components/form";
import { FieldLegend, FieldSet } from "@comtammatu/ui/components/field";
import { toast } from "@comtammatu/ui/components/sonner";
import { messages } from "@lib/messages";
import { createStaff, updateStaff } from "./actions";
import type { BranchOption, PositionOption, StaffRow } from "./staff-table";

const NO_BRANCH = "";

const staffSchema = z.object({
  email: z.string().optional(),
  password: z.string().optional(),
  full_name: z.string().trim().min(1, { error: "Họ tên không được trống" }),
  phone: z.string().trim().optional(),
  position_code: z.string().min(1, { error: "Vui lòng chọn chức vụ" }),
  branch_id: z.string().optional(),
});

type StaffFormValues = z.infer<typeof staffSchema>;

function staffSchemaForMode(isEdit: boolean) {
  return staffSchema.superRefine((values, ctx) => {
    if (isEdit) return;
    if (!values.email?.trim()) {
      ctx.addIssue({
        code: "custom",
        path: ["email"],
        message: "Email không được trống",
      });
    }
    if (!values.password || values.password.length < 8) {
      ctx.addIssue({
        code: "custom",
        path: ["password"],
        message: "Mật khẩu phải ≥ 8 ký tự",
      });
    }
  });
}

function toFormValues(staff: StaffRow | null | undefined): StaffFormValues {
  return {
    email: "",
    password: "",
    full_name: staff?.full_name ?? "",
    phone: staff?.phone ?? "",
    position_code: staff?.position_code ?? "cashier",
    branch_id: staff?.branch_id != null ? String(staff.branch_id) : NO_BRANCH,
  };
}

interface StaffFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  staff?: StaffRow | null;
  branches: BranchOption[];
  positionOptions: PositionOption[];
}

export function StaffFormDialog({
  open,
  onOpenChange,
  staff,
  branches,
  positionOptions,
}: StaffFormDialogProps) {
  const isEdit = !!staff;
  const router = useRouter();
  const schema = useMemo(() => staffSchemaForMode(isEdit), [isEdit]);
  const defaultValues = useMemo(() => toFormValues(staff), [staff]);
  const copy = messages.owner.staffForm;

  async function handleSubmit(values: StaffFormValues) {
    const requiredBranchKind = requiredBranchKindForPositionCode(
      values.position_code,
    );

    const payload: Record<string, unknown> = {
      full_name: values.full_name,
      phone: values.phone,
      position_code: values.position_code,
    };
    if (
      requiredBranchKind !== null &&
      values.branch_id &&
      values.branch_id !== NO_BRANCH
    ) {
      payload.branch_id = values.branch_id;
    }
    if (!isEdit) {
      payload.email = values.email;
      payload.password = values.password;
    }
    const fd = valuesToFormData(payload);
    if (isEdit && staff) {
      fd.set("id", String(staff.id));
    }
    return isEdit ? updateStaff(null, fd) : createStaff(null, fd);
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? copy.editTitle : copy.createTitle}
      description={isEdit ? copy.editDescription : copy.createDescription}
      schema={schema}
      defaultValues={defaultValues}
      entityKey={staff?.id ?? "new"}
      onSubmit={handleSubmit}
      onSuccess={(result) => {
        const staffId = (result.data as { staffId?: string | null } | undefined)
          ?.staffId;
        if (!isEdit && staffId) {
          toast.success(copy.createContinuePermissions);
          router.push(`/hr/staff/${staffId}/permissions?tab=permissions`);
          return;
        }
        toast.success(isEdit ? copy.editSuccess : copy.createSuccess);
      }}
      submitLabel={isEdit ? ACTIONS_VI.update : ACTIONS_VI.create}
      contentClassName="sm:max-w-md"
    >
      {(form) => {
        const selectedPosition = form.watch("position_code");
        const requiredBranchKind =
          requiredBranchKindForPositionCode(selectedPosition);
        const branchChoices =
          requiredBranchKind && requiredBranchKind !== "unassigned"
            ? branches.filter(
                (b) => (b.branch_kind ?? "branch") === requiredBranchKind,
              )
            : branches;
        const isSiteOptional = requiredBranchKind === null;
        const branchOptions = branchChoices.map((b) => ({
          value: b.id.toString(),
          label: b.name,
        }));

        return (
          <>
            {!isEdit && (
              <FieldSet>
                <FieldLegend>{copy.accountSection}</FieldLegend>
                <TextField
                  control={form.control}
                  name="email"
                  label="Email"
                  type="email"
                  placeholder="nhanvien@comtammatu.com"
                  required
                />
                <TextField
                  control={form.control}
                  name="password"
                  label="Mật khẩu"
                  type="password"
                  placeholder={messages.owner.staffForm.passwordPlaceholder}
                  required
                />
              </FieldSet>
            )}

            <FieldSet>
              <FieldLegend>{copy.assignmentSection}</FieldLegend>
              <TextField
                control={form.control}
                name="full_name"
                label="Họ tên"
                placeholder={messages.owner.staffForm.fullNamePlaceholder}
                required
              />

              <TextField
                control={form.control}
                name="phone"
                label="Số điện thoại"
                type="tel"
                placeholder="0901 234 567"
              />

              <SelectField
                control={form.control}
                name="position_code"
                label="Chức vụ"
                options={positionOptions}
                placeholder={messages.owner.staffForm.rolePlaceholder}
                required
              />

              <SelectField
                control={form.control}
                name="branch_id"
                label="Chi nhánh / địa điểm"
                options={branchOptions}
                placeholder={
                  isSiteOptional
                    ? messages.owner.staffForm.branchNotApplicable
                    : messages.owner.staffForm.branchPlaceholder
                }
                disabled={isSiteOptional}
                description={
                  !isSiteOptional
                    ? messages.owner.staffForm.branchDescription
                    : undefined
                }
              />
            </FieldSet>
          </>
        );
      }}
    </FormDialog>
  );
}
