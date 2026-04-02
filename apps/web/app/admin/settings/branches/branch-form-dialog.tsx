"use client";

import { useActionState, useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { Input } from "@comtammatu/ui/components/input";
import { Label } from "@comtammatu/ui/components/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@comtammatu/ui/components/dialog";
import { createBranch, updateBranch } from "./actions";
import type { BranchRow } from "./branch-table";
import { toast } from "@comtammatu/ui/components/sonner";

interface BranchFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branch?: BranchRow | null;
}

export function BranchFormDialog({
  open,
  onOpenChange,
  branch,
}: BranchFormDialogProps) {
  const isEdit = !!branch;
  const action = isEdit ? updateBranch : createBranch;
  const [state, formAction, isPending] = useActionState(action, null);
  const formRef = useRef<HTMLFormElement>(null);

  // Close dialog on success
  useEffect(() => {
    if (state?.success) {
      onOpenChange(false);
      toast.success(isEdit ? "Đã cập nhật chi nhánh" : "Đã tạo chi nhánh mới");
    }
  }, [state, isEdit, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Chỉnh sửa chi nhánh" : "Thêm chi nhánh mới"}
          </DialogTitle>
        </DialogHeader>

        <form ref={formRef} action={formAction} className="space-y-4">
          {isEdit && <input type="hidden" name="id" value={branch.id} />}

          <div className="space-y-2">
            <Label htmlFor="name">Tên chi nhánh *</Label>
            <Input
              id="name"
              name="name"
              required
              defaultValue={branch?.name ?? ""}
              placeholder="VD: Chi nhánh Quận 1"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="address">Địa chỉ</Label>
            <Input
              id="address"
              name="address"
              defaultValue={branch?.address ?? ""}
              placeholder="VD: 123 Nguyễn Huệ, Quận 1"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Điện thoại</Label>
            <Input
              id="phone"
              name="phone"
              type="tel"
              defaultValue={branch?.phone ?? ""}
              placeholder="VD: 028 1234 5678"
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
