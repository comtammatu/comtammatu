"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Badge } from "@comtammatu/ui/components/badge";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
import { toast } from "@comtammatu/ui/components/sonner";
import { createGrnDraft, fetchGrns } from "../procurement-actions";
import type { SupplierRow } from "../suppliers/suppliers-client";
import type { PurchaseOrderRow } from "../purchase-orders/purchase-orders-client";
import { TableEmptyStateRow } from "../../components/table-empty-state-row";

export interface GrnListRow {
  id: number;
  grn_number: string;
  status: string;
  received_date: string;
  notes: string | null;
  supplier_id: number;
  branch_id: number;
  suppliers: { id: number; name: string } | null;
}

const STATUS_LABEL: Record<string, string> = {
  draft: "Nháp",
  confirmed: "Đã nhập kho",
  cancelled: "Đã hủy",
};

export function GrnListClient({
  initial,
  suppliers,
  purchaseOrders,
}: {
  initial: GrnListRow[];
  suppliers: SupplierRow[];
  purchaseOrders: PurchaseOrderRow[];
}) {
  const [rows, setRows] = useState(initial);
  const [open, setOpen] = useState(false);
  const [supplierId, setSupplierId] = useState("");
  const [poId, setPoId] = useState<string>("");
  const [isPending, startTransition] = useTransition();

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const sid = Number(supplierId || fd.get("supplierId"));
    if (!sid) {
      toast.error("Chọn nhà cung cấp");
      return;
    }
    const po = poId && poId !== "_none" ? Number(poId) : null;
    startTransition(async () => {
      const res = await createGrnDraft({
        supplierId: sid,
        poId: po && !Number.isNaN(po) ? po : null,
        notes: String(fd.get("notes") ?? "") || undefined,
      });
      if (!res.success || !res.data) {
        toast.error(res.error ?? "Không tạo được phiếu nhập");
        return;
      }
      toast.success("Đã tạo phiếu nhập");
      setOpen(false);
      setSupplierId("");
      setPoId("");
      const again = await fetchGrns();
      if (again.success) setRows((again.data ?? []) as GrnListRow[]);
    });
  }

  const posForSupplier = purchaseOrders.filter(
    (p) => !supplierId || String(p.supplier_id) === supplierId,
  );

  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Phiếu nhập kho (GRN)
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Nhập hàng từ NCC chỉ ghi nhận tại Trụ sở. Xác nhận phiếu sẽ cập nhật
            tồn và giá vốn bình quân (WAC).
          </p>
        </div>
        <Button
          type="button"
          onClick={() => setOpen(true)}
          disabled={suppliers.length === 0}
        >
          <Plus className="mr-2 size-4" />
          Tạo GRN
        </Button>
      </div>

      {suppliers.length === 0 && (
        <p className="text-warning text-sm">
          Cần có NCC —{" "}
          <Link href="/admin/inventory/suppliers" className="underline">
            thêm nhà cung cấp
          </Link>
          .
        </p>
      )}

      <div className="rounded-md border shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="text-xs uppercase tracking-wider font-semibold">
                Số phiếu
              </TableHead>
              <TableHead className="text-xs uppercase tracking-wider font-semibold">
                NCC
              </TableHead>
              <TableHead className="text-xs uppercase tracking-wider font-semibold">
                Trạng thái
              </TableHead>
              <TableHead className="hidden sm:table-cell text-xs uppercase tracking-wider font-semibold">
                Ngày
              </TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody className="divide-y divide-border/60">
            {rows.length === 0 && (
              <TableEmptyStateRow
                colSpan={5}
                paddingClassName="py-16"
                title="Chưa có phiếu nhập kho"
                description='Nhấn "Tạo GRN" để ghi nhận hàng nhập'
              />
            )}
            {rows.map((r) => (
              <TableRow
                key={r.id}
                className="hover:bg-muted/40 transition-colors"
              >
                <TableCell className="font-mono text-sm">
                  {r.grn_number}
                </TableCell>
                <TableCell>{r.suppliers?.name ?? "—"}</TableCell>
                <TableCell>
                  <Badge
                    className={
                      r.status === "confirmed"
                        ? "bg-success/10 text-success border-success/20"
                        : r.status === "cancelled"
                          ? "bg-destructive/10 text-destructive border-destructive/20"
                          : "bg-muted text-muted-foreground"
                    }
                  >
                    {STATUS_LABEL[r.status] ?? r.status}
                  </Badge>
                </TableCell>
                <TableCell className="hidden sm:table-cell text-muted-foreground text-sm">
                  {new Date(r.received_date).toLocaleString("vi-VN")}
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={`/admin/inventory/grn/${r.id}`}>Chi tiết</Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tạo phiếu nhập (nháp)</DialogTitle>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-3">
            <div className="space-y-1.5">
              <Label>Nhà cung cấp *</Label>
              <Select
                value={supplierId}
                onValueChange={(v) => {
                  setSupplierId(v);
                  setPoId("");
                }}
                required
              >
                <SelectTrigger>
                  <SelectValue placeholder="Chọn NCC" />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Tham chiếu PO (tuỳ chọn)</Label>
              <Select value={poId} onValueChange={setPoId}>
                <SelectTrigger>
                  <SelectValue placeholder="Không chọn" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">— Không —</SelectItem>
                  {posForSupplier.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.po_number}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
              <Button type="submit" disabled={isPending || !supplierId}>
                {isPending ? "Đang tạo…" : "Tạo GRN"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
