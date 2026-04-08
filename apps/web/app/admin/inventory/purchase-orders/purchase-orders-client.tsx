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
import {
  createPurchaseOrder,
  fetchPurchaseOrders,
} from "../procurement-actions";
import type { SupplierRow } from "../suppliers/suppliers-client";

export interface PurchaseOrderRow {
  id: number;
  po_number: string;
  status: string;
  ordered_at: string;
  notes: string | null;
  supplier_id: number;
  branch_id: number;
  suppliers: { id: number; name: string } | null;
}

const STATUS_LABEL: Record<string, string> = {
  draft: "Nháp",
  sent: "Đã gửi",
  partially_received: "Nhận một phần",
  received: "Đã nhận đủ",
  cancelled: "Đã hủy",
};

export function PurchaseOrdersClient({
  initial,
  suppliers,
}: {
  initial: PurchaseOrderRow[];
  suppliers: SupplierRow[];
}) {
  const [rows, setRows] = useState(initial);
  const [open, setOpen] = useState(false);
  const [supplierId, setSupplierId] = useState<string>("");
  const [isPending, startTransition] = useTransition();

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const sid = supplierId ? Number(supplierId) : Number(fd.get("supplierId"));
    if (!sid || Number.isNaN(sid)) {
      toast.error("Chọn nhà cung cấp");
      return;
    }
    startTransition(async () => {
      const res = await createPurchaseOrder({
        supplierId: sid,
        notes: String(fd.get("notes") ?? "") || undefined,
      });
      if (!res.success || !res.data) {
        toast.error(res.error ?? "Không tạo được PO");
        return;
      }
      toast.success("Đã tạo đơn đặt hàng");
      setOpen(false);
      setSupplierId("");
      const again = await fetchPurchaseOrders();
      if (again.success) setRows((again.data ?? []) as PurchaseOrderRow[]);
    });
  }

  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Đơn đặt hàng (PO)
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            PO chỉ tạo cho kho Trụ sở. Dùng khi cần tham chiếu trước khi lập
            GRN.
          </p>
        </div>
        <Button
          type="button"
          onClick={() => setOpen(true)}
          disabled={suppliers.length === 0}
        >
          <Plus className="mr-2 size-4" />
          Tạo PO
        </Button>
      </div>

      {suppliers.length === 0 && (
        <p className="text-sm text-amber-700 dark:text-amber-400">
          Chưa có NCC —{" "}
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
              <TableHead className="text-xs uppercase tracking-wider font-semibold">Số PO</TableHead>
              <TableHead className="text-xs uppercase tracking-wider font-semibold">NCC</TableHead>
              <TableHead className="text-xs uppercase tracking-wider font-semibold">Trạng thái</TableHead>
              <TableHead className="hidden sm:table-cell text-xs uppercase tracking-wider font-semibold">Ngày</TableHead>
              <TableHead className="w-28" />
            </TableRow>
          </TableHeader>
          <TableBody className="divide-y divide-border/60">
            {rows.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="py-16 text-center"
                >
                  <p className="text-sm font-medium text-muted-foreground">Chưa có đơn đặt hàng</p>
                  <p className="mt-1 text-xs text-muted-foreground/70">Nhấn &quot;Tạo PO&quot; để tạo đơn đặt hàng đầu tiên</p>
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => (
              <TableRow key={r.id} className="hover:bg-muted/40 transition-colors">
                <TableCell className="font-mono text-sm">
                  {r.po_number}
                </TableCell>
                <TableCell>{r.suppliers?.name ?? "—"}</TableCell>
                <TableCell>
                  <Badge className={
                    r.status === "received" ? "bg-success/10 text-success border-success/20" :
                    r.status === "partially_received" ? "bg-warning/10 text-warning border-warning/20" :
                    r.status === "cancelled" ? "bg-destructive/10 text-destructive border-destructive/20" :
                    r.status === "sent" ? "bg-info/10 text-info border-info/20" :
                    "bg-muted text-muted-foreground"
                  }>
                    {STATUS_LABEL[r.status] ?? r.status}
                  </Badge>
                </TableCell>
                <TableCell className="hidden sm:table-cell text-muted-foreground text-sm">
                  {new Date(r.ordered_at).toLocaleString("vi-VN")}
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={`/admin/inventory/purchase-orders/${r.id}`}>
                      Chi tiết
                    </Link>
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
            <DialogTitle>Tạo đơn đặt hàng</DialogTitle>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-3">
            <div className="space-y-1.5">
              <Label>Nhà cung cấp *</Label>
              <Select value={supplierId} onValueChange={setSupplierId} required>
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
              <input type="hidden" name="supplierId" value={supplierId} />
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
                {isPending ? "Đang tạo…" : "Tạo PO"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
