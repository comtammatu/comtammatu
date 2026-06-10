"use client";

/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: existing HR employee form keeps Vietnamese operational copy inline */

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
import { ACTIONS_VI, ERRORS_VI } from "@comtammatu/shared/messages";
import { TextField } from "@/components/form";
import { createEmployee } from "./actions";
import type { ChecklistTemplateRow } from "./checklist-types";

const employeeSchema = z.object({
  profile_id: z
    .string()
    .trim()
    .min(1, { error: "Profile UUID không được trống" }),
  employee_code: z.string().trim().optional(),
  start_date: z.string().optional(),
});

type EmployeeFormValues = z.infer<typeof employeeSchema>;

const DEFAULT_VALUES: EmployeeFormValues = {
  profile_id: "",
  employee_code: "",
  start_date: "",
};

interface EmployeeFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  checklistTemplates?: ChecklistTemplateRow[];
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
        startDate: values.start_date || undefined,
        dependentsCount: 0,
      });
      if (!result.success) {
        setServerError(result.error ?? ERRORS_VI.fallback);
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
          <DialogTitle>Thêm nhân viên</DialogTitle>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onValid)} noValidate>
          <FieldGroup>
            <TextField
              control={form.control}
              name="profile_id"
              label="Profile UUID"
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              description="Liên kết với tài khoản đăng nhập đã tạo sẵn."
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
                name="start_date"
                label="Ngày bắt đầu"
                type="date"
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
              {ACTIONS_VI.cancel}
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Spinner className="mr-2" />}
              Thêm nhân viên
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
