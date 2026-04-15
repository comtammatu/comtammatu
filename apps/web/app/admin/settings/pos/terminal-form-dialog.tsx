"use client";

import { useState, useEffect } from "react";
import { Input } from "@comtammatu/ui/components/input";
import { Label } from "@comtammatu/ui/components/label";
import { Switch } from "@comtammatu/ui/components/switch";
import { createTerminal, updateTerminal } from "./actions";
import type { TerminalRow } from "./terminals-client";
import { CrudDialog } from "../../../components/crud-dialog";

interface TerminalFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branchId: number;
  terminal: TerminalRow | null;
}

export function TerminalFormDialog({
  open,
  onOpenChange,
  branchId,
  terminal,
}: TerminalFormDialogProps) {
  const isEdit = !!terminal;
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (open) {
      setIsActive(terminal?.is_active ?? true);
    }
  }, [open, terminal]);

  return (
    <CrudDialog
      open={open}
      onOpenChange={onOpenChange}
      action={isEdit ? updateTerminal : createTerminal}
      entityKey={terminal?.id ?? "new"}
      title={isEdit ? "Chỉnh sửa máy POS" : "Thêm máy POS mới"}
      description={
        isEdit ? "Chỉnh sửa thông tin máy POS" : "Nhập thông tin máy POS mới"
      }
      successMessage={isEdit ? "Đã cập nhật máy POS" : "Đã tạo máy POS"}
      submitLabel={isEdit ? "Cập nhật" : "Tạo mới"}
    >
      {isEdit && <input type="hidden" name="id" value={terminal.id} />}
      <input type="hidden" name="branch_id" value={branchId} />

      <div className="space-y-2">
        <Label htmlFor="terminal-name">Tên máy *</Label>
        <Input
          id="terminal-name"
          name="name"
          required
          defaultValue={terminal?.name ?? ""}
          placeholder="VD: Quầy 1, Quầy chính"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="terminal-device">Mã thiết bị (tuỳ chọn)</Label>
        <Input
          id="terminal-device"
          name="device_id"
          defaultValue={terminal?.device_id ?? ""}
          placeholder="Nhận diện thiết bị / tablet"
        />
      </div>

      {isEdit && (
        <div className="flex items-center gap-3">
          <input
            type="hidden"
            name="is_active"
            value={isActive ? "true" : "false"}
          />
          <Switch
            id="terminal-active"
            checked={isActive}
            onCheckedChange={setIsActive}
          />
          <Label htmlFor="terminal-active">Hoạt động</Label>
        </div>
      )}
    </CrudDialog>
  );
}
