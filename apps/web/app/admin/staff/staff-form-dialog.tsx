"use client";

import { useActionState, useEffect, useRef, useState } from "react";
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
import { createStaff, updateStaff } from "./actions";
import type { StaffRow, BranchOption } from "./staff-table";
import { toast } from "@comtammatu/ui/components/sonner";
import { MANAGEABLE_ROLES, TENANT_LEVEL_ROLES } from "./role-labels";
import { HQ_EXCLUDED_OPERATIONAL_ROLES } from "@comtammatu/shared/auth";
import type { StaffRole } from "@comtammatu/shared/auth";

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
  const [selectedRole, setSelectedRole] = useState(staff?.role ?? "waiter");
  const isTenantLevel = TENANT_LEVEL_ROLES.includes(
    selectedRole as (typeof TENANT_LEVEL_ROLES)[number],
  );

  const branchChoices = (() => {
    // warehouse_manager can only be at warehouse branches
    if (selectedRole === "warehouse_manager") {
      return branches.filter((b) => b.branch_kind === "warehouse");
    }
    // production_manager can only be at central_kitchen branches
    if (selectedRole === "production_manager") {
      return branches.filter((b) => b.branch_kind === "central_kitchen");
    }
    // POS/KDS floor roles cannot be at warehouse/CK branches
    if (HQ_EXCLUDED_OPERATIONAL_ROLES.includes(selectedRole as StaffRole)) {
      return branches.filter((b) => {
        const kind = b.branch_kind;
        return kind !== "warehouse" && kind !== "central_kitchen";
      });
    }
    return branches;
  })();

  useEffect(() => {
    if (state?.success) {
      onOpenChange(false);
      toast.success(isEdit ? "Đã cập nhật nhân viên" : "Đã tạo nhân viên mới");
    }
  }, [state, isEdit, onOpenChange]);

  useEffect(() => {
    if (!open) {
      return;
    }

    setSelectedRole(staff?.role ?? "waiter");
  }, [open, staff]);

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
                <Label htmlFor="email" className="text-sm font-medium">
                  Email *
                </Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  required
                  placeholder="nhanvien@comtammatu.com"
                  className="h-11"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-medium">
                  Mật khẩu *
                </Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  required
                  minLength={8}
                  placeholder="Tối thiểu 8 ký tự"
                  className="h-11"
                />
              </div>
            </>
          )}

          <div className="space-y-2">
            <Label htmlFor="full_name" className="text-sm font-medium">
              Họ tên *
            </Label>
            <Input
              id="full_name"
              name="full_name"
              required
              defaultValue={staff?.full_name ?? ""}
              placeholder="Nguyễn Văn A"
              className="h-11"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone" className="text-sm font-medium">
              Số điện thoại
            </Label>
            <Input
              id="phone"
              name="phone"
              type="tel"
              defaultValue={staff?.phone ?? ""}
              placeholder="0901 234 567"
              className="h-11"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="role" className="text-sm font-medium">
              Vai trò *
            </Label>
            <Select
              name="role"
              value={selectedRole}
              onValueChange={setSelectedRole}
              required
            >
              <SelectTrigger id="role" className="h-11">
                <SelectValue placeholder="Chọn vai trò" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(MANAGEABLE_ROLES).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="branch_id" className="text-sm font-medium">
              Chi nhánh
            </Label>
            <Select
              key={`${selectedRole}-${staff?.id ?? "new"}`}
              name="branch_id"
              defaultValue={staff?.branch_id?.toString() ?? ""}
              disabled={isTenantLevel}
            >
              <SelectTrigger id="branch_id" className="h-11">
                <SelectValue
                  placeholder={
                    isTenantLevel ? "Không áp dụng" : "Chọn chi nhánh"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {branchChoices.map((b) => (
                  <SelectItem key={b.id} value={b.id.toString()}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!isTenantLevel && (
              <p className="text-xs text-muted-foreground">
                Bắt buộc cho vai trò vận hành (thu ngân, phục vụ, bếp, QL chi
                nhánh). Chi nhánh trụ sở (HQ) chỉ dành cho văn phòng — không
                chọn HQ cho các vai trò sàn.
              </p>
            )}
          </div>

          {state?.error && (
            <p className="text-sm text-destructive" role="alert">
              {state.error}
            </p>
          )}

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
              className="h-10"
            >
              Hủy
            </Button>
            <Button type="submit" disabled={isPending} className="h-10">
              {isPending && <Spinner className="mr-2" />}
              {isEdit ? "Cập nhật" : "Tạo mới"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
