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
import { useIsMobile } from "@comtammatu/ui/hooks/use-mobile";
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

const STATUS_KEYS = ["draft", "confirmed", "cancelled"] as const;

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
  const [statusFilter, setStatusFilter] = useState("_all");
  const [supplierFilter, setSupplierFilter] = useState("_all");
  const [isPending, startTransition] = useTransition();
  const isMobile = useIsMobile();

  // Status counts
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of rows) {
      counts[r.status] = (counts[r.status] ?? 0) + 1;
    }
    return counts;
  }, [rows]);

  const filtered = useMemo(() => {
    let result = rows;
    if (statusFilter !== "_all") {
      result = result.filter((r) => r.status === statusFilter);
    }
    if (supplierFilter !== "_all") {
      result = result.filter((r) => String(r.supplier_id) === supplierFilter);
    }
    const q = search.trim().toLowerCase();
    if (q) {
      result = result.filter(
        (r) =>
          r.grn_number.toLowerCase().includes(q) ||
          (r.suppliers?.name ?? "").toLowerCase().includes(q),
      );
    }
    return result;
  }, [rows, search, statusFilter, supplierFilter]);

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

  const hasActiveFilters = statusFilter !== "_all" || supplierFilter !== "_all";

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
          {/* Status count badges */}
          {rows.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {STATUS_KEYS.map((key) => {
                const count = statusCounts[key];
                if (!count) return null;
                const meta = STATUS_META[key];
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() =>
                      setStatusFilter((prev) => (prev === key ? "_all" : key))
                    }
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium transition-colors",
                      statusFilter === key
                        ? meta?.className
                        : "bg-muted/50 text-muted-foreground hover:bg-muted",
                    )}
                  >
                    {count} {meta?.label ?? key}
                  </button>
                );
              })}
            </div>
          )}
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
        {/* Search + filter bar */}
        <div className="flex flex-wrap items-center gap-3 border-b bg-muted/20 px-4 py-3">
          <div className="flex flex-1 items-center gap-3 min-w-0">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <Input
              placeholder="Tìm số phiếu hoặc nhà cung cấp…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0"
            />
          </div>
          <div className="flex items-center gap-2">
            <Select value={supplierFilter} onValueChange={setSupplierFilter}>
              <SelectTrigger className="h-8 w-36 text-xs">
                <SelectValue placeholder="NCC" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">Tất cả NCC</SelectItem>
                {suppliers.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="shrink-0 text-xs text-muted-foreground">
              {filtered.length} / {rows.length}
            </span>
          </div>
        </div>

        {/* Mobile: card layout */}
        {isMobile ? (
          <div className="divide-y">
            {filtered.length === 0 && (
              <div className="py-16 text-center">
                <p className="text-sm font-medium text-muted-foreground">
                  {search || hasActiveFilters
                    ? "Không tìm thấy phiếu nào"
                    : "Chưa có phiếu nhập kho"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground/70">
                  {search || hasActiveFilters
                    ? "Thử bộ lọc khác"
                    : 'Nhấn "Tạo GRN" để ghi nhận hàng nhập'}
                </p>
              </div>
            )}
            {filtered.map((r) => {
              const meta = STATUS_META[r.status] ?? {
                label: r.status,
                className: "bg-muted text-muted-foreground",
              };
              return (
                <Link
                  key={r.id}
                  href={`/admin/inventory/grn/${r.id}`}
                  className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/30 transition-colors"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-medium">
                        {r.grn_number}
                      </span>
                      <Badge className={cn("text-xs", meta.className)}>
                        {meta.label}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {r.suppliers?.name ?? "—"}
                      {r.purchase_orders?.po_number && (
                        <> · PO: {r.purchase_orders.po_number}</>
                      )}
                      {" · "}
                      {new Date(r.received_date).toLocaleDateString("vi-VN", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                      })}
                    </p>
                  </div>
                  <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
                </Link>
              );
            })}
          </div>
        ) : (
          /* Desktop: table layout */
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
                  PO liên kết
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
                    search || hasActiveFilters
                      ? "Không tìm thấy phiếu nào"
                      : "Chưa có phiếu nhập kho"
                  }
                  description={
                    search || hasActiveFilters
                      ? "Thử bộ lọc khác"
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
                    <TableCell className="font-mono text-xs text-muted-foreground">
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
                        className="size-8"
                        asChild
                        aria-label="Chi tiết"
                      >
                        <Link href={`/admin/inventory/grn/${r.id}`}>
                          <ArrowRight className="size-4" />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
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
