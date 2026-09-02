"use client";

/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: existing HR employee form keeps Vietnamese operational copy inline */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { z } from "zod";
import type { UseFormReturn } from "react-hook-form";
import { Button } from "@comtammatu/ui/components/button";
import { Badge } from "@comtammatu/ui/components/badge";
import { FieldGroup } from "@comtammatu/ui/components/field";
import { Spinner } from "@comtammatu/ui/components/spinner";
import {
  FormDialog,
  SelectField,
  TextField,
  BusinessDateField,
  MoneyVndField,
  NumberField,
} from "@/components/form";
import { requiredBranchKindForPositionCode } from "@comtammatu/shared/auth";
import { messages } from "@lib/messages";
import { createEmployeeAccount, updateEmployee } from "./actions";
import type {
  BranchOption,
  EmployeeRow,
  EmployeeShiftOption,
} from "./_types";
import type { PositionTasksData } from "./position-tasks-actions";

const NO_BRANCH = "none";
const NO_CONTRACT = "none";
const NO_SHIFT = "none";
const STATUS_ACTIVE = "active";
const STATUS_INACTIVE = "inactive";
const PAY_BASIS_DEFAULT = "attendance_prorated" as const;
export const CONTRACT_TYPE_OPTIONS = [
  { value: NO_CONTRACT, label: "Chưa ghi nhận" },
  { value: "probation", label: "Thử việc" },
  { value: "fixed_term", label: "Xác định thời hạn" },
  { value: "indefinite", label: "Không xác định thời hạn" },
] as const;

const ONBOARD_STEPS = [
  "account",
  "placement",
  "shift_tasks",
  "contract",
] as const;
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
const wageUnitField = z.enum(["monthly", "daily"]);

