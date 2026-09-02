"use client";

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

const offboardCopy = messages.hr.client.offboarding;

const offboardSchema = z.object({
  resignationDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { error: offboardCopy.invalidDate }),
  reason: z.string().min(1, { error: offboardCopy.reasonRequired }),
  note: z.string().trim().optional(),
});

type OffboardFormValues = z.infer<typeof offboardSchema>;

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
  const copy = offboardCopy;

  if (!employee) return null;

  const today = getVNDateString();
  const defaultValues: OffboardFormValues = {
    resignationDate: today,
    reason: copy.reasons[0]?.value ?? "",
    note: "",
  };

  async function handleSubmit(values: OffboardFormValues) {
    if (!employee) return { success: false, error: copy.employeeMissing };
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
                {copy.staffLine(
                  employee.profiles?.full_name ?? "—",
                  employee.employee_code ?? `#${employee.id}`,
                )}
              </p>
              <ul className="list-disc pl-4 flex flex-col gap-1 text-muted-foreground">
                <li>{copy.lockLoginEffect}</li>
                <li>{copy.cancelShiftsEffect}</li>
                <li>{copy.closeContractEffect}</li>
                <li>{copy.keepHistoryEffect}</li>
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
            options={[...copy.reasons]}
          />

          <TextField
            control={form.control}
            name="note"
            label={copy.note}
            placeholder={copy.notePlaceholder}
          />
        </div>
      )}
    </FormDialog>
  );
}
