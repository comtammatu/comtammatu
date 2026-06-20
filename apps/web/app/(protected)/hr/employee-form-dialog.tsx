"use client";

/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: existing HR employee form keeps Vietnamese operational copy inline */

import { z } from "zod";
import { FieldGroup } from "@comtammatu/ui/components/field";
import { FormDialog, SelectField, TextField } from "@/components/form";
import { createEmployeeAccount } from "./actions";
import {
  checklistTemplateLabel,
  type ChecklistTemplateRow,
} from "./checklist-types";
import type { BranchOption } from "./page";

const NO_BRANCH = "none";
const NO_TEMPLATE = "none";

const employeeSchema = z.object({
  full_name: z.string().trim().min(1, { error: "Họ tên không được để trống" }),
  email: z.string().email({ error: "Email không hợp lệ" }),
  password: z.string().min(8, { error: "Mật khẩu phải có ít nhất 8 ký tự" }),
  phone: z.string().trim().optional(),
  role: z.string().min(1, { error: "Chọn vai trò" }),
  branch_id: z.string().optional(),
  employee_code: z.string().trim().optional(),
  start_date: z.string().optional(),
  default_checklist_template_id: z.string().optional(),
  base_salary: z
    .string()
    .trim()
    .optional()
    .refine(
      (value) => {
        if (!value) return true;
        const n = Number(value);
        return Number.isInteger(n) && n >= 0;
      },
      { error: "Lương không hợp lệ" },
    ),
  dependents_count: z
    .string()
    .trim()
    .optional()
    .refine(
      (value) => {
        if (!value) return true;
        const n = Number(value);
        return Number.isInteger(n) && n >= 0 && n <= 20;
      },
      { error: "Số người phụ thuộc không hợp lệ" },
    ),
  id_number: z.string().trim().optional(),
  bank_account: z.string().trim().optional(),
});

type EmployeeFormValues = z.infer<typeof employeeSchema>;

const DEFAULT_VALUES: EmployeeFormValues = {
  full_name: "",
  email: "",
  password: "",
  phone: "",
  role: "",
  branch_id: NO_BRANCH,
  employee_code: "",
  start_date: "",
  default_checklist_template_id: NO_TEMPLATE,
  base_salary: "",
  dependents_count: "0",
  id_number: "",
  bank_account: "",
};

interface EmployeeFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branches: BranchOption[];
  positionOptions: { value: string; label: string }[];
  checklistTemplates?: ChecklistTemplateRow[];
}

export function EmployeeFormDialog({
  open,
  onOpenChange,
  branches,
  positionOptions,
  checklistTemplates,
}: EmployeeFormDialogProps) {
  const availableTemplates = checklistTemplates ?? [];

  async function handleSubmit(values: EmployeeFormValues) {
    const defaultTemplateId =
      values.default_checklist_template_id &&
      values.default_checklist_template_id !== NO_TEMPLATE
        ? Number(values.default_checklist_template_id)
        : null;
    const branchId =
      values.branch_id && values.branch_id !== NO_BRANCH
        ? Number(values.branch_id)
        : undefined;
    return createEmployeeAccount({
      fullName: values.full_name,
      email: values.email,
      password: values.password,
      phone: values.phone || undefined,
      role: values.role,
      branchId,
      employeeCode: values.employee_code || undefined,
      startDate: values.start_date || undefined,
      defaultChecklistTemplateId: defaultTemplateId,
      baseSalary: values.base_salary ? Number(values.base_salary) : undefined,
      dependentsCount: values.dependents_count
        ? Number(values.dependents_count)
        : 0,
      idNumber: values.id_number || undefined,
      bankAccount: values.bank_account || undefined,
    });
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      schema={employeeSchema}
      defaultValues={DEFAULT_VALUES}
      entityKey="new-employee"
      title="Thêm nhân viên"
      submitLabel="Thêm nhân viên"
      successMessage="Đã tạo tài khoản và hồ sơ nhân viên mới"
      contentClassName="sm:max-w-lg"
      onSubmit={handleSubmit}
    >
      {(form) => (
        <>
          <TextField
            control={form.control}
            name="full_name"
              label="Họ tên"
              placeholder="Nguyễn Văn A"
              required
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <TextField
                control={form.control}
                name="email"
                label="Email đăng nhập"
                type="email"
                placeholder="nhanvien@comtammatu.vn"
                required
              />
              <TextField
                control={form.control}
                name="password"
                label="Mật khẩu"
                type="password"
                placeholder="Tối thiểu 8 ký tự"
                required
              />

              <TextField
                control={form.control}
                name="phone"
                label="Số điện thoại"
                placeholder="0901234567"
              />
              <SelectField
                control={form.control}
                name="role"
                label="Vai trò"
                options={positionOptions}
                placeholder="Chọn vai trò"
              />

              <SelectField
                control={form.control}
                name="branch_id"
                label="Chi nhánh"
                options={[
                  { value: NO_BRANCH, label: "Không thuộc chi nhánh" },
                  ...branches.map((branch) => ({
                    value: branch.id.toString(),
                    label: branch.name,
                  })),
                ]}
                placeholder="Không thuộc chi nhánh"
              />
              <TextField
                control={form.control}
                name="employee_code"
                label="Mã nhân viên"
                placeholder="NV001"
              />

              <TextField
                control={form.control}
                name="start_date"
                label="Ngày bắt đầu"
                type="date"
              />
              <SelectField
                control={form.control}
                name="default_checklist_template_id"
                label="Checklist mặc định"
                options={[
                  { value: NO_TEMPLATE, label: "Không gán mặc định" },
                  ...availableTemplates.map((template) => ({
                    value: template.id.toString(),
                    label: checklistTemplateLabel(template),
                  })),
                ]}
                placeholder="Không gán mặc định"
              />
            </div>

            <FieldGroup className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <TextField
                control={form.control}
                name="base_salary"
                label="Lương tháng (VND)"
                type="number"
                placeholder="12000000"
                description="Lương gộp/tháng — dùng để tính lương"
              />
              <TextField
                control={form.control}
                name="dependents_count"
                label="Số người phụ thuộc"
                type="number"
                placeholder="0"
                description="Chỉ ảnh hưởng thuế TNCN"
              />
              <TextField
                control={form.control}
                name="id_number"
                label="CMND/CCCD"
              />
              <TextField
                control={form.control}
                name="bank_account"
                label="Số tài khoản"
              />
            </FieldGroup>
        </>
      )}
    </FormDialog>
  );
}
