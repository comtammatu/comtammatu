"use client";

/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: HR operational copy inline */

import { z } from "zod";
import { NoteCallout } from "@comtammatu/ui/components/note-callout";
import { getVNDateString } from "@comtammatu/shared/time";
import {
  FormDialog,
  SelectField,
  TextField,
  BusinessDateField,
} from "@/components/form";
import { offboardEmployee } from "./actions";
import type { EmployeeRow } from "./_types";
import { messages } from "@lib/messages";

const offboardSchema = z.object({
  resignationDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Chọn ngày thôi việc hợp lệ" }),
  reason: z.string().min(1, { error: "Vui lòng chọn lý do thôi việc" }),
  note: z.string().trim().optional(),
});

type OffboardFormValues = z.infer<typeof offboardSchema>;

const REASON_OPTIONS = [
  { value: "Nhân viên xin thôi việc", label: "Nhân viên xin thôi việc" },
  { value: "Hết hạn hợp đồng lao động", label: "Hết hạn hợp đồng lao động" },
  { value: "Thỏa thuận chấm dứt hợp đồng", label: "Thỏa thuận chấm dứt hợp đồng" },
  { value: "Kỷ luật / Cho thôi việc", label: "Kỷ luật / Cho thôi việc" },
  { value: "Khác", label: "Lý do khác" },
];

interface EmployeeOffboardingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee: EmployeeRow | null;
  onSuccess?: () => void;
}

export function EmployeeOffboardingDialog({
  open,
  onOpenChange,
  employee,
  onSuccess,
}: EmployeeOffboardingDialogProps) {
  const copy = messages.hr.client.offboarding;

  if (!employee) return null;

  const today = getVNDateString();
  const defaultValues: OffboardFormValues = {
    resignationDate: today,
    reason: REASON_OPTIONS[0]?.value ?? "Nhân viên xin thôi việc",
    note: "",
  };

  async function handleSubmit(values: OffboardFormValues) {
    if (!employee) return { success: false, error: "Nhân viên không tồn tại" };
    return offboardEmployee({
      employeeId: employee.id,
      resignationDate: values.resignationDate,
      reason: values.reason,
      note: values.note || undefined,
    });
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      schema={offboardSchema}
      defaultValues={defaultValues}
      entityKey={`offboard-${employee.id}`}
      title={copy.title}
      description={copy.description}
      submitLabel={copy.confirm}
      submitVariant="destructive"
      successMessage={copy.success}
      contentClassName="sm:max-w-lg"
      onSubmit={handleSubmit}
      onSuccess={() => {
        onOpenChange(false);
        onSuccess?.();
      }}
    >
      {(form) => (
        <div className="flex flex-col gap-4">
          <NoteCallout tone="warning">
            <div className="flex flex-col gap-1 text-xs">
              <p className="font-semibold">
                Nhân sự: {employee.profiles?.full_name ?? "—"} ({employee.employee_code ?? `#${employee.id}`})
              </p>
              <ul className="list-disc pl-4 flex flex-col gap-1 text-muted-foreground">
                <li>Tài khoản đăng nhập sẽ bị khóa ngay lập tức.</li>
                <li>Hủy các ca làm việc được phân trong tương lai.</li>
                <li>Chấm dứt hợp đồng lao động đang hoạt động.</li>
                <li>Lịch sử chấm công và bảng lương cũ được bảo toàn.</li>
              </ul>
            </div>
          </NoteCallout>

          <BusinessDateField
            control={form.control}
            name="resignationDate"
            label={copy.resignationDate}
          />

          <SelectField
            control={form.control}
            name="reason"
            label={copy.reason}
            options={REASON_OPTIONS}
          />

          <TextField
            control={form.control}
            name="note"
            label={copy.note}
            placeholder="Ghi chú thêm về lý do hoặc bàn giao tài sản..."
          />
        </div>
      )}
    </FormDialog>
  );
}
