"use client";

import { useActionState, useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { Input } from "@comtammatu/ui/components/input";
import { Label } from "@comtammatu/ui/components/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@comtammatu/ui/components/dialog";
import { createZone, updateZone } from "./actions";
import type { ZoneRow } from "./zone-table";
import { toast } from "@comtammatu/ui/components/sonner";

interface ZoneFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branchId: number;
  zone?: ZoneRow | null;
}

export function ZoneFormDialog({
  open,
  onOpenChange,
  branchId,
  zone,
}: ZoneFormDialogProps) {
  const isEdit = !!zone;
  const action = isEdit ? updateZone : createZone;
  const [state, formAction, isPending] = useActionState(action, null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.success) {
      onOpenChange(false);
      toast.success(isEdit ? "Đã cập nhật khu vực" : "Đã tạo khu vực mới");
    }
  }, [state, isEdit, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Chỉnh sửa khu vực" : "Thêm khu vực mới"}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {isEdit
              ? "Chỉnh sửa thông tin khu vực"
              : "Nhập thông tin khu vực mới"}
          </DialogDescription>
        </DialogHeader>

        <form ref={formRef} action={formAction} className="space-y-4">
          {isEdit && <input type="hidden" name="id" value={zone.id} />}
          <input type="hidden" name="branch_id" value={branchId} />

          <div className="space-y-2">
            <Label htmlFor="zone-name">Tên khu vực *</Label>
            <Input
              id="zone-name"
              name="name"
              required
              defaultValue={zone?.name ?? ""}
              placeholder="VD: Tầng 1, Sân vườn, VIP"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="zone-sort-order">Thứ tự hiển thị</Label>
            <Input
              id="zone-sort-order"
              name="sort_order"
              type="number"
              min={0}
              defaultValue={zone?.sort_order ?? 0}
            />
          </div>

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
