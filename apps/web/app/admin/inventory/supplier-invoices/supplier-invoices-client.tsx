"use client";

import { useMemo, useState, useTransition } from "react";
import { RefreshCw, Plus, Search } from "lucide-react";
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
import {
  createSupplierInvoice,
  fetchSupplierInvoices,
  recomputeInvoiceMatching,
} from "../procurement-actions";
import type { SupplierRow } from "../suppliers/suppliers-client";
import type { GrnListRow } from "../grn/grn-list-client";
import { TableEmptyStateRow } from "../../components/table-empty-state-row";

export interface SupplierInvoiceRow {
  id: number;
  invoice_number: string;
  invoice_date: string;
  total_amount: number;
  subtotal: number;
  vat_amount?: number;
  vat_rate?: number;
  matching_status: string;
  supplier_id: number;
  grn_id: number | null;
  suppliers: { id: number; name: string } | null;
  goods_received_notes: { id: number; grn_number: string } | null;
}

const MATCH_META: Record<string, { label: string; className: string }> = {
  pending: {
    label: "Chờ khớp",
    className: "bg-warning/10 text-warning border-warning/30",
  },
  matched: {
    label: "Khớp",
    className: "bg-success/10 text-success border-success/30",
  },
  discrepancy: {
    label: "Lệch",
    className: "bg-destructive/10 text-destructive border-destructive/30",
  },
  approved: {
    label: "Đã duyệt",
    className: "bg-success/10 text-success border-success/30",
  },
};

