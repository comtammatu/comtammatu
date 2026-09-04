"use client";

import { useState } from "react";
import { z } from "zod";
import { Button } from "@comtammatu/ui/components/button";
import { AlertTriangle as IconAlertTriangle } from "lucide-react";
import { FormDialog, SelectField, TextField, TextareaField } from "@/components/form";
import { operator } from "@lib/messages/operator";
import { createBranchIncidentAction } from "../_lib/incident-actions";

const branchIncidentFormSchema = z.object({
  category: z.enum(["it", "kitchen", "facility", "service"]),
  title: z.string().trim().min(3, "Tiêu đề tối thiểu 3 ký tự").max(200),
  description: z.string().trim().max(2000).optional(),
  priority: z.enum(["high", "urgent"]).default("urgent"),
});

type BranchIncidentFormValues = z.infer<typeof branchIncidentFormSchema>;

interface BranchIncidentDialogProps {
  branchId: number;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: React.ReactNode;
}

const CATEGORY_OPTIONS = [
  { value: "it", label: "POS / Máy in / Mạng" },
  { value: "kitchen", label: "Bếp / Tủ mát / Kho" },
  { value: "facility", label: "Điện nước / Cơ sở" },
  { value: "service", label: "Dịch vụ / Khách hàng" },
];

const PRIORITY_OPTIONS = [
  { value: "urgent", label: "Khẩn cấp (Xử lý ngay)" },
  { value: "high", label: "Ưu tiên cao (Trong ca)" },
];

export function BranchIncidentDialog({
  branchId,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: BranchIncidentDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const onOpenChange = isControlled
    ? (controlledOnOpenChange ?? (() => {}))
    : setInternalOpen;

  return (
    <>
      {!isControlled ? (
        <Button
          type="button"
          variant="outline"
          size="icon-touch"
          className="text-destructive"
          aria-label={operator.incident.triggerAria}
          onClick={() => onOpenChange?.(true)}
        >
          <IconAlertTriangle />
        </Button>
      ) : null}

      <FormDialog<BranchIncidentFormValues>
        open={open}
        onOpenChange={onOpenChange}
        title={operator.incident.title}
        description={operator.incident.description}
        schema={branchIncidentFormSchema}
        defaultValues={{
          category: "it",
          title: "",
          description: "",
          priority: "urgent",
        }}
        submitLabel={operator.incident.submitLabel}
        submitVariant="destructive"
        successMessage={operator.incident.successMessage}
        onSubmit={async (values) => {
          return await createBranchIncidentAction({
            ...values,
            branchId,
          });
        }}
      >
        {(form) => (
          <>
            <SelectField
              control={form.control}
              name="category"
              label={operator.incident.categoryLabel}
              options={CATEGORY_OPTIONS}
            />
            <TextField
              control={form.control}
              name="title"
              label={operator.incident.titleLabel}
              placeholder={operator.incident.titlePlaceholder}
            />
            <TextareaField
              control={form.control}
              name="description"
              label={operator.incident.descLabel}
              placeholder={operator.incident.descPlaceholder}
            />
            <SelectField
              control={form.control}
              name="priority"
              label={operator.incident.priorityLabel}
              options={PRIORITY_OPTIONS}
            />
          </>
        )}
      </FormDialog>
    </>
  );
}
