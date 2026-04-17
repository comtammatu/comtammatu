"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@comtammatu/ui/components/button";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { Input } from "@comtammatu/ui/components/input";
import { Label } from "@comtammatu/ui/components/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@comtammatu/ui/components/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { toast } from "@comtammatu/ui/components/sonner";
import { createShift } from "./actions";
import type { BranchOption, ShiftRow } from "./page";

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
  const [error, setError] = useState<string | null>(null);
  const [branchId, setBranchId] = useState<string>(
    defaultBranchId?.toString() ?? "",
  );

  useEffect(() => {
    if (!open) {
      return;
    }

    setError(null);
    setBranchId(defaultBranchId?.toString() ?? "");
  }, [open, defaultBranchId]);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = fd.get("name") as string;
    const startTime = fd.get("startTime") as string;
    const endTime = fd.get("endTime") as string;

    startTransition(async () => {
      setError(null);
      const result = await createShift({
        branchId: Number(branchId),
        name,
        startTime,
        endTime,
      });
      if (!result.success) {
        setError(result.error ?? "Đã xảy ra lỗi");
        return;
      }
      toast.success("Đã tạo ca làm việc mới");
      const created = result.data as { id: number } | null;
      onShiftCreated({
        id: created?.id ?? 0,
        name,
        start_time: startTime,
        end_time: endTime,
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

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="shift-name">Tên ca *</Label>
            <Input
              id="shift-name"
              name="name"
              required
              placeholder="Ca sáng, Ca chiều, Ca tối..."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="shift-branch">Chi nhánh *</Label>
            <Select value={branchId} onValueChange={setBranchId} required>
              <SelectTrigger id="shift-branch">
                <SelectValue placeholder="Chọn chi nhánh" />
              </SelectTrigger>
              <SelectContent>
                {branches.map((b) => (
                  <SelectItem key={b.id} value={b.id.toString()}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="shift-start">Giờ bắt đầu *</Label>
              <Input
                id="shift-start"
                name="startTime"
                type="time"
                required
                placeholder="06:00"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="shift-end">Giờ kết thúc *</Label>
              <Input
                id="shift-end"
                name="endTime"
                type="time"
                required
                placeholder="14:00"
              />
            </div>
          </div>

          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Hủy
            </Button>
            <Button type="submit" disabled={isPending || !branchId}>
              {isPending && <Spinner className="mr-2" />}
              Tạo ca
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
