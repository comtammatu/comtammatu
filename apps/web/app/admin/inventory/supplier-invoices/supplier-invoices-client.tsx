"use client";

import { useState, useTransition } from "react";
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
  createSupplierInvoice,
  fetchSupplierInvoices,
  recomputeInvoiceMatching,
} from "../procurement-actions";
import type { SupplierRow } from "../suppliers/suppliers-client";
import type { GrnListRow } from "../grn/grn-list-client";

export interface SupplierInvoiceRow {
  id: number;
  invoice_number: string;
  invoice_date: string;
  total_amount: number;
  subtotal: number;
  matching_status: string;
  supplier_id: number;
  grn_id: number | null;
  suppliers: { id: number; name: string } | null;
  goods_received_notes: { id: number; grn_number: string } | null;
}

const MATCH_LABEL: Record<string, string> = {
  pending: "Chờ",
  matched: "Khớp",
  discrepancy: "Lệch",
  approved: "Đã duyệt",
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
  const [isPending, startTransition] = useTransition();

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
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Hóa đơn nhà cung cấp
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            3-way matching với PO/GRN tại Trụ sở. Định dạng HĐĐT và thuế GTGT:
            xem{" "}
            <code className="rounded bg-muted px-1 text-xs">
              docs/ref/einvoice-tax.md
            </code>{" "}
            trong repo.
          </p>
        </div>
        <Button type="button" onClick={() => setOpen(true)}>
          <Plus className="mr-2 size-4" />
          Thêm HĐ
        </Button>
      </div>

      <div className="rounded-md border shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="text-xs uppercase tracking-wider font-semibold">Số HĐ</TableHead>
              <TableHead className="text-xs uppercase tracking-wider font-semibold">NCC</TableHead>
              <TableHead className="hidden sm:table-cell text-xs uppercase tracking-wider font-semibold">GRN</TableHead>
              <TableHead className="text-right text-xs uppercase tracking-wider font-semibold">Tổng</TableHead>
              <TableHead className="text-xs uppercase tracking-wider font-semibold">Khớp</TableHead>
              <TableHead className="w-28" />
            </TableRow>
          </TableHeader>
          <TableBody className="divide-y divide-border/60">
            {rows.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="py-16 text-center"
                >
                  <p className="text-sm font-medium text-muted-foreground">Chưa có hóa đơn</p>
                  <p className="mt-1 text-xs text-muted-foreground/70">Nhấn &quot;Thêm HĐ&quot; để thêm hóa đơn nhà cung cấp</p>
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => (
              <TableRow key={r.id} className="hover:bg-muted/40 transition-colors">
                <TableCell className="font-mono text-sm">
                  {r.invoice_number}
                </TableCell>
                <TableCell>{r.suppliers?.name ?? "—"}</TableCell>
                <TableCell className="hidden sm:table-cell font-mono text-xs">
                  {r.goods_received_notes?.grn_number ?? "—"}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {r.total_amount.toLocaleString("vi-VN")} ₫
                </TableCell>
                <TableCell>
                  <Badge className={
                    r.matching_status === "matched" || r.matching_status === "approved" ? "bg-success/10 text-success border-success/20" :
                    r.matching_status === "discrepancy" ? "bg-destructive/10 text-destructive border-destructive/20" :
                    "bg-warning/10 text-warning border-warning/20"
                  }>
                    {MATCH_LABEL[r.matching_status] ?? r.matching_status}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => recompute(r.id)}
                    disabled={isPending}
                  >
                    Tính lại
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Thêm hóa đơn NCC</DialogTitle>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-3">
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
            <div className="space-y-1.5">
              <Label htmlFor="invoiceNumber">Số hóa đơn *</Label>
              <Input id="invoiceNumber" name="invoiceNumber" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="invoiceDate">Ngày HĐ *</Label>
              <Input id="invoiceDate" name="invoiceDate" type="date" required />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="subtotal">Tiền hàng *</Label>
                <Input
                  id="subtotal"
                  name="subtotal"
                  type="number"
                  step="any"
                  min="0"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="vatRate">VAT %</Label>
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
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="vatAmount">Tiền VAT</Label>
                <Input
                  id="vatAmount"
                  name="vatAmount"
                  type="number"
                  step="any"
                  min="0"
                  defaultValue={0}
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
                  required
                />
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
                {isPending ? "Đang lưu…" : "Lưu"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
