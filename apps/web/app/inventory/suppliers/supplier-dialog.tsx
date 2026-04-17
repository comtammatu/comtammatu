"use client";

import { useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@comtammatu/ui/components/dialog";
import { Input } from "@comtammatu/ui/components/input";
import { Label } from "@comtammatu/ui/components/label";
import { Textarea } from "@comtammatu/ui/components/textarea";
import { Button } from "@comtammatu/ui/components/button";
import { toast } from "@comtammatu/ui/components/sonner";
import { createSupplier, updateSupplier } from "../procurement-actions";

export interface SupplierRow {
  id: number;
  name: string;
  tax_code: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  is_active: boolean;
}

interface SupplierDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplier: SupplierRow | null;
  onSaved: () => void;
}

export function SupplierDialog({
  open,
  onOpenChange,
  supplier,
  onSaved,
}: SupplierDialogProps) {
  const isEdit = supplier !== null;
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = String(fd.get("name") ?? "").trim();
    if (!name) {
      toast.error("Tên nhà cung cấp không được để trống");
      return;
    }
    const payload = {
      name,
      tax_code: String(fd.get("tax_code") ?? "") || undefined,
      phone: String(fd.get("phone") ?? "") || undefined,
      address: String(fd.get("address") ?? "") || undefined,
      notes: String(fd.get("notes") ?? "") || undefined,
    };

    startTransition(async () => {
      if (isEdit) {
        const res = await updateSupplier(supplier.id, payload);
        if (!res.success) {
          toast.error(res.error ?? "Không cập nhật được");
          return;
        }
        toast.success("Đã cập nhật nhà cung cấp");
      } else {
        const res = await createSupplier(payload);
        if (!res.success) {
          toast.error(res.error ?? "Không tạo được");
          return;
        }
        toast.success("Đã tạo nhà cung cấp");
      }
      onOpenChange(false);
      onSaved();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-md"
        key={supplier?.id ?? "new-supplier"}
      >
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Sửa nhà cung cấp" : "Thêm nhà cung cấp"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Cập nhật thông tin nhà cung cấp."
              : "Nhập thông tin nhà cung cấp mới."}
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-3" onSubmit={handleSubmit}>
          <div className="space-y-1.5">
            <Label htmlFor="name">Tên *</Label>
            <Input
              id="name"
              name="name"
              required
              autoFocus
              defaultValue={supplier?.name ?? ""}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tax_code">Mã số thuế</Label>
            <Input
              id="tax_code"
              name="tax_code"
              defaultValue={supplier?.tax_code ?? ""}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="phone">Điện thoại</Label>
            <Input
              id="phone"
              name="phone"
              defaultValue={supplier?.phone ?? ""}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="address">Địa chỉ</Label>
            <Input
              id="address"
              name="address"
              defaultValue={supplier?.address ?? ""}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notes">Ghi chú</Label>
            <Textarea
              id="notes"
              name="notes"
              rows={3}
              defaultValue={supplier?.notes ?? ""}
              className="min-h-24"
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Hủy
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Đang lưu…" : isEdit ? "Cập nhật" : "Lưu"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
