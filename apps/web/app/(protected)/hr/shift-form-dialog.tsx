"use client";

/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: existing HR shift form keeps operational copy inline */

import { useMemo } from "react";
import { z } from "zod";
import { FormDialog, TextField } from "@/components/form";
import { createShift, updateShift } from "./actions";
import type { ShiftRow } from "./_types";

const shiftSchema = z.object({
  name: z.string().trim().min(1, { error: "Tên ca không được trống" }),
  start_time: z.string().min(1, { error: "Giờ bắt đầu không được trống" }),
  end_time: z.string().min(1, { error: "Giờ kết thúc không được trống" }),
});

type ShiftFormValues = z.infer<typeof shiftSchema>;

interface ShiftFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shift: ShiftRow | null;
  onShiftSaved: (shift: ShiftRow) => void;
}

export function ShiftFormDialog({
  open,
  onOpenChange,
  shift,
  onShiftSaved,
}: ShiftFormDialogProps) {
  const defaultValues = useMemo<ShiftFormValues>(
    () => ({
      name: shift?.name ?? "",
      start_time: shift?.start_time?.slice(0, 5) ?? "",
      end_time: shift?.end_time?.slice(0, 5) ?? "",
    }),
    [shift],
  );

  async function handleSubmit(values: ShiftFormValues) {
    const payload = {
      name: values.name,
      startTime: values.start_time,
      endTime: values.end_time,
    };
    const result = shift
      ? await updateShift({
          ...payload,
          shiftId: shift.id,
          isActive: shift.is_active,
        })
      : await createShift(payload);
    if (!result.success) return result;
    const saved = result.data as ShiftRow | null;
    onShiftSaved({
      id: saved?.id ?? shift?.id ?? 0,
      name: saved?.name ?? values.name,
      start_time: saved?.start_time ?? values.start_time,
      end_time: saved?.end_time ?? values.end_time,
      is_active: saved?.is_active ?? shift?.is_active ?? true,
      is_opening: saved?.is_opening ?? shift?.is_opening ?? false,
      is_closing: saved?.is_closing ?? shift?.is_closing ?? false,
    });
    return result;
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={shift ? "Sửa ca làm việc" : "Thêm ca làm việc"}
      schema={shiftSchema}
      defaultValues={defaultValues}
      entityKey={shift?.id ?? "new"}
      onSubmit={handleSubmit}
      successMessage={
        shift ? "Đã cập nhật ca làm việc" : "Đã tạo ca làm việc mới"
      }
      submitLabel={shift ? "Lưu ca" : "Tạo ca"}
      contentClassName="sm:max-w-md"
    >
      {(form) => (
        <>
          <TextField
            control={form.control}
            name="name"
            label="Tên ca"
            placeholder="Ca sáng, Ca chiều, Ca tối..."
            required
          />

          <div className="grid grid-cols-2 gap-3">
            <TextField
              control={form.control}
              name="start_time"
              label="Giờ bắt đầu"
              type="time"
              placeholder="06:00"
              required
            />
            <TextField
              control={form.control}
              name="end_time"
              label="Giờ kết thúc"
              type="time"
              placeholder="21:00"
              required
            />
          </div>
        </>
      )}
    </FormDialog>
  );
}
