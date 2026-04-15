"use client";

import { Input } from "@comtammatu/ui/components/input";
import { Label } from "@comtammatu/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { createTable, updateTable } from "./actions";
import { STATUS_OPTIONS } from "./constants";
import type { ZoneRow } from "./zone-table";
import type { TableRow } from "./table-table";
import { CrudDialog } from "../../../components/v2/crud-dialog";

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

  return (
    <CrudDialog
      open={open}
      onOpenChange={onOpenChange}
      action={isEdit ? updateTable : createTable}
      entityKey={table?.id ?? "new"}
      title={isEdit ? "Chỉnh sửa bàn" : "Thêm bàn mới"}
      description={
        isEdit ? "Chỉnh sửa thông tin bàn" : "Nhập thông tin bàn mới"
      }
      successMessage={isEdit ? "Đã cập nhật bàn" : "Đã tạo bàn mới"}
      submitLabel={isEdit ? "Cập nhật" : "Tạo mới"}
    >
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
          defaultValue={table?.zone_id?.toString() ?? "none"}
        >
          <SelectTrigger id="table-zone">
            <SelectValue placeholder="Không có khu vực" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Không có khu vực</SelectItem>
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
    </CrudDialog>
  );
}
