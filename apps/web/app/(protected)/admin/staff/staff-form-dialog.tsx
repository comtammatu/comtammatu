"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@comtammatu/ui/components/button";
import { Spinner } from "@comtammatu/ui/components/spinner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@comtammatu/ui/components/dialog";
import { FieldGroup } from "@comtammatu/ui/components/field";
import { toast } from "@comtammatu/ui/components/sonner";
import { ACTIONS_VI, ERRORS_VI } from "@comtammatu/shared/messages";
import { BRANCH_REQUIRED_OPERATIONAL_ROLES } from "@comtammatu/shared/auth";
import type { StaffRole } from "@comtammatu/shared/auth";
import { SelectField, TextField, valuesToFormData } from "@/components/form";
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
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<StaffFormValues, unknown, StaffFormValues>({
    resolver: zodResolver(staffSchema),
    defaultValues: toFormValues(staff),
  });

  useEffect(() => {
    if (open) {
      form.reset(toFormValues(staff));
      setServerError(null);
    }
  }, [open, staff, form]);

  const selectedRole = form.watch("role");
  const isTenantLevel = TENANT_LEVEL_ROLES.includes(
    selectedRole as (typeof TENANT_LEVEL_ROLES)[number],
  );

  const branchChoices = useMemo(() => {
    if (
      selectedRole === "warehouse_manager" ||
      selectedRole === "production_manager" ||
      BRANCH_REQUIRED_OPERATIONAL_ROLES.includes(selectedRole as StaffRole)
    ) {
      return branches.filter((b) => (b.branch_kind ?? "branch") === "branch");
    }
    return branches;
  }, [branches, selectedRole]);

  const branchOptions = branchChoices.map((b) => ({
    value: b.id.toString(),
    label: b.name,
  }));

  async function onValid(values: StaffFormValues) {
    if (!isEdit) {
      if (!values.email?.trim()) {
        form.setError("email", { message: "Email không được trống" });
        return;
      }
      if (!values.password || values.password.length < 8) {
        form.setError("password", {
          message: "Mật khẩu phải ≥ 8 ký tự",
        });
        return;
      }
    }

    startTransition(async () => {
      setServerError(null);
      const payload: Record<string, unknown> = {
        full_name: values.full_name,
        phone: values.phone,
        role: values.role,
      };
      if (
        !isTenantLevel &&
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
      const result = isEdit
        ? await updateStaff(null, fd)
        : await createStaff(null, fd);
      if (!result.success) {
        setServerError(result.error ?? ERRORS_VI.fallback);
        return;
      }
      onOpenChange(false);
      toast.success(isEdit ? "Đã cập nhật nhân viên" : "Đã tạo nhân viên mới");
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Chỉnh sửa nhân viên" : "Thêm nhân viên mới"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onValid)} noValidate>
          <FieldGroup>
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
              {isEdit ? ACTIONS_VI.update : ACTIONS_VI.create}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
