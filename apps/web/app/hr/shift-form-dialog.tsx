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
import { SelectField, TextField } from "@/components/form";
import { createShift } from "./actions";
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
  onShiftCreated: (shift: ShiftRow) => void;
}

export function ShiftFormDialog({
  open,
  onOpenChange,
  branches,
  defaultBranchId,
  onShiftCreated,
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
        name: "",
        branch_id: defaultBranchId?.toString() ?? "",
        start_time: "",
        end_time: "",
      });
      setServerError(null);
    }
  }, [open, defaultBranchId, form]);

  const branchOptions = branches.map((b) => ({
    value: b.id.toString(),
    label: b.name,
  }));

  function onValid(values: ShiftFormValues) {
    startTransition(async () => {
      setServerError(null);
      const result = await createShift({
        branchId: Number(values.branch_id),
        name: values.name,
        startTime: values.start_time,
        endTime: values.end_time,
      });
      if (!result.success) {
        setServerError(result.error ?? "Đã xảy ra lỗi");
        return;
      }
      toast.success("Đã tạo ca làm việc mới");
      const created = result.data as { id: number } | null;
      onShiftCreated({
        id: created?.id ?? 0,
        name: values.name,
        start_time: values.start_time,
        end_time: values.end_time,
        is_active: true,
      });
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Thêm ca làm việc</DialogTitle>
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
              placeholder="Chọn chi nhánh"
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
              Hủy
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Spinner className="mr-2" />}
              Tạo ca
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
