"use client";

import { useEffect, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@comtammatu/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@comtammatu/ui/components/dialog";
import { FieldGroup } from "@comtammatu/ui/components/field";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { toast } from "@comtammatu/ui/components/sonner";
import { NumberField, SelectField, TextField } from "@/components/form";
import { createEmployee } from "./actions";

const employeeSchema = z.object({
  profile_id: z
    .string()
    .trim()
    .min(1, { error: "Profile UUID không được trống" }),
  employee_code: z.string().trim().optional(),
  id_number: z.string().trim().optional(),
  bank_account: z.string().trim().optional(),
  bank_name: z.string().trim().optional(),
  base_salary: z.string().optional(),
  dependents_count: z.string().optional(),
  start_date: z.string().optional(),
  contract_type: z
    .union([z.enum(["probation", "fixed_term", "indefinite"]), z.literal("")])
    .optional(),
});

type EmployeeFormValues = z.infer<typeof employeeSchema>;

const CONTRACT_TYPE_OPTIONS = [
  { value: "probation", label: "Thử việc" },
  { value: "fixed_term", label: "Có thời hạn" },
  { value: "indefinite", label: "Không thời hạn" },
] as const;

const DEFAULT_VALUES: EmployeeFormValues = {
  profile_id: "",
  employee_code: "",
  id_number: "",
  bank_account: "",
  bank_name: "",
  base_salary: "",
  dependents_count: "0",
  start_date: "",
  contract_type: "",
};

function parseOptionalNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

interface EmployeeFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EmployeeFormDialog({
  open,
  onOpenChange,
}: EmployeeFormDialogProps) {
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<EmployeeFormValues>({
    resolver: zodResolver(employeeSchema),
    defaultValues: DEFAULT_VALUES,
  });

  useEffect(() => {
    if (open) {
      form.reset(DEFAULT_VALUES);
      setServerError(null);
    }
  }, [open, form]);

  function onValid(values: EmployeeFormValues) {
    startTransition(async () => {
      setServerError(null);
      const result = await createEmployee({
        profileId: values.profile_id,
        employeeCode: values.employee_code || undefined,
        idNumber: values.id_number || undefined,
        bankAccount: values.bank_account || undefined,
        bankName: values.bank_name || undefined,
        baseSalary: parseOptionalNumber(values.base_salary),
        startDate: values.start_date || undefined,
        contractType:
          values.contract_type === "" ? undefined : values.contract_type,
        dependentsCount: parseOptionalNumber(values.dependents_count) ?? 0,
      });
      if (!result.success) {
        setServerError(result.error ?? "Đã xảy ra lỗi");
        return;
      }
      toast.success("Đã tạo hồ sơ nhân viên mới");
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Thêm hồ sơ nhân viên</DialogTitle>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onValid)} noValidate>
          <FieldGroup>
            <TextField
              control={form.control}
              name="profile_id"
              label="Profile UUID"
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              description="Nhập UUID từ trang Nhân sự (tab Nhân viên → ID của profile)"
              required
            />

            <div className="grid grid-cols-2 gap-4">
              <TextField
                control={form.control}
                name="employee_code"
                label="Mã nhân viên"
                placeholder="NV001"
              />
              <TextField
                control={form.control}
                name="id_number"
                label="Số CCCD / CMND"
                placeholder="012345678901"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <TextField
                control={form.control}
                name="bank_account"
                label="Số tài khoản"
                placeholder="1234567890"
              />
              <TextField
                control={form.control}
                name="bank_name"
                label="Ngân hàng"
                placeholder="Vietcombank"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <NumberField
                control={form.control}
                name="base_salary"
                label="Lương cơ bản (VND)"
                maxFractionDigits={0}
                placeholder="5.000.000"
              />
              <NumberField
                control={form.control}
                name="dependents_count"
                label="Số người phụ thuộc"
                maxFractionDigits={0}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <TextField
                control={form.control}
                name="start_date"
                label="Ngày bắt đầu"
                type="date"
              />
              <SelectField
                control={form.control}
                name="contract_type"
                label="Loại hợp đồng"
                options={CONTRACT_TYPE_OPTIONS}
                placeholder="Chọn loại HĐ"
              />
            </div>

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
              Hủy
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Spinner className="mr-2" />}
              Tạo hồ sơ
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
