"use client";

import { useActionState, useEffect, useRef, useState } from "react";
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
import { createBranch, updateBranch } from "./actions";
import type { BranchRow } from "./branch-table";
import { toast } from "@comtammatu/ui/components/sonner";

interface BranchFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branch?: BranchRow | null;
  branchKindSchemaAvailable: boolean;
}

export function BranchFormDialog({
  open,
  onOpenChange,
  branch,
  branchKindSchemaAvailable,
}: BranchFormDialogProps) {
  const isEdit = !!branch;
  const action = isEdit ? updateBranch : createBranch;
  const [state, formAction, isPending] = useActionState(action, null);
  const formRef = useRef<HTMLFormElement>(null);
  const isHeadquarters = branch?.is_headquarters === true;
  const [branchKind, setBranchKind] = useState(
    branch?.branch_kind === "central_kitchen" ? "central_kitchen" : "branch",
  );

  useEffect(() => {
    setBranchKind(
      branch?.branch_kind === "central_kitchen" ? "central_kitchen" : "branch",
    );
  }, [branch]);

  // Close dialog on success
  useEffect(() => {
    if (state?.success) {
      onOpenChange(false);
      toast.success(
        isEdit ? "Đã cập nhật điểm vận hành" : "Đã tạo điểm vận hành mới",
      );
    }
  }, [state, isEdit, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Chỉnh sửa điểm vận hành" : "Thêm điểm vận hành mới"}
          </DialogTitle>
        </DialogHeader>

        <form ref={formRef} action={formAction} className="space-y-4">
          {isEdit && <input type="hidden" name="id" value={branch.id} />}
          <input
            type="hidden"
            name="branchKind"
            value={isHeadquarters ? "headquarters" : branchKind}
          />

          <div className="space-y-2">
            <Label htmlFor="name">Tên điểm vận hành *</Label>
            <Input
              id="name"
              name="name"
              required
              defaultValue={branch?.name ?? ""}
              placeholder="VD: Chi nhánh Quận 1 hoặc Bếp trung tâm"
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

          <div className="space-y-2">
            <Label htmlFor="branchKind">Loại điểm vận hành</Label>
            {isHeadquarters ? (
              <p className="text-sm text-muted-foreground">
                Trụ sở được gán bằng nút &quot;Đặt làm trụ sở chính&quot;.
              </p>
            ) : !branchKindSchemaAvailable ? (
              <p className="text-sm text-muted-foreground">
                Database hiện tại chưa có cột <code>branch_kind</code>, nên chi
                nhánh sẽ được lưu theo schema cũ. Hãy áp dụng migration để bật
                phân loại <em>bếp trung tâm</em>.
              </p>
            ) : (
              <Select value={branchKind} onValueChange={setBranchKind}>
                <SelectTrigger id="branchKind">
                  <SelectValue placeholder="Chọn loại" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="branch">Chi nhánh</SelectItem>
                  <SelectItem value="central_kitchen">Bếp trung tâm</SelectItem>
                </SelectContent>
              </Select>
            )}
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
