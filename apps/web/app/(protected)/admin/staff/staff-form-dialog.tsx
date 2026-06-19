"use client";

import { useMemo } from "react";
import { z } from "zod";
import { ACTIONS_VI } from "@comtammatu/shared/messages";
import { BRANCH_REQUIRED_OPERATIONAL_ROLES } from "@comtammatu/shared/auth";
import type { StaffRole } from "@comtammatu/shared/auth";
import {
  FormDialog,
  SelectField,
  TextField,
  valuesToFormData,
} from "@/components/form";
import { messages } from "@lib/messages";
import { createStaff, updateStaff } from "./actions";
import type { BranchOption, PositionOption, StaffRow } from "./staff-table";

const NO_BRANCH = "";

const staffSchema = z.object({
  email: z.string().optional(),
  password: z.string().optional(),
  full_name: z.string().trim().min(1, { error: "Họ tên không được trống" }),
  phone: z.string().trim().optional(),
  role: z.string().min(1, { error: "Vui lòng chọn chức vụ" }),
  branch_id: z.string().optional(),
});

type StaffFormValues = z.infer<typeof staffSchema>;

const TENANT_LEVEL_ROLES: readonly StaffRole[] = ["office"];

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
    role: staff?.role ?? "waiter",
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
  const schema = useMemo(() => staffSchemaForMode(isEdit), [isEdit]);
  const defaultValues = useMemo(() => toFormValues(staff), [staff]);

  async function handleSubmit(values: StaffFormValues) {
    const isTenantLevel = TENANT_LEVEL_ROLES.includes(
      values.role as (typeof TENANT_LEVEL_ROLES)[number],
    );

    const payload: Record<string, unknown> = {
      full_name: values.full_name,
      phone: values.phone,
      role: values.role,
    };
    if (!isTenantLevel && values.branch_id && values.branch_id !== NO_BRANCH) {
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
      title={isEdit ? "Chỉnh sửa nhân viên" : "Thêm nhân viên mới"}
      schema={schema}
      defaultValues={defaultValues}
      entityKey={staff?.id ?? "new"}
      onSubmit={handleSubmit}
      successMessage={isEdit ? "Đã cập nhật nhân viên" : "Đã tạo nhân viên mới"}
      submitLabel={isEdit ? ACTIONS_VI.update : ACTIONS_VI.create}
      contentClassName="sm:max-w-md"
    >
      {(form) => {
        const selectedRole = form.watch("role");
        const isTenantLevel = TENANT_LEVEL_ROLES.includes(
          selectedRole as (typeof TENANT_LEVEL_ROLES)[number],
        );
        const branchChoices =
          selectedRole === "warehouse_manager" ||
          selectedRole === "production_manager" ||
          BRANCH_REQUIRED_OPERATIONAL_ROLES.includes(selectedRole as StaffRole)
            ? branches.filter((b) => (b.branch_kind ?? "branch") === "branch")
            : branches;
        const branchOptions = branchChoices.map((b) => ({
          value: b.id.toString(),
          label: b.name,
        }));

        return (
          <>
            {!isEdit && (
              <>
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
                  placeholder={messages.admin.staffForm.passwordPlaceholder}
                  required
                />
              </>
            )}

            <TextField
              control={form.control}
              name="full_name"
              label="Họ tên"
              placeholder={messages.admin.staffForm.fullNamePlaceholder}
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
              name="role"
              label="Chức vụ"
              options={positionOptions}
              placeholder={messages.admin.staffForm.rolePlaceholder}
              required
            />

            <SelectField
              control={form.control}
              name="branch_id"
              label="Chi nhánh"
              options={branchOptions}
              placeholder={
                isTenantLevel
                  ? messages.admin.staffForm.branchNotApplicable
                  : messages.admin.staffForm.branchPlaceholder
              }
              disabled={isTenantLevel}
              description={
                !isTenantLevel
                  ? messages.admin.staffForm.branchDescription
                  : undefined
              }
            />
          </>
        );
      }}
    </FormDialog>
  );
}
