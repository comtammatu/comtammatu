"use client";

import { useState, useEffect } from "react";
import { Input } from "@comtammatu/ui/components/input";
import { Label } from "@comtammatu/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { createBranch, updateBranch } from "./actions";
import type { BranchRow } from "./branch-table";
import { CrudDialog } from "../../../components/crud-dialog";

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
  const isHeadquarters = branch?.is_headquarters === true;
  const [branchKind, setBranchKind] = useState(
    branch?.branch_kind === "central_kitchen"
      ? "central_kitchen"
      : branch?.branch_kind === "warehouse"
        ? "warehouse"
        : "branch",
  );

  useEffect(() => {
    setBranchKind(
      branch?.branch_kind === "central_kitchen"
        ? "central_kitchen"
        : branch?.branch_kind === "warehouse"
          ? "warehouse"
          : "branch",
    );
  }, [branch]);

  return (
    <CrudDialog
      open={open}
      onOpenChange={onOpenChange}
      action={isEdit ? updateBranch : createBranch}
      entityKey={branch?.id ?? "new"}
      title={
        isEdit ? "Chỉnh sửa điểm vận hành" : "Thêm điểm vận hành mới"
      }
      successMessage={
        isEdit ? "Đã cập nhật điểm vận hành" : "Đã tạo điểm vận hành mới"
      }
      submitLabel={isEdit ? "Cập nhật" : "Tạo mới"}
    >
      {isEdit && <input type="hidden" name="id" value={branch.id} />}
      <input type="hidden" name="branchKind" value={branchKind} />

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
    </CrudDialog>
  );
}
