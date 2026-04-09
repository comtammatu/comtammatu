"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowRight, Plus, Search } from "lucide-react";
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
import { cn } from "@comtammatu/ui";
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
  po_id: number | null;
  suppliers: { id: number; name: string } | null;
  purchase_orders: { po_number: string } | null;
}

const STATUS_META: Record<string, { label: string; className: string }> = {
  draft: {
    label: "Nháp",
    className: "bg-muted text-muted-foreground",
  },
  confirmed: {
    label: "Đã nhập kho",
    className: "bg-success/10 text-success border-success/30",
  },
  cancelled: {
    label: "Đã hủy",
    className: "bg-destructive/10 text-destructive border-destructive/30",
  },
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
  const [search, setSearch] = useState("");
  const [isPending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.grn_number.toLowerCase().includes(q) ||
        (r.suppliers?.name ?? "").toLowerCase().includes(q),
    );
  }, [rows, search]);

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
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Phiếu nhập kho (GRN)
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Nhập hàng từ NCC chỉ ghi nhận tại Trụ sở. Xác nhận phiếu cập nhật
            tồn kho và giá vốn bình quân (WAC).
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
        <div className="rounded-lg border border-warning/40 bg-warning/5 px-4 py-3 text-sm text-warning">
          Cần có nhà cung cấp trước.{" "}
          <Link
            href="/admin/inventory/suppliers"
            className="font-medium underline hover:opacity-80"
          >
            Thêm NCC →
          </Link>
        </div>
      )}

      {/* Table card */}
      <div className="rounded-lg border shadow-sm overflow-hidden">
        {/* Search bar */}
        <div className="flex items-center gap-3 border-b bg-muted/20 px-4 py-3">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <Input
            placeholder="Tìm số phiếu hoặc nhà cung cấp…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0"
          />
          <span className="shrink-0 text-xs text-muted-foreground">
            {filtered.length} / {rows.length}
          </span>
        </div>

        <Table>
          <TableHeader>
            <TableRow className="bg-muted/20 hover:bg-muted/20">
              <TableHead className="text-xs font-semibold uppercase tracking-wider">
                Số phiếu
              </TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider">
                Nhà cung cấp
              </TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider">
                Trạng thái
              </TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider">
                Ngày nhận
              </TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableEmptyStateRow
                colSpan={6}
                paddingClassName="py-16"
                title={
                  search ? "Không tìm thấy phiếu nào" : "Chưa có phiếu nhập kho"
                }
                description={
                  search
                    ? "Thử từ khóa khác"
                    : 'Nhấn "Tạo GRN" để ghi nhận hàng nhập'
                }
              />
            )}
            {filtered.map((r) => {
              const meta = STATUS_META[r.status] ?? {
                label: r.status,
                className: "bg-muted text-muted-foreground",
              };
              return (
                <TableRow
                  key={r.id}
                  className="group hover:bg-muted/30 transition-colors"
                >
                  <TableCell className="font-mono text-sm font-medium">
                    {r.grn_number}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {r.suppliers?.name ?? "—"}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell font-mono text-xs text-muted-foreground">
                    {r.purchase_orders?.po_number ? (
                      <Link
                        href={`/admin/inventory/purchase-orders/${r.po_id}`}
                        className="hover:text-foreground hover:underline"
                      >
                        {r.purchase_orders.po_number}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge className={cn("text-xs", meta.className)}>
                      {meta.label}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground tabular-nums">
                    {new Date(r.received_date).toLocaleDateString("vi-VN", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                    })}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 opacity-0 group-hover:opacity-100 transition-opacity"
                      asChild
                    >
                      <Link href={`/admin/inventory/grn/${r.id}`}>
                        <ArrowRight className="size-4" />
                        <span className="sr-only">Chi tiết</span>
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Create dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tạo phiếu nhập (nháp)</DialogTitle>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
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
              <Input id="notes" name="notes" placeholder="Lô hàng tháng 4…" />
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
