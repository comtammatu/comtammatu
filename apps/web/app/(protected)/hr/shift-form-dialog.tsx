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
import { ACTIONS_VI, BRANCH_VI, ERRORS_VI } from "@comtammatu/shared/messages";
import { SelectField, TextField } from "@/components/form";
import { createShift, updateShift } from "./actions";
import type { BranchOption, ShiftRow } from "./page";

const shiftSchema = z.object({
  name: z.string().trim().min(1, { error: "Tên ca không được trống" }),
  branch_id: z.string().min(1, { error: "Vui lòng chọn chi nhánh" }),
  start_time: z.string().min(1, { error: "Giờ bắt đầu không được trống" }),
  end_time: z.string().min(1, { error: "Giờ kết thúc không được trống" }),
});

type ShiftFormValues = z.infer<typeof shiftSchema>;

interface ShiftFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branches: BranchOption[];
  defaultBranchId: number | null;
  shift: ShiftRow | null;
  onShiftSaved: (shift: ShiftRow) => void;
}

export function ShiftFormDialog({
  open,
  onOpenChange,
  branches,
  defaultBranchId,
  shift,
  onShiftSaved,
}: ShiftFormDialogProps) {
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<ShiftFormValues>({
    resolver: zodResolver(shiftSchema),
    defaultValues: {
      name: "",
      branch_id: defaultBranchId?.toString() ?? "",
      start_time: "",
      end_time: "",
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        name: shift?.name ?? "",
        branch_id: defaultBranchId?.toString() ?? "",
        start_time: shift?.start_time?.slice(0, 5) ?? "",
        end_time: shift?.end_time?.slice(0, 5) ?? "",
      });
      setServerError(null);
    }
  }, [open, defaultBranchId, form, shift]);

  const branchOptions = branches.map((b) => ({
    value: b.id.toString(),
    label: b.name,
  }));

  function onValid(values: ShiftFormValues) {
    startTransition(async () => {
      setServerError(null);
      const payload = {
        branchId: Number(values.branch_id),
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
      if (!result.success) {
        setServerError(result.error ?? ERRORS_VI.fallback);
        return;
      }
      toast.success(shift ? "Đã cập nhật ca làm việc" : "Đã tạo ca làm việc mới");
      const saved = result.data as ShiftRow | null;
      onShiftSaved({
        id: saved?.id ?? shift?.id ?? 0,
        name: saved?.name ?? values.name,
        start_time: saved?.start_time ?? values.start_time,
        end_time: saved?.end_time ?? values.end_time,
        is_active: saved?.is_active ?? shift?.is_active ?? true,
      });
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{shift ? "Sửa ca làm việc" : "Thêm ca làm việc"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onValid)} noValidate>
          <FieldGroup>
            <TextField
              control={form.control}
              name="name"
              label="Tên ca"
              placeholder="Ca sáng, Ca chiều, Ca tối..."
              required
            />

            <SelectField
              control={form.control}
              name="branch_id"
              label="Chi nhánh"
              options={branchOptions}
              placeholder={BRANCH_VI.select}
              disabled={Boolean(shift)}
              required
            />

            <div className="grid grid-cols-2 gap-4">
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
                placeholder="14:00"
                required
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
              {shift ? "Lưu ca" : "Tạo ca"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
