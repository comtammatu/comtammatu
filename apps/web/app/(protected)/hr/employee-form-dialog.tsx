"use client";

/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: existing HR employee form keeps Vietnamese operational copy inline */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { z } from "zod";
import type { UseFormReturn } from "react-hook-form";
import { Button } from "@comtammatu/ui/components/button";
import { FieldGroup } from "@comtammatu/ui/components/field";
import { Spinner } from "@comtammatu/ui/components/spinner";
import {
  FormDialog,
  SelectField,
  TextField,
  MoneyVndField,
  NumberField,
} from "@/components/form";
import { requiredBranchKindForPositionCode } from "@comtammatu/shared/auth";
import { messages } from "@lib/messages";
import { createEmployeeAccount, updateEmployee } from "./actions";
import type { BranchOption, EmployeeRow } from "./_types";

const NO_BRANCH = "none";
const NO_CONTRACT = "none";
const STATUS_ACTIVE = "active";
const STATUS_INACTIVE = "inactive";
const PAY_BASIS_DEFAULT = "attendance_prorated" as const;
export const CONTRACT_TYPE_OPTIONS = [
  { value: NO_CONTRACT, label: "Chưa ghi nhận" },
  { value: "probation", label: "Thử việc" },
  { value: "fixed_term", label: "Xác định thời hạn" },
  { value: "indefinite", label: "Không xác định thời hạn" },
] as const;

const ONBOARD_STEPS = ["profile", "placement", "contract", "account"] as const;
type OnboardStep = (typeof ONBOARD_STEPS)[number];

const baseSalaryField = z
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
  );

const insuranceBaseSalaryField = baseSalaryField;

const dependentsField = z
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
  );

const payBasisField = z.enum(["attendance_prorated", "fixed_monthly"]);

const employeeSchema = z.object({
  full_name: z.string().trim().min(1, { error: "Họ tên không được để trống" }),
  email: z.string().email({ error: "Email không hợp lệ" }),
  password: z.string().min(8, { error: "Mật khẩu phải có ít nhất 8 ký tự" }),
  phone: z.string().trim().optional(),
  position_code: z.string().min(1, { error: "Chọn chức vụ" }),
  branch_id: z.string().optional(),
  employee_code: z.string().trim().optional(),
  start_date: z.string().optional(),
  contract_type: z.string().optional(),
  contract_number: z.string().trim().optional(),
  contract_signed_date: z.string().optional(),
  contract_end_date: z.string().optional(),
  base_salary: baseSalaryField,
  insurance_base_salary: insuranceBaseSalaryField,
  dependents_count: dependentsField,
  pay_basis: payBasisField,
  id_number: z.string().trim().optional(),
  bank_account: z.string().trim().optional(),
});

// Edit mode never touches auth identity (email/password) —
// those are create-only or managed via /hr/staff.
const editEmployeeSchema = z.object({
  full_name: z.string().trim().min(1, { error: "Họ tên không được để trống" }),
  phone: z.string().trim().optional(),
  position_code: z.string().min(1, { error: "Chọn chức vụ" }),
  branch_id: z.string().optional(),
  employee_code: z.string().trim().optional(),
  start_date: z.string().optional(),
  contract_type: z.string().optional(),
  contract_number: z.string().trim().optional(),
  contract_signed_date: z.string().optional(),
  contract_end_date: z.string().optional(),
  base_salary: baseSalaryField,
  insurance_base_salary: insuranceBaseSalaryField,
  dependents_count: dependentsField,
  pay_basis: payBasisField,
  id_number: z.string().trim().optional(),
  bank_account: z.string().trim().optional(),
  status: z.string(),
});

type EmployeeFormValues = z.infer<typeof employeeSchema>;
type EditEmployeeFormValues = z.infer<typeof editEmployeeSchema>;

const DEFAULT_VALUES: EmployeeFormValues = {
  full_name: "",
  email: "",
  password: "",
  phone: "",
  position_code: "",
  branch_id: NO_BRANCH,
  employee_code: "",
  start_date: "",
  contract_type: NO_CONTRACT,
  contract_number: "",
  contract_signed_date: "",
  contract_end_date: "",
  base_salary: "",
  insurance_base_salary: "",
  dependents_count: "0",
  pay_basis: PAY_BASIS_DEFAULT,
  id_number: "",
  bank_account: "",
};

