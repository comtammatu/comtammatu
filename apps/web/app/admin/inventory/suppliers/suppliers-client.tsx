"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
import { toast } from "@comtammatu/ui/components/sonner";
import {
  createSupplier,
  deleteSupplier,
  fetchSuppliers,
  updateSupplier,
} from "../procurement-actions";
import { TableEmptyStateRow } from "../../components/table-empty-state-row";

export interface SupplierRow {
  id: number;
  name: string;
  tax_code: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  is_active: boolean;
}

type DialogMode = "create" | "edit";

export function SuppliersClient({ initial }: { initial: SupplierRow[] }) {
  const [rows, setRows] = useState(initial);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<DialogMode>("create");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingRow, setEditingRow] = useState<SupplierRow | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();

  async function reload() {
    const again = await fetchSuppliers();
    if (again.success) setRows((again.data ?? []) as SupplierRow[]);
  }

  function openCreate() {
    setMode("create");
    setEditingId(null);
    setEditingRow(null);
    setOpen(true);
  }

  function openEdit(row: SupplierRow) {
    setMode("edit");
    setEditingId(row.id);
    setEditingRow(row);
    setOpen(true);
  }

  function handleSubmit(fd: FormData) {
    const name = String(fd.get("name") ?? "").trim();
    if (!name) {
      toast.error("Nhập tên NCC");
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
      if (mode === "edit" && editingId != null) {
        const res = await updateSupplier(editingId, payload);
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
      setOpen(false);
      await reload();
    });
  }

  function handleDelete(id: number) {
    startTransition(async () => {
      const res = await deleteSupplier(id);
      if (!res.success) {
        toast.error(res.error ?? "Không xóa được");
        setDeleteConfirmId(null);
        return;
      }
      toast.success("Đã xóa nhà cung cấp");
      setDeleteConfirmId(null);
      await reload();
    });
  }

  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Nhà cung cấp</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Chỉ dùng cho nhập hàng tại{" "}
            <Link href="/admin/settings/branches" className="underline">
              Trụ sở
            </Link>
            . Chi nhánh không đặt NCC trực tiếp.
          </p>
        </div>
        <Button type="button" onClick={openCreate}>
          <Plus className="mr-2 size-4" />
          Thêm NCC
        </Button>
      </div>

      <div className="rounded-md border shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="text-xs uppercase tracking-wider font-semibold">
                Tên
              </TableHead>
              <TableHead className="hidden sm:table-cell text-xs uppercase tracking-wider font-semibold">
                Mã số thuế
              </TableHead>
              <TableHead className="hidden md:table-cell text-xs uppercase tracking-wider font-semibold">
                Điện thoại
              </TableHead>
              <TableHead className="w-24 text-right text-xs uppercase tracking-wider font-semibold">
                Thao tác
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="divide-y divide-border/60">
            {rows.length === 0 && (
              <TableEmptyStateRow
                colSpan={4}
                paddingClassName="py-16"
                title="Chưa có nhà cung cấp"
                description='Nhấn "Thêm NCC" để thêm nhà cung cấp đầu tiên'
              />
            )}
            {rows.map((s) => (
              <TableRow
                key={s.id}
                className="hover:bg-muted/40 transition-colors"
              >
                <TableCell className="font-medium">{s.name}</TableCell>
                <TableCell className="hidden sm:table-cell text-muted-foreground">
                  {s.tax_code ?? "—"}
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  {s.phone ?? "—"}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      onClick={() => openEdit(s)}
                    >
                      <Pencil className="size-4" />
                      <span className="sr-only">Sửa</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-destructive hover:text-destructive"
                      onClick={() => setDeleteConfirmId(s.id)}
                    >
                      <Trash2 className="size-4" />
                      <span className="sr-only">Xóa</span>
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Create / Edit Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {mode === "edit" ? "Sửa nhà cung cấp" : "Thêm nhà cung cấp"}
            </DialogTitle>
            <DialogDescription>
              {mode === "edit"
                ? "Cập nhật thông tin nhà cung cấp."
                : "Nhập thông tin nhà cung cấp mới."}
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              handleSubmit(new FormData(e.currentTarget));
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="name">Tên *</Label>
              <Input
                id="name"
                name="name"
                required
                autoFocus
                defaultValue={editingRow?.name ?? ""}
                key={editingId ?? "new"}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tax_code">Mã số thuế</Label>
              <Input
                id="tax_code"
                name="tax_code"
                defaultValue={editingRow?.tax_code ?? ""}
                key={`tax-${editingId ?? "new"}`}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">Điện thoại</Label>
              <Input
                id="phone"
                name="phone"
                defaultValue={editingRow?.phone ?? ""}
                key={`phone-${editingId ?? "new"}`}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="address">Địa chỉ</Label>
              <Input
                id="address"
                name="address"
                defaultValue={editingRow?.address ?? ""}
                key={`addr-${editingId ?? "new"}`}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="notes">Ghi chú</Label>
              <Input
                id="notes"
                name="notes"
                defaultValue={editingRow?.notes ?? ""}
                key={`notes-${editingId ?? "new"}`}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                Hủy
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Đang lưu…" : mode === "edit" ? "Cập nhật" : "Lưu"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteConfirmId != null}
        onOpenChange={(o) => {
          if (!o) setDeleteConfirmId(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Xác nhận xóa</DialogTitle>
            <DialogDescription>
              Bạn chắc chắn muốn xóa nhà cung cấp &ldquo;
              {rows.find((r) => r.id === deleteConfirmId)?.name}
              &rdquo;? Không thể hoàn tác.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteConfirmId(null)}
            >
              Hủy
            </Button>
            <Button
              variant="destructive"
              disabled={isPending}
              onClick={() => {
                if (deleteConfirmId != null) handleDelete(deleteConfirmId);
              }}
            >
              {isPending ? "Đang xóa…" : "Xóa"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
