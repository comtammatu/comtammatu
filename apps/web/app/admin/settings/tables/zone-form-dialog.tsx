"use client";

import { Input } from "@comtammatu/ui/components/input";
import { Label } from "@comtammatu/ui/components/label";
import { createZone, updateZone } from "./actions";
import type { ZoneRow } from "./zone-table";
import { CrudDialog } from "../../../components/crud-dialog";

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

  return (
    <CrudDialog
      open={open}
      onOpenChange={onOpenChange}
      action={isEdit ? updateZone : createZone}
      entityKey={zone?.id ?? "new"}
      title={isEdit ? "Chỉnh sửa khu vực" : "Thêm khu vực mới"}
      description={
        isEdit ? "Chỉnh sửa thông tin khu vực" : "Nhập thông tin khu vực mới"
      }
      successMessage={isEdit ? "Đã cập nhật khu vực" : "Đã tạo khu vực mới"}
      submitLabel={isEdit ? "Cập nhật" : "Tạo mới"}
    >
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
    </CrudDialog>
  );
}
