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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { createStaff, updateStaff } from "./actions";
import type { StaffRow, BranchOption } from "./staff-table";
import { toast } from "@comtammatu/ui/components/sonner";
import { ROLE_LABELS } from "./role-labels";

interface StaffFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  staff?: StaffRow | null;
  branches: BranchOption[];
}

export function StaffFormDialog({
  open,
  onOpenChange,
  staff,
  branches,
}: StaffFormDialogProps) {
  const isEdit = !!staff;
  const action = isEdit ? updateStaff : createStaff;
  const [state, formAction, isPending] = useActionState(action, null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.success) {
      onOpenChange(false);
      toast.success(
        isEdit ? "Đã cập nhật nhân viên" : "Đã tạo nhân viên mới",
      );
    }
  }, [state, isEdit, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Chỉnh sửa nhân viên" : "Thêm nhân viên mới"}
          </DialogTitle>
        </DialogHeader>

        <form ref={formRef} action={formAction} className="space-y-4">
          {isEdit && <input type="hidden" name="id" value={staff.id} />}

          {!isEdit && (
            <>
              <div className="space-y-2">
                <Label htmlFor="email">Email *</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  required
                  placeholder="nhanvien@comtammatu.com"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Mật khẩu *</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  required
                  minLength={8}
                  placeholder="Tối thiểu 8 ký tự"
                />
              </div>
            </>
          )}

          <div className="space-y-2">
            <Label htmlFor="full_name">Họ tên *</Label>
            <Input
              id="full_name"
              name="full_name"
              required
              defaultValue={staff?.full_name ?? ""}
              placeholder="Nguyễn Văn A"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Số điện thoại</Label>
            <Input
              id="phone"
              name="phone"
              type="tel"
              defaultValue={staff?.phone ?? ""}
              placeholder="0901 234 567"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="role">Vai trò *</Label>
            <Select name="role" defaultValue={staff?.role ?? "waiter"} required>
              <SelectTrigger>
                <SelectValue placeholder="Chọn vai trò" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(ROLE_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="branch_id">Chi nhánh</Label>
            <Select
              name="branch_id"
              defaultValue={staff?.branch_id?.toString() ?? ""}
            >
              <SelectTrigger>
                <SelectValue placeholder="Không thuộc chi nhánh" />
              </SelectTrigger>
              <SelectContent>
                {branches.map((b) => (
                  <SelectItem key={b.id} value={b.id.toString()}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Bắt buộc cho vai trò vận hành (thu ngân, phục vụ, bếp, QL chi
              nhánh)
            </p>
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
