"use client";

import { useActionState, useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { Input } from "@comtammatu/ui/components/input";
import { Label } from "@comtammatu/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@comtammatu/ui/components/dialog";
import { createTable, updateTable } from "./actions";
import type { ZoneRow } from "./zone-table";
import type { TableRow } from "./table-table";
import { toast } from "@comtammatu/ui/components/sonner";

const STATUS_OPTIONS = [
  { value: "available", label: "Trống" },
  { value: "occupied", label: "Đang dùng" },
  { value: "reserved", label: "Đã đặt" },
  { value: "maintenance", label: "Bảo trì" },
] as const;

interface TableFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branchId: number;
  zones: ZoneRow[];
  table?: TableRow | null;
}

export function TableFormDialog({
  open,
  onOpenChange,
  branchId,
  zones,
  table,
}: TableFormDialogProps) {
  const isEdit = !!table;
  const action = isEdit ? updateTable : createTable;
  const [state, formAction, isPending] = useActionState(action, null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.success) {
      onOpenChange(false);
      toast.success(isEdit ? "Đã cập nhật bàn" : "Đã tạo bàn mới");
    }
  }, [state, isEdit, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Chỉnh sửa bàn" : "Thêm bàn mới"}</DialogTitle>
        </DialogHeader>

        <form ref={formRef} action={formAction} className="space-y-4">
          {isEdit && <input type="hidden" name="id" value={table.id} />}
          <input type="hidden" name="branch_id" value={branchId} />

          <div className="space-y-2">
            <Label htmlFor="table-number">Số bàn *</Label>
            <Input
              id="table-number"
              name="number"
              type="number"
              min={1}
              required
              defaultValue={table?.number ?? ""}
              placeholder="VD: 1, 2, 3..."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="table-capacity">Sức chứa (người)</Label>
            <Input
              id="table-capacity"
              name="capacity"
              type="number"
              min={1}
              defaultValue={table?.capacity ?? 4}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="table-zone">Khu vực</Label>
            <Select
              name="zone_id"
              defaultValue={table?.zone_id?.toString() ?? ""}
            >
              <SelectTrigger id="table-zone">
                <SelectValue placeholder="Không có khu vực" />
              </SelectTrigger>
              <SelectContent>
                {zones.map((z) => (
                  <SelectItem key={z.id} value={z.id.toString()}>
                    {z.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isEdit && (
            <div className="space-y-2">
              <Label htmlFor="table-status">Trạng thái</Label>
              <Select name="status" defaultValue={table.status}>
                <SelectTrigger id="table-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {state?.error && (
            <p className="text-sm text-destructive" role="alert">
              {state.error}
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
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
              {isEdit ? "Cập nhật" : "Tạo mới"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