const STEP_FIELDS: Record<OnboardStep, (keyof EmployeeFormValues)[]> = {
  profile: ["full_name", "phone", "id_number", "bank_account"],
  placement: ["position_code", "branch_id", "employee_code", "start_date"],
  contract: [
    "contract_type",
    "contract_number",
    "contract_signed_date",
    "contract_end_date",
    "base_salary",
    "insurance_base_salary",
    "dependents_count",
    "pay_basis",
  ],
  account: ["email", "password"],
};

function activeContract(employee: EmployeeRow) {
  return [...(employee.employment_contracts ?? [])]
    .filter((contract) => contract.status === "active")
    .sort((a, b) => b.start_date.localeCompare(a.start_date))[0];
}

function resolvePayBasis(
  value: string | null | undefined,
): "attendance_prorated" | "fixed_monthly" {
  return value === "fixed_monthly" ? "fixed_monthly" : PAY_BASIS_DEFAULT;
}

function FormGroupBlock({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <FieldGroup className="gap-3 p-3">
      <div className="flex flex-col gap-1">
        <p className="font-heading text-sm font-semibold">{title}</p>
        <p className="text-xs leading-5 text-muted-foreground">{description}</p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>
    </FieldGroup>
  );
}

function editDefaults(employee: EmployeeRow): EditEmployeeFormValues {
  const contract = activeContract(employee);
  return {
    full_name: employee.profiles?.full_name ?? "",
    phone: employee.profiles?.phone ?? "",
    position_code: employee.profiles?.positions?.code ?? "",
    branch_id: employee.profiles?.branch_id?.toString() ?? NO_BRANCH,
    employee_code: employee.employee_code ?? "",
    start_date: employee.start_date ?? "",
    contract_type: employee.contract_type ?? NO_CONTRACT,
    contract_number: contract?.contract_number ?? "",
    contract_signed_date: contract?.signed_date ?? "",
    contract_end_date: contract?.end_date ?? "",
    base_salary: employee.base_salary?.toString() ?? "",
    insurance_base_salary: (
      contract?.insurance_base_salary ??
      employee.insurance_base_salary ??
      ""
    ).toString(),
    dependents_count: employee.dependents_count.toString(),
    pay_basis: resolvePayBasis(contract?.pay_basis),
    id_number: employee.id_number ?? "",
    bank_account: employee.bank_account ?? "",
    status: employee.is_active ? STATUS_ACTIVE : STATUS_INACTIVE,
  };
}

interface EmployeeFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branches: BranchOption[];
  positionOptions: { value: string; label: string }[];
  mode?: "create" | "edit";
  employee?: EmployeeRow | null;
}

