"use client";

import { useMemo, useState, useTransition } from "react";
import { AlertTriangle, Banknote, RefreshCw, Plus, Search } from "lucide-react";
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
import {
  createSupplierInvoice,
  fetchSupplierInvoices,
  recomputeInvoiceMatching,
} from "../procurement-actions";
import { markInvoicePaid } from "../procurement-actions";
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
  payment_status: string;
  due_date: string | null;
  paid_amount?: number;
  paid_at?: string | null;
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

const PAYMENT_META: Record<string, { label: string; className: string }> = {
  paid: {
    label: "Đã TT",
    className: "bg-success/10 text-success border-success/30",
  },
  partial: {
    label: "TT một phần",
    className: "bg-warning/10 text-warning border-warning/30",
  },
  unpaid: {
    label: "Chưa TT",
    className: "bg-destructive/10 text-destructive border-destructive/30",
  },
};

function isOverdue(row: SupplierInvoiceRow): boolean {
  if (!row.due_date || row.payment_status === "paid") return false;
  return new Date(row.due_date) < new Date();
}

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
  const [paymentFilter, setPaymentFilter] = useState("_all");
  const [matchFilter, setMatchFilter] = useState("_all");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [isPending, startTransition] = useTransition();
  const isMobile = useIsMobile();

  const overdueCount = useMemo(() => rows.filter(isOverdue).length, [rows]);

  const filtered = useMemo(() => {
    let result = rows;
    if (paymentFilter !== "_all") {
      result = result.filter((r) => r.payment_status === paymentFilter);
    }
    if (matchFilter !== "_all") {
      result = result.filter((r) => r.matching_status === matchFilter);
    }
    if (overdueOnly) {
      result = result.filter(isOverdue);
    }
    const q = search.trim().toLowerCase();
    if (q) {
      result = result.filter(
        (r) =>
          r.invoice_number.toLowerCase().includes(q) ||
          (r.suppliers?.name ?? "").toLowerCase().includes(q) ||
          (r.goods_received_notes?.grn_number ?? "").toLowerCase().includes(q),
      );
    }
    return result;
  }, [rows, search, paymentFilter, matchFilter, overdueOnly]);

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

  function payInvoice(row: SupplierInvoiceRow) {
    startTransition(async () => {
      const res = await markInvoicePaid({
        invoiceId: row.id,
        amount: row.total_amount,
      });
      if (!res.success) {
        toast.error(res.error ?? "Không thanh toán được");
        return;
      }
      toast.success("Đã ghi nhận thanh toán");
      const again = await fetchSupplierInvoices();
      if (again.success) setRows((again.data ?? []) as SupplierInvoiceRow[]);
    });
  }

  const grnsForSupplier = grns.filter(
    (g) => !supplierId || String(g.supplier_id) === supplierId,
  );

  const hasActiveFilters =
    paymentFilter !== "_all" || matchFilter !== "_all" || overdueOnly;

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
        {/* Search + filters bar */}
        <div className="flex flex-wrap items-center gap-3 border-b bg-muted/20 px-4 py-3">
          <div className="flex flex-1 items-center gap-3 min-w-0">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <Input
              placeholder="Tìm số HĐ, NCC hoặc GRN…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={paymentFilter} onValueChange={setPaymentFilter}>
              <SelectTrigger className="h-8 w-28 text-xs">
                <SelectValue placeholder="Thanh toán" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">Tất cả TT</SelectItem>
                <SelectItem value="unpaid">Chưa TT</SelectItem>
                <SelectItem value="partial">TT một phần</SelectItem>
                <SelectItem value="paid">Đã TT</SelectItem>
              </SelectContent>
            </Select>
            <Select value={matchFilter} onValueChange={setMatchFilter}>
              <SelectTrigger className="h-8 w-28 text-xs">
                <SelectValue placeholder="Khớp" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">Tất cả</SelectItem>
                <SelectItem value="pending">Chờ khớp</SelectItem>
                <SelectItem value="matched">Khớp</SelectItem>
                <SelectItem value="discrepancy">Lệch</SelectItem>
                <SelectItem value="approved">Đã duyệt</SelectItem>
              </SelectContent>
            </Select>
            {overdueCount > 0 && (
              <button
                type="button"
                onClick={() => setOverdueOnly(!overdueOnly)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium transition-colors",
                  overdueOnly
                    ? "bg-destructive/10 text-destructive border-destructive/30"
                    : "bg-muted/50 text-muted-foreground hover:bg-muted",
                )}
              >
                <AlertTriangle className="size-3" />
                {overdueCount} quá hạn
              </button>
            )}
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
                    ? "Không tìm thấy hóa đơn nào"
                    : "Chưa có hóa đơn"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground/70">
                  {search || hasActiveFilters
                    ? "Thử bộ lọc khác"
                    : 'Nhấn "Thêm hóa đơn" để thêm hóa đơn nhà cung cấp'}
                </p>
              </div>
            )}
            {filtered.map((r) => {
              const meta = MATCH_META[r.matching_status] ?? {
                label: r.matching_status,
                className: "bg-muted text-muted-foreground",
              };
              const pmeta = PAYMENT_META[r.payment_status] ?? {
                label: r.payment_status ?? "—",
                className: "bg-muted text-muted-foreground",
              };
              const overdue = isOverdue(r);
              return (
                <div key={r.id} className="px-4 py-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-sm font-medium">
                          {r.invoice_number || "—"}
                        </span>
                        <Badge className={cn("text-xs", meta.className)}>
                          {meta.label}
                        </Badge>
                        <Badge className={cn("text-xs", pmeta.className)}>
                          {pmeta.label}
                        </Badge>
                        {overdue && (
                          <Badge className="text-xs bg-destructive/10 text-destructive border-destructive/30">
                            <AlertTriangle className="mr-0.5 size-3" />
                            Quá hạn
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        {r.suppliers?.name ?? "—"} ·{" "}
                        {new Date(r.invoice_date).toLocaleDateString("vi-VN", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                        })}
                      </p>
                    </div>
                    <span className="font-mono text-sm font-semibold tabular-nums shrink-0">
                      {r.total_amount.toLocaleString("vi-VN")} ₫
                    </span>
                  </div>
                  {/* Action buttons always visible */}
                  <div className="flex items-center gap-2">
                    {r.payment_status !== "paid" && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => payInvoice(r)}
                        disabled={isPending}
                      >
                        <Banknote className="mr-1 size-3" />
                        Thanh toán
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => recompute(r.id)}
                      disabled={isPending}
                    >
                      <RefreshCw className="mr-1 size-3" />
                      Tính lại
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Desktop: table — reduced to essential columns */
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/20 hover:bg-muted/20">
                <TableHead className="text-xs font-semibold uppercase tracking-wider">
                  Số HĐ
                </TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider">
                  Nhà cung cấp
                </TableHead>
                <TableHead className="text-right text-xs font-semibold uppercase tracking-wider">
                  Tổng TT
                </TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider">
                  Khớp
                </TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider">
                  Thanh toán
                </TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider">
                  Hạn TT
                </TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableEmptyStateRow
                  colSpan={7}
                  paddingClassName="py-16"
                  title={
                    search || hasActiveFilters
                      ? "Không tìm thấy hóa đơn nào"
                      : "Chưa có hóa đơn"
                  }
                  description={
                    search || hasActiveFilters
                      ? "Thử bộ lọc khác"
                      : 'Nhấn "Thêm hóa đơn" để thêm hóa đơn nhà cung cấp'
                  }
                />
              )}
              {filtered.map((r) => {
                const meta = MATCH_META[r.matching_status] ?? {
                  label: r.matching_status,
                  className: "bg-muted text-muted-foreground",
                };
                const overdue = isOverdue(r);
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
                    <TableCell className="text-right font-mono text-sm font-semibold tabular-nums">
                      {r.total_amount.toLocaleString("vi-VN")} ₫
                    </TableCell>
                    <TableCell>
                      <Badge className={cn("text-xs", meta.className)}>
                        {meta.label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {(() => {
                        const pmeta = PAYMENT_META[r.payment_status] ?? {
                          label: r.payment_status ?? "—",
                          className: "bg-muted text-muted-foreground",
                        };
                        return (
                          <Badge className={cn("text-xs", pmeta.className)}>
                            {pmeta.label}
                          </Badge>
                        );
                      })()}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <span
                          className={cn(
                            "text-sm tabular-nums",
                            overdue
                              ? "text-destructive font-medium"
                              : "text-muted-foreground",
                          )}
                        >
                          {r.due_date
                            ? new Date(r.due_date).toLocaleDateString("vi-VN", {
                                day: "2-digit",
                                month: "2-digit",
                                year: "numeric",
                              })
                            : "—"}
                        </span>
                        {overdue && (
                          <Badge className="text-xs bg-destructive/10 text-destructive border-destructive/30">
                            <AlertTriangle className="mr-0.5 size-3" />
                            Quá hạn
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {r.payment_status !== "paid" && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            onClick={() => payInvoice(r)}
                            disabled={isPending}
                            aria-label="Ghi nhận thanh toán"
                          >
                            <Banknote className="size-3.5" />
                          </Button>
                        )}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          onClick={() => recompute(r.id)}
                          disabled={isPending}
                          aria-label="Tính lại khớp"
                        >
                          <RefreshCw className="size-3.5" />
                        </Button>
                      </div>
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
