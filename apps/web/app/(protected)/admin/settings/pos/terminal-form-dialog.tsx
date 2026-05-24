"use client";

import { z } from "zod";
import { Controller } from "react-hook-form";
import {
  Field,
  FieldLabel,
} from "@comtammatu/ui/components/field";
import { Switch } from "@comtammatu/ui/components/switch";
import { FormDialog, TextField, valuesToFormData } from "@/components/form";
import { createTerminal, updateTerminal } from "./actions";
import type { TerminalRow } from "./terminals-client";

import { ACTIONS_VI } from "@comtammatu/shared/messages";
const terminalSchema = z.object({
  name: z.string().trim().min(1, { error: "Tên máy không được trống" }),
  device_id: z.string().trim().optional(),
  is_active: z.boolean().optional(),
});

type TerminalFormValues = z.infer<typeof terminalSchema>;

function toFormValues(
  terminal: TerminalRow | null,
): TerminalFormValues {
  return {
    name: terminal?.name ?? "",
    device_id: terminal?.device_id ?? "",
    is_active: terminal?.is_active ?? true,
  };
}

interface TerminalFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branchId: number;
  terminal: TerminalRow | null;
}

export function TerminalFormDialog({
  open,
  onOpenChange,
  branchId,
  terminal,
}: TerminalFormDialogProps) {
  const isEdit = !!terminal;

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      schema={terminalSchema}
      defaultValues={toFormValues(terminal)}
      entityKey={terminal?.id ?? "new"}
      title={isEdit ? "Chỉnh sửa máy POS" : "Thêm máy POS mới"}
      successMessage={isEdit ? "Đã cập nhật máy POS" : "Đã tạo máy POS"}
      submitLabel={isEdit ? ACTIONS_VI.update : ACTIONS_VI.create}
      onSubmit={async (values) => {
        const payload: Record<string, unknown> = {
          name: values.name,
          device_id: values.device_id,
        };
        if (isEdit) {
          payload.is_active = values.is_active ?? true;
        }
        const fd = valuesToFormData(payload);
        fd.set("branch_id", String(branchId));
        if (isEdit && terminal) {
          fd.set("id", String(terminal.id));
          return updateTerminal(null, fd);
        }
        return createTerminal(null, fd);
      }}
    >
      {(form) => (
        <>
          <TextField
            control={form.control}
            name="name"
            label="Tên máy"
            placeholder="VD: Quầy 1, Quầy chính"
            required
          />
          <TextField
            control={form.control}
            name="device_id"
            label="Mã thiết bị (tuỳ chọn)"
            placeholder="VD: tablet-thungan-01"
          />
          {isEdit && (
            <Controller
              control={form.control}
              name="is_active"
              render={({ field }) => (
                <Field orientation="horizontal">
                  <Switch
                    id="terminal-active"
                    checked={field.value ?? true}
                    onCheckedChange={field.onChange}
                  />
                  <FieldLabel htmlFor="terminal-active">Hoạt động</FieldLabel>
                </Field>
              )}
            />
          )}
        </>
      )}
    </FormDialog>
  );
}
