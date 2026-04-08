"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import {
  Dialog,
  DialogContent,
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
import { createSupplier, fetchSuppliers } from "../procurement-actions";

export interface SupplierRow {
  id: number;
  name: string;
  tax_code: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  is_active: boolean;
}

export function SuppliersClient({ initial }: { initial: SupplierRow[] }) {
  const [rows, setRows] = useState(initial);
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleCreate(fd: FormData) {
    const name = String(fd.get("name") ?? "").trim();
    if (!name) {
      toast.error("Nhập tên NCC");
      return;
    }
    startTransition(async () => {
      const res = await createSupplier({
        name,
        tax_code: String(fd.get("tax_code") ?? "") || undefined,
        phone: String(fd.get("phone") ?? "") || undefined,
        address: String(fd.get("address") ?? "") || undefined,
        notes: String(fd.get("notes") ?? "") || undefined,
      });
      if (!res.success) {
        toast.error(res.error ?? "Không tạo được");
        return;
      }
      toast.success("Đã tạo nhà cung cấp");
      setOpen(false);
      const again = await fetchSuppliers();
      if (again.success) setRows((again.data ?? []) as SupplierRow[]);
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
        <Button type="button" onClick={() => setOpen(true)}>
          <Plus className="mr-2 size-4" />
          Thêm NCC
        </Button>
      </div>

      <div className="rounded-md border shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="text-xs uppercase tracking-wider font-semibold">Tên</TableHead>
              <TableHead className="hidden sm:table-cell text-xs uppercase tracking-wider font-semibold">Mã số thuế</TableHead>
              <TableHead className="hidden md:table-cell text-xs uppercase tracking-wider font-semibold">Điện thoại</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="divide-y divide-border/60">
            {rows.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={3}
                  className="py-16 text-center"
                >
                  <p className="text-sm font-medium text-muted-foreground">Chưa có nhà cung cấp</p>
                  <p className="mt-1 text-xs text-muted-foreground/70">Nhấn &quot;Thêm NCC&quot; để thêm nhà cung cấp đầu tiên</p>
                </TableCell>
              </TableRow>
            )}
            {rows.map((s) => (
              <TableRow key={s.id} className="hover:bg-muted/40 transition-colors">
                <TableCell className="font-medium">{s.name}</TableCell>
                <TableCell className="hidden sm:table-cell text-muted-foreground">
                  {s.tax_code ?? "—"}
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  {s.phone ?? "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Thêm nhà cung cấp</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              handleCreate(new FormData(e.currentTarget));
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="name">Tên *</Label>
              <Input id="name" name="name" required autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tax_code">Mã số thuế</Label>
              <Input id="tax_code" name="tax_code" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">Điện thoại</Label>
              <Input id="phone" name="phone" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="address">Địa chỉ</Label>
              <Input id="address" name="address" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="notes">Ghi chú</Label>
              <Input id="notes" name="notes" />
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
                {isPending ? "Đang lưu…" : "Lưu"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