const employeeSchema = z.object({
  full_name: z.string().trim().min(1, { error: "Họ tên không được để trống" }),
  email: z.string().email({ error: "Email không hợp lệ" }),
  password: z.string().min(8, { error: "Mật khẩu phải có ít nhất 8 ký tự" }),
  phone: z.string().trim().optional(),
  position_code: z.string().min(1, { error: "Chọn chức vụ" }),
  branch_id: z.string().optional(),
  employee_code: z.string().trim().optional(),
  start_date: z.string().optional(),
  today_shift_id: z.string().optional(),
  contract_type: z.string().optional(),
  contract_number: z.string().trim().optional(),
  contract_signed_date: z.string().optional(),
  contract_end_date: z.string().optional(),
  base_salary: baseSalaryField,
  insurance_base_salary: insuranceBaseSalaryField,
  dependents_count: dependentsField,
  pay_basis: payBasisField,
  wage_unit: wageUnitField,
  daily_rate: baseSalaryField,
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
  wage_unit: wageUnitField,
  daily_rate: baseSalaryField,
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
  today_shift_id: NO_SHIFT,
  contract_type: NO_CONTRACT,
  contract_number: "",
  contract_signed_date: "",
  contract_end_date: "",
  base_salary: "",
  insurance_base_salary: "",
  dependents_count: "0",
  pay_basis: PAY_BASIS_DEFAULT,
  wage_unit: "monthly",
  daily_rate: "",
  id_number: "",
  bank_account: "",
};

const STEP_FIELDS: Record<OnboardStep, (keyof EmployeeFormValues)[]> = {
  account: ["full_name", "email", "password"],
  placement: ["position_code", "branch_id", "employee_code", "start_date"],
  shift_tasks: ["today_shift_id"],
  contract: [
    "contract_type",
    "contract_number",
    "contract_signed_date",
    "contract_end_date",
    "base_salary",
    "insurance_base_salary",
    "dependents_count",
    "pay_basis",
    "wage_unit",
    "daily_rate",
    "id_number",
    "bank_account",
  ],
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
    wage_unit:
      contract?.wage_unit === "daily" ? "daily" : ("monthly" as const),
    daily_rate: contract?.daily_rate?.toString() ?? "",
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
  shifts?: EmployeeShiftOption[];
  positionTasksData?: PositionTasksData | null;
}

export function EmployeeFormDialog({
  open,
  onOpenChange,
  branches,
  positionOptions,
  mode = "create",
  employee,
  shifts = [],
  positionTasksData = null,
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
        wageUnit: values.wage_unit,
        dailyRate: values.daily_rate ? Number(values.daily_rate) : null,
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
                <BusinessDateField
                  control={form.control}
                  name="start_date"
                  label="Ngày bắt đầu"
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
                description="Nguồn tính lương tháng, mức đóng BH và thuế TNCN khi tạo kỳ lương."
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
                <BusinessDateField
                  control={form.control}
                  name="contract_signed_date"
                  label="Ngày ký HĐ"
                />
                <BusinessDateField
                  control={form.control}
                  name="contract_end_date"
                  label="Ngày hết hạn HĐ"
                />
                <SelectField
                  control={form.control}
                  name="pay_basis"
                  label={messages.hr.payBasis.fieldLabel}
                  options={messages.hr.payBasis.options.map((option) => ({
                    value: option.value,
                    label: option.label,
                  }))}
                />
                <SelectField
                  control={form.control}
                  name="wage_unit"
                  label={messages.hr.wageUnit.fieldLabel}
                  options={messages.hr.wageUnit.options.map((option) => ({
                    value: option.value,
                    label: option.label,
                  }))}
                />
                {form.watch("wage_unit") === "daily" ? (
                  <MoneyVndField
                    control={form.control}
                    name="daily_rate"
                    label="Lương ngày (VND)"
                    placeholder="500.000"
                  />
                ) : (
                  <MoneyVndField
                    control={form.control}
                    name="base_salary"
                    label="Lương tháng (VND)"
                    placeholder="12.000.000"
                  />
                )}
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
                description="Chỉ người có quyền quản lý hồ sơ nhạy cảm được nhập và xem."
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
    const todayShiftId =
      values.today_shift_id && values.today_shift_id !== NO_SHIFT
        ? Number(values.today_shift_id)
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
      todayShiftId,
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
      wageUnit: values.wage_unit,
      dailyRate: values.daily_rate ? Number(values.daily_rate) : null,
      idNumber: values.id_number || undefined,
      bankAccount: values.bank_account || undefined,
    });
  }

  const step = ONBOARD_STEPS[stepIndex] ?? "account";
  const stepMeta = onboardCopy[step] ?? onboardCopy.account;
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

        const selectedPositionTasks =
          positionTasksData && selectedPosition
            ? (() => {
                const pos = positionTasksData.positions.find(
                  (p) => p.code === selectedPosition,
                );
                return pos ? (positionTasksData.tasksByPosition[pos.id] ?? []) : [];
              })()
            : [];

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
                  {(onboardCopy[key]?.title ?? key).replace(/^Bước \d+ · /, "")}
                </li>
              ))}
            </ol>

            {step === "account" ? (
              <FormGroupBlock
                title="Tài khoản đăng nhập & Định danh"
                description="Tạo tài khoản truy cập hệ thống và thông tin liên hệ chính của nhân viên."
              >
                <TextField
                  control={form.control}
                  name="full_name"
                  label="Họ và tên"
                  placeholder="Nguyễn Văn A"
                  required
                />
                <TextField
                  control={form.control}
                  name="phone"
                  label="Số điện thoại"
                  placeholder="0901234567"
                  required
                />
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
                  label="Mật khẩu khởi tạo"
                  type="password"
                  placeholder="Tối thiểu 8 ký tự"
                  required
                />
                <div className="col-span-full flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="h-auto p-0 text-xs font-normal text-primary"
                    onClick={() => {
                      const fn = form.getValues("full_name");
                      if (fn) {
                        const parts = fn
                          .toLowerCase()
                          .normalize("NFD")
                          .replace(/[\u0300-\u036f]/g, "")
                          .replace(/đ/g, "d")
                          .trim()
                          .split(/\s+/);
                        const last = parts[parts.length - 1] ?? "nv";
                        const initials = parts.slice(0, -1).map((p) => p[0]).join("");
                        const rand = Math.floor(10 + Math.random() * 90);
                        form.setValue("email", `${last}${initials}${rand}@comtammatu.vn`, {
                          shouldValidate: true,
                        });
                      }
                    }}
                  >
                    Gợi ý email theo tên
                  </Button>
                  <span>·</span>
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="h-auto p-0 text-xs font-normal text-primary"
                    onClick={() => {
                      const rand = Math.floor(100000 + Math.random() * 900000);
                      form.setValue("password", `Matu@${rand}`, {
                        shouldValidate: true,
                      });
                    }}
                  >
                    Tạo mật khẩu ngẫu nhiên
                  </Button>
                </div>
              </FormGroupBlock>
            ) : null}

            {step === "placement" ? (
              <FormGroupBlock
                title="Vai trò & Nơi làm việc"
                description="Chức vụ và chi nhánh làm việc (hệ thống tự động áp dụng mẫu phân quyền tương ứng)."
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
                <BusinessDateField
                  control={form.control}
                  name="start_date"
                  label="Ngày bắt đầu"
                />
                <div className="col-span-full">
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="h-auto p-0 text-xs font-normal text-primary"
                    onClick={() => {
                      const rand = Math.floor(100 + Math.random() * 900);
                      form.setValue("employee_code", `NV${rand}`, {
                        shouldValidate: true,
                      });
                    }}
                  >
                    Sinh mã nhân viên tự động
                  </Button>
                </div>
              </FormGroupBlock>
            ) : null}

            {step === "shift_tasks" ? (
              <div className="flex flex-col gap-4">
                <FormGroupBlock
                  title="Ca làm việc ban đầu"
                  description="Chọn ca làm việc tiêu chuẩn hoặc phân ca ngay cho hôm nay."
                >
                  <SelectField
                    control={form.control}
                    name="today_shift_id"
                    label="Phân ca hôm nay (tùy chọn)"
                    options={[
                      {
                        value: NO_SHIFT,
                        label: "Chưa phân ca hôm nay (phân ca sau)",
                      },
                      ...shifts.map((s) => ({
                        value: s.id.toString(),
                        label: `${s.name} (${s.start_time.slice(0, 5)}–${s.end_time.slice(0, 5)})`,
                      })),
                    ]}
                    placeholder="Chọn ca làm việc"
                  />
                </FormGroupBlock>

                <FormGroupBlock
                  title="Việc trong ca theo chức vụ"
                  description="Danh sách công việc tự động giao cho nhân viên khi chấm công vào ca."
                >
                  <div className="col-span-full">
                    {selectedPositionTasks.length > 0 ? (
                      <div className="flex flex-col gap-2 max-h-48 overflow-y-auto pr-1">
                        {selectedPositionTasks.map((t, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between rounded bg-muted/30 px-3 py-2 text-xs"
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{t.title}</span>
                              {t.isRequired ? (
                                <Badge variant="outline">Bắt buộc</Badge>
                              ) : null}
                            </div>
                            <span className="text-muted-foreground">
                              {t.phase === "start_of_shift"
                                ? "Đầu ca"
                                : t.phase === "end_of_shift"
                                  ? "Cuối ca"
                                  : "Trong ca"}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs italic text-muted-foreground">
                        Chức vụ này chưa có danh sách việc mẫu (có thể thiết lập tại mục Thiết lập nhân sự &gt; Việc trong ca).
                      </p>
                    )}
                  </div>
                </FormGroupBlock>
              </div>
            ) : null}

            {step === "contract" ? (
              <FormGroupBlock
                title="Chế độ đãi ngộ & HĐLĐ"
                description="Nguồn tính lương tháng, mức đóng BHXH và thông tin thanh toán (chọn mẫu nhanh để điền tự động)."
              >
                <div className="col-span-full flex flex-wrap items-center gap-2 pb-1">
                  <span className="text-xs font-medium text-muted-foreground">
                    Mẫu nhanh:
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => {
                      form.setValue("wage_unit", "daily");
                      form.setValue("pay_basis", "attendance_prorated");
                      form.setValue("contract_type", "probation");
                      form.setValue("insurance_base_salary", "0");
                      form.setValue("dependents_count", "0");
                    }}
                  >
                    Thời vụ / Part-time
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => {
                      form.setValue("wage_unit", "monthly");
                      form.setValue("pay_basis", "attendance_prorated");
                      form.setValue("contract_type", "probation");
                      form.setValue("insurance_base_salary", "0");
                    }}
                  >
                    Thử việc
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => {
                      form.setValue("wage_unit", "monthly");
                      form.setValue("pay_basis", "attendance_prorated");
                      form.setValue("contract_type", "fixed_term");
                    }}
                  >
                    Chính thức (Full-time)
                  </Button>
                </div>

                <SelectField
                  control={form.control}
                  name="wage_unit"
                  label={messages.hr.wageUnit.fieldLabel}
                  options={messages.hr.wageUnit.options.map((option) => ({
                    value: option.value,
                    label: option.label,
                  }))}
                />
                <SelectField
                  control={form.control}
                  name="pay_basis"
                  label={messages.hr.payBasis.fieldLabel}
                  options={messages.hr.payBasis.options.map((option) => ({
                    value: option.value,
                    label: option.label,
                  }))}
                />
                {form.watch("wage_unit") === "daily" ? (
                  <MoneyVndField
                    control={form.control}
                    name="daily_rate"
                    label="Lương ngày (VND)"
                    placeholder="300.000"
                  />
                ) : (
                  <MoneyVndField
                    control={form.control}
                    name="base_salary"
                    label="Lương tháng (VND)"
                    placeholder="12.000.000"
                  />
                )}
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
                <TextField
                  control={form.control}
                  name="id_number"
                  label="CMND / CCCD"
                  placeholder="079..."
                />
                <TextField
                  control={form.control}
                  name="bank_account"
                  label="Số tài khoản ngân hàng"
                  placeholder="Vietcombank - 0123..."
                />

                <div className="col-span-full pt-2 border-t border-border/50">
                  <p className="text-xs font-semibold text-muted-foreground mb-1">
                    Hợp đồng lao động (Tùy chọn bổ sung)
                  </p>
                </div>
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
                <BusinessDateField
                  control={form.control}
                  name="contract_signed_date"
                  label="Ngày ký HĐ"
                />
                <BusinessDateField
                  control={form.control}
                  name="contract_end_date"
                  label="Ngày hết hạn HĐ"
                />
              </FormGroupBlock>
            ) : null}
          </>
        );
      }}
    </FormDialog>
  );
}
