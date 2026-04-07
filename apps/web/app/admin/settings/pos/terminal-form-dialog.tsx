"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { Input } from "@comtammatu/ui/components/input";
import { Label } from "@comtammatu/ui/components/label";
import { Switch } from "@comtammatu/ui/components/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@comtammatu/ui/components/dialog";
import { toast } from "@comtammatu/ui/components/sonner";
import { createTerminal, updateTerminal } from "./actions";
import type { TerminalRow } from "./terminals-client";

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
  const action = isEdit ? updateTerminal : createTerminal;
  const [state, formAction, isPending] = useActionState(action, null);
  const formRef = useRef<HTMLFormElement>(null);
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (open) {
      setIsActive(terminal?.is_active ?? true);
    }
  }, [open, terminal]);

  useEffect(() => {
    if (state?.success) {
      toast.success(isEdit ? "Đã cập nhật máy POS" : "Đã tạo máy POS");
      onOpenChange(false);
    }
  }, [state, isEdit, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Chỉnh sửa máy POS" : "Thêm máy POS mới"}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {isEdit
              ? "Chỉnh sửa thông tin máy POS"
              : "Nhập thông tin máy POS mới"}
          </DialogDescription>
        </DialogHeader>

        <form ref={formRef} action={formAction} className="space-y-4">
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