export function SupplierInvoicesClient({
  initial,
  suppliers,
  grns,
}: {
  initial: SupplierInvoiceRow[];
  suppliers: SupplierRow[];
  grns: GrnListRow[];
}) {
  const [rows, setRows] = useState(initial);
  const [open, setOpen] = useState(false);
  const [supplierId, setSupplierId] = useState("");
  const [grnId, setGrnId] = useState("");
  const [search, setSearch] = useState("");
  const [isPending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.invoice_number.toLowerCase().includes(q) ||
        (r.suppliers?.name ?? "").toLowerCase().includes(q) ||
        (r.goods_received_notes?.grn_number ?? "").toLowerCase().includes(q),
    );
  }, [rows, search]);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const sid = Number(supplierId || fd.get("supplierId"));
    if (!sid) {
      toast.error("Chọn NCC");
      return;
    }
    const g = grnId && grnId !== "_none" ? Number(grnId) : null;
    const subtotal = Number(fd.get("subtotal"));
    const vatRate = Number(fd.get("vatRate"));
    const vatAmount = Number(fd.get("vatAmount"));
    const totalAmount = Number(fd.get("totalAmount"));
    const invDate = String(fd.get("invoiceDate"));
    if (
      !invDate ||
      !Number.isFinite(subtotal) ||
      !Number.isFinite(totalAmount)
    ) {
      toast.error("Kiểm tra ngày và số tiền");
      return;
    }
    startTransition(async () => {
      const res = await createSupplierInvoice({
        supplierId: sid,
        grnId: g && !Number.isNaN(g) ? g : null,
        poId: null,
        invoiceNumber: String(fd.get("invoiceNumber") ?? "").trim(),
        invoiceDate: new Date(invDate).toISOString(),
        subtotal,
        vatRate: Number.isFinite(vatRate) ? vatRate : 8,
        vatAmount: Number.isFinite(vatAmount) ? vatAmount : 0,
        totalAmount,
        matchingNotes: String(fd.get("matchingNotes") ?? "") || undefined,
      });
      if (!res.success) {
        toast.error(res.error ?? "Không tạo được");
        return;
      }
      toast.success("Đã tạo hóa đơn — tính khớp sau");
      setOpen(false);
      setSupplierId("");
      setGrnId("");
      const again = await fetchSupplierInvoices();
      if (again.success) setRows((again.data ?? []) as SupplierInvoiceRow[]);
    });
  }

  function recompute(id: number) {
    startTransition(async () => {
      const res = await recomputeInvoiceMatching(id);
      if (!res.success) {
        toast.error(res.error ?? "Không tính được");
        return;
      }
      toast.success("Đã cập nhật trạng thái khớp");
      const again = await fetchSupplierInvoices();
      if (again.success) setRows((again.data ?? []) as SupplierInvoiceRow[]);
    });
  }

  const grnsForSupplier = grns.filter(
    (g) => !supplierId || String(g.supplier_id) === supplierId,
  );

  return (
    <>
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Hóa đơn nhà cung cấp
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            3-way matching với PO/GRN tại Trụ sở. Tiêu chuẩn HĐĐT và thuế GTGT
            8%.
          </p>
        </div>
        <Button type="button" onClick={() => setOpen(true)}>
          <Plus className="mr-2 size-4" />
          Thêm hóa đơn
        </Button>
      </div>

      {/* Table card */}
      <div className="rounded-lg border shadow-sm overflow-hidden">
        {/* Search bar */}
        <div className="flex items-center gap-3 border-b bg-muted/20 px-4 py-3">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <Input
            placeholder="Tìm số HĐ, NCC hoặc GRN…"
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
                Số HĐ
              </TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider">
                Nhà cung cấp
              </TableHead>
              <TableHead className="hidden sm:table-cell text-xs font-semibold uppercase tracking-wider">
                GRN
              </TableHead>
              <TableHead className="hidden md:table-cell text-xs font-semibold uppercase tracking-wider">
                Ngày HĐ
              </TableHead>
              <TableHead className="hidden lg:table-cell text-right text-xs font-semibold uppercase tracking-wider">
                Tiền hàng
              </TableHead>
              <TableHead className="hidden lg:table-cell text-right text-xs font-semibold uppercase tracking-wider">
                VAT
              </TableHead>
              <TableHead className="text-right text-xs font-semibold uppercase tracking-wider">
                Tổng TT
              </TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider">
                Khớp
              </TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableEmptyStateRow
                colSpan={9}
                paddingClassName="py-16"
                title={
                  search ? "Không tìm thấy hóa đơn nào" : "Chưa có hóa đơn"
                }
                description={
                  search
                    ? "Thử từ khóa khác"
                    : 'Nhấn "Thêm hóa đơn" để thêm hóa đơn nhà cung cấp'
                }
              />
            )}
            {filtered.map((r) => {
              const meta = MATCH_META[r.matching_status] ?? {
                label: r.matching_status,
                className: "bg-muted text-muted-foreground",
              };
              return (
                <TableRow
                  key={r.id}
                  className="group hover:bg-muted/30 transition-colors"
                >
                  <TableCell className="font-mono text-sm font-medium">
                    {r.invoice_number || "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {r.suppliers?.name ?? "—"}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell font-mono text-xs text-muted-foreground">
                    {r.goods_received_notes?.grn_number ?? (
                      <span className="text-muted-foreground/50">—</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-sm text-muted-foreground tabular-nums">
                    {new Date(r.invoice_date).toLocaleDateString("vi-VN", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                    })}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-right font-mono text-sm tabular-nums text-muted-foreground">
                    {r.subtotal.toLocaleString("vi-VN")} ₫
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-right font-mono text-sm tabular-nums text-muted-foreground">
                    {r.vat_amount != null
                      ? `${r.vat_amount.toLocaleString("vi-VN")} ₫`
                      : "—"}
                    {r.vat_rate != null && (
                      <span className="ml-1 text-xs text-muted-foreground/60">
                        ({r.vat_rate}%)
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm font-semibold tabular-nums">
                    {r.total_amount.toLocaleString("vi-VN")} ₫
                  </TableCell>
                  <TableCell>
                    <Badge className={cn("text-xs", meta.className)}>
                      {meta.label}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => recompute(r.id)}
                      disabled={isPending}
                      title="Tính lại khớp"
                    >
                      <RefreshCw className="size-3.5" />
                      <span className="sr-only">Tính lại</span>
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
        <DialogContent className="max-w-lg max-h-[min(90vh,700px)] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Thêm hóa đơn NCC</DialogTitle>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Nhà cung cấp *</Label>
              <Select
                value={supplierId}
                onValueChange={(v) => {
                  setSupplierId(v);
                  setGrnId("");
                }}
                required
              >
                <SelectTrigger>
                  <SelectValue placeholder="Chọn" />
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
              <Label>Tham chiếu GRN (tuỳ chọn)</Label>
              <Select value={grnId} onValueChange={setGrnId}>
                <SelectTrigger>
                  <SelectValue placeholder="Không chọn" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">— Không —</SelectItem>
                  {grnsForSupplier.map((g) => (
                    <SelectItem key={g.id} value={String(g.id)}>
                      {g.grn_number}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="invoiceNumber">Số hóa đơn *</Label>
                <Input id="invoiceNumber" name="invoiceNumber" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="invoiceDate">Ngày HĐ *</Label>
                <Input
                  id="invoiceDate"
                  name="invoiceDate"
                  type="date"
                  required
                />
              </div>
            </div>

            <div className="rounded-md border bg-muted/20 p-3 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Giá trị hóa đơn
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="subtotal">Tiền hàng (trước VAT) *</Label>
                  <Input
                    id="subtotal"
                    name="subtotal"
                    type="number"
                    step="any"
                    min="0"
                    placeholder="0"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="vatRate">Thuế suất VAT (%)</Label>
                  <Input
                    id="vatRate"
                    name="vatRate"
                    type="number"
                    step="any"
                    min="0"
                    defaultValue={8}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="vatAmount">Tiền VAT</Label>
                  <Input
                    id="vatAmount"
                    name="vatAmount"
                    type="number"
                    step="any"
                    min="0"
                    defaultValue={0}
                    placeholder="0"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="totalAmount">Tổng thanh toán *</Label>
                  <Input
                    id="totalAmount"
                    name="totalAmount"
                    type="number"
                    step="any"
                    min="0"
                    placeholder="0"
                    required
                  />
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="matchingNotes">Ghi chú khớp</Label>
              <Input id="matchingNotes" name="matchingNotes" />
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
                {isPending ? "Đang lưu…" : "Lưu hóa đơn"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