export function EmployeeFormDialog({
  open,
  onOpenChange,
  branches,
  positionOptions,
  mode = "create",
  employee,
}: EmployeeFormDialogProps) {
  const onboardCopy = messages.hr.client.onboardSteps;
  const [stepIndex, setStepIndex] = useState(0);
  const formRef = useRef<UseFormReturn<EmployeeFormValues> | null>(null);

  useEffect(() => {
    if (open) setStepIndex(0);
  }, [open]);

  function contractType(value: string | undefined) {
    return value && value !== NO_CONTRACT
      ? (value as "probation" | "fixed_term" | "indefinite")
      : null;
  }

  if (mode === "edit" && employee) {
    async function handleEditSubmit(values: EditEmployeeFormValues) {
      const branchId =
        values.branch_id && values.branch_id !== NO_BRANCH
          ? Number(values.branch_id)
          : null;

      return updateEmployee({
        employeeId: employee!.id,
        fullName: values.full_name,
        phone: values.phone || undefined,
        positionCode: values.position_code,
        branchId: branchId,
        employeeCode: values.employee_code ?? "",
        startDate: values.start_date ?? "",
        contractType: contractType(values.contract_type),
        contractNumber: values.contract_number || undefined,
        contractSignedDate: values.contract_signed_date || undefined,
        contractEndDate: values.contract_end_date || undefined,
        baseSalary: values.base_salary ? Number(values.base_salary) : 0,
        insuranceBaseSalary: values.insurance_base_salary
          ? Number(values.insurance_base_salary)
          : 0,
        dependentsCount: values.dependents_count
          ? Number(values.dependents_count)
          : 0,
        payBasis: values.pay_basis,
        idNumber: values.id_number ?? "",
        bankAccount: values.bank_account ?? "",
        isActive: values.status === STATUS_ACTIVE,
      });
    }

    return (
      <FormDialog
        open={open}
        onOpenChange={onOpenChange}
        schema={editEmployeeSchema}
        defaultValues={editDefaults(employee)}
        entityKey={employee.id}
        title="Sửa hồ sơ nhân viên"
        submitLabel="Lưu"
        successMessage="Đã cập nhật hồ sơ nhân viên"
        contentClassName="sm:max-w-2xl"
        onSubmit={handleEditSubmit}
      >
        {(form) => {
          const selectedPosition = form.watch("position_code");
          const requiredBranchKind =
            requiredBranchKindForPositionCode(selectedPosition);
          const isSiteOptional = requiredBranchKind === null;
          const branchChoices =
            requiredBranchKind && requiredBranchKind !== "unassigned"
              ? branches.filter(
                  (branch) =>
                    (branch.branch_kind ?? "branch") === requiredBranchKind,
                )
              : branches;

          return (
            <>
              <TextField
                control={form.control}
                name="full_name"
                label="Họ tên"
                placeholder="Nguyễn Văn A"
                required
              />

              <FormGroupBlock
                title="Hồ sơ làm việc"
                description="Thông tin dùng cho phân quyền, chi nhánh, việc trong ca và trạng thái đi làm."
              >
                <TextField
                  control={form.control}
                  name="phone"
                  label="Số điện thoại"
                  placeholder="0901234567"
                />
                <SelectField
                  control={form.control}
                  name="position_code"
                  label="Chức vụ"
                  options={positionOptions}
                  placeholder="Chọn chức vụ"
                />
                <SelectField
                  control={form.control}
                  name="branch_id"
                  label="Chi nhánh / địa điểm"
                  options={[
                    { value: NO_BRANCH, label: "Không thuộc địa điểm" },
                    ...branchChoices.map((branch) => ({
                      value: branch.id.toString(),
                      label: branch.name,
                    })),
                  ]}
                  placeholder="Không thuộc địa điểm"
                  disabled={isSiteOptional}
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
                  name="status"
                  label="Trạng thái"
                  options={[
                    { value: STATUS_ACTIVE, label: "Hoạt động" },
                    { value: STATUS_INACTIVE, label: "Tạm ngưng" },
                  ]}
                />
              </FormGroupBlock>

              <FormGroupBlock
                title="HĐLĐ, lương và BHXH"
                description="Nguồn tính lương tháng, mức đóng BH và thuế TNCN khi tạo kỳ payroll."
              >
                <SelectField
                  control={form.control}
                  name="contract_type"
                  label="Loại hợp đồng"
                  options={CONTRACT_TYPE_OPTIONS}
                  placeholder="Chưa ghi nhận"
                />
                <TextField
                  control={form.control}
                  name="contract_number"
                  label="Số HĐLĐ"
                  placeholder="HD-2026-001"
                />
                <TextField
                  control={form.control}
                  name="contract_signed_date"
                  label="Ngày ký HĐ"
                  type="date"
                />
                <TextField
                  control={form.control}
                  name="contract_end_date"
                  label="Ngày hết hạn HĐ"
                  type="date"
                />
                <SelectField
                  control={form.control}
                  name="pay_basis"
                  label={messages.hr.payBasis.fieldLabel}
                  options={messages.hr.payBasis.options.map((option) => ({
                    value: option.value,
                    label: option.label,
                  }))}
                  description={messages.hr.payBasis.fieldDescription}
                />
                <MoneyVndField
                  control={form.control}
                  name="base_salary"
                  label="Lương tháng (VND)"
                  placeholder="12.000.000"
                  description="Lương gộp/tháng — dùng để tính lương"
                />
                <MoneyVndField
                  control={form.control}
                  name="insurance_base_salary"
                  label="Lương đóng BH (VND)"
                  placeholder="0"
                  description="0 = chưa tham gia BHXH"
                />
                <NumberField
                  control={form.control}
                  name="dependents_count"
                  label="Số người phụ thuộc"
                  placeholder="0"
                  description="Chỉ ảnh hưởng thuế TNCN"
                  allowNegative={false}
                />
              </FormGroupBlock>

              <FormGroupBlock
                title="Định danh và thanh toán"
                description="Thông tin nhạy cảm chỉ chủ sở hữu được nhập và xem."
              >
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
              </FormGroupBlock>
            </>
          );
        }}
      </FormDialog>
    );
  }

  async function handleSubmit(values: EmployeeFormValues) {
    const branchId =
      values.branch_id && values.branch_id !== NO_BRANCH
        ? Number(values.branch_id)
        : undefined;
    return createEmployeeAccount({
      fullName: values.full_name,
      email: values.email,
      password: values.password,
      phone: values.phone || undefined,
      positionCode: values.position_code,
      branchId,
      employeeCode: values.employee_code || undefined,
      startDate: values.start_date || undefined,
      contractType: contractType(values.contract_type),
      contractNumber: values.contract_number || undefined,
      contractSignedDate: values.contract_signed_date || undefined,
      contractEndDate: values.contract_end_date || undefined,
      baseSalary: values.base_salary ? Number(values.base_salary) : undefined,
      insuranceBaseSalary: values.insurance_base_salary
        ? Number(values.insurance_base_salary)
        : 0,
      dependentsCount: values.dependents_count
        ? Number(values.dependents_count)
        : 0,
      payBasis: values.pay_basis,
      idNumber: values.id_number || undefined,
      bankAccount: values.bank_account || undefined,
    });
  }

  const step = ONBOARD_STEPS[stepIndex] ?? "profile";
  const stepMeta = onboardCopy[step];
  const isLastStep = stepIndex === ONBOARD_STEPS.length - 1;

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      schema={employeeSchema}
      defaultValues={DEFAULT_VALUES}
      entityKey="new-employee"
      title="Thêm nhân viên"
      description={`${stepMeta.title} — ${stepMeta.description}`}
      submitLabel="Thêm nhân viên"
      successMessage="Đã tạo tài khoản và hồ sơ nhân viên mới"
      contentClassName="sm:max-w-2xl"
      onSubmit={handleSubmit}
      renderFooter={({
        formId,
        isPending,
        requestClose,
        submitLabel,
        actionSize,
        cancelLabel,
      }) => (
        <>
          <Button
            type="button"
            variant="outline"
            size={actionSize}
            onClick={requestClose}
            disabled={isPending}
          >
            {cancelLabel}
          </Button>
          {stepIndex > 0 ? (
            <Button
              type="button"
              variant="outline"
              size={actionSize}
              onClick={() => setStepIndex((current) => Math.max(0, current - 1))}
              disabled={isPending}
            >
              {onboardCopy.back}
            </Button>
          ) : null}
          {isLastStep ? (
            <Button
              type="submit"
              form={formId}
              size={actionSize}
              disabled={isPending}
            >
              {isPending && <Spinner />}
              {submitLabel}
            </Button>
          ) : (
            <Button
              type="button"
              size={actionSize}
              disabled={isPending}
              onClick={() => {
                const form = formRef.current;
                if (!form) return;
                void form.trigger(STEP_FIELDS[step]).then((ok) => {
                  if (ok) {
                    setStepIndex((current) =>
                      Math.min(ONBOARD_STEPS.length - 1, current + 1),
                    );
                  }
                });
              }}
            >
              {onboardCopy.next}
            </Button>
          )}
        </>
      )}
    >
      {(form) => {
        formRef.current = form;
        const selectedPosition = form.watch("position_code");
        const requiredBranchKind =
          requiredBranchKindForPositionCode(selectedPosition);
        const isSiteOptional = requiredBranchKind === null;
        const branchChoices =
          requiredBranchKind && requiredBranchKind !== "unassigned"
            ? branches.filter(
                (branch) =>
                  (branch.branch_kind ?? "branch") === requiredBranchKind,
              )
            : branches;

        return (
          <>
            <ol className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              {ONBOARD_STEPS.map((key, index) => (
                <li
                  key={key}
                  className={
                    index === stepIndex
                      ? "font-medium text-foreground"
                      : undefined
                  }
                >
                  {index + 1}.{" "}
                  {onboardCopy[key].title.replace(/^Bước \d+ · /, "")}
                </li>
              ))}
            </ol>

            {step === "profile" ? (
              <FormGroupBlock
                title={onboardCopy.profile.title}
                description={onboardCopy.profile.description}
              >
                <TextField
                  control={form.control}
                  name="full_name"
                  label="Họ tên"
                  placeholder="Nguyễn Văn A"
                  required
                />
                <TextField
                  control={form.control}
                  name="phone"
                  label="Số điện thoại"
                  placeholder="0901234567"
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
              </FormGroupBlock>
            ) : null}

            {step === "placement" ? (
              <FormGroupBlock
                title={onboardCopy.placement.title}
                description={onboardCopy.placement.description}
              >
                <SelectField
                  control={form.control}
                  name="position_code"
                  label="Chức vụ"
                  options={positionOptions}
                  placeholder="Chọn chức vụ"
                />
                <SelectField
                  control={form.control}
                  name="branch_id"
                  label="Chi nhánh / địa điểm"
                  options={[
                    { value: NO_BRANCH, label: "Không thuộc địa điểm" },
                    ...branchChoices.map((branch) => ({
                      value: branch.id.toString(),
                      label: branch.name,
                    })),
                  ]}
                  placeholder="Không thuộc địa điểm"
                  disabled={isSiteOptional}
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
              </FormGroupBlock>
            ) : null}

            {step === "contract" ? (
              <FormGroupBlock
                title={onboardCopy.contract.title}
                description={onboardCopy.contract.description}
              >
                <SelectField
                  control={form.control}
                  name="contract_type"
                  label="Loại hợp đồng"
                  options={CONTRACT_TYPE_OPTIONS}
                  placeholder="Chưa ghi nhận"
                />
                <TextField
                  control={form.control}
                  name="contract_number"
                  label="Số HĐLĐ"
                  placeholder="HD-2026-001"
                />
                <TextField
                  control={form.control}
                  name="contract_signed_date"
                  label="Ngày ký HĐ"
                  type="date"
                />
                <TextField
                  control={form.control}
                  name="contract_end_date"
                  label="Ngày hết hạn HĐ"
                  type="date"
                />
                <SelectField
                  control={form.control}
                  name="pay_basis"
                  label={messages.hr.payBasis.fieldLabel}
                  options={messages.hr.payBasis.options.map((option) => ({
                    value: option.value,
                    label: option.label,
                  }))}
                  description={messages.hr.payBasis.fieldDescription}
                />
                <MoneyVndField
                  control={form.control}
                  name="base_salary"
                  label="Lương tháng (VND)"
                  placeholder="12.000.000"
                  description="Lương gộp/tháng — dùng để tính lương"
                />
                <MoneyVndField
                  control={form.control}
                  name="insurance_base_salary"
                  label="Lương đóng BH (VND)"
                  placeholder="0"
                  description="0 = chưa tham gia BHXH"
                />
                <NumberField
                  control={form.control}
                  name="dependents_count"
                  label="Số người phụ thuộc"
                  placeholder="0"
                  description="Chỉ ảnh hưởng thuế TNCN"
                  allowNegative={false}
                />
              </FormGroupBlock>
            ) : null}

            {step === "account" ? (
              <FormGroupBlock
                title={onboardCopy.account.title}
                description={onboardCopy.account.description}
              >
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
                <p className="col-span-full text-xs text-muted-foreground">
                  {onboardCopy.staffLink}
                </p>
              </FormGroupBlock>
            ) : null}
          </>
        );
      }}
    </FormDialog>
  );
}
