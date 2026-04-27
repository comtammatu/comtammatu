"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert, AlertDescription } from "@comtammatu/ui/components/alert";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Card, CardContent } from "@comtammatu/ui/components/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@comtammatu/ui/components/dialog";
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
import { CreditCard as IconCreditCard } from "lucide-react";
import { FormattedNumberInput } from "@/components/form";
import { InventoryHeader } from "../_components/inventory-header";
import { InventoryPageContent } from "../_components/inventory-page-layout";
import { TableEmptyStateRow } from "../_components/table-empty-state-row";
import { formatVND } from "../_lib/format";
import {
  applyCreditToInvoice,
  fetchOpenInvoicesForSupplier,
} from "../credit-note-actions";

import { ACTIONS_VI, FORM_VI } from "@comtammatu/shared/messages";
type CreditNoteRow = {
  id: number;
  credit_number: string;
  kind: string;
  amount: number;
  applied_amount: number;
  status: string;
  created_at: string;
  applied_at: string | null;
  supplier_id: number;
  return_id: number;
  invoice_id: number | null;
  suppliers: { id: number; name: string } | null;
  supplier_returns: { id: number; return_number: string } | null;
  supplier_invoices: { id: number; invoice_number: string } | null;
};

type OpenInvoice = {
  id: number;
  invoice_number: string;
  invoice_date: string;
  total_amount: number;
  paid_amount: number | null;
  credit_applied_amount: number | null;
  due_date: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  open: "Còn hạn áp",
  applied: "Đã áp hết",
  cancelled: "Đã hủy",
};

const KIND_LABEL: Record<string, string> = {
  credit_note: "Credit note",
  cash_refund: "Hòan tiền mặt",
};

export function CreditNotesClient({
  rows,
  error,
}: {
  rows: CreditNoteRow[];
  error: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<CreditNoteRow | null>(null);
  const [openInvoices, setOpenInvoices] = useState<OpenInvoice[]>([]);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string>("");
  const [amount, setAmount] = useState<number>(0);
  const [isLoading, startLoad] = useTransition();
  const [isApplying, startApply] = useTransition();

  function openApplyDialog(row: CreditNoteRow) {
    setTarget(row);
    const remaining = Number(row.amount) - Number(row.applied_amount);
    setAmount(remaining);
    setOpenInvoices([]);
    setSelectedInvoiceId("");
    setOpen(true);
    startLoad(async () => {
      const res = await fetchOpenInvoicesForSupplier(row.supplier_id);
      if (res.success) {
        setOpenInvoices((res.data as OpenInvoice[]) ?? []);
      } else {
        toast.error(res.error ?? "Không thể tải hóa đơn còn nợ.");
      }
    });
  }

  function handleApply() {
    if (!target || !selectedInvoiceId) {
      toast.error("Chọn hóa đơn để áp credit.");
      return;
    }
    if (amount <= 0) {
      toast.error("Số tiền phải > 0.");
      return;
    }
    startApply(async () => {
      const res = await applyCreditToInvoice({
        creditId: target.id,
        invoiceId: Number(selectedInvoiceId),
        amount,
      });
      if (!res.success) {
        toast.error(res.error ?? "Không thể áp credit.");
        return;
      }
      toast.success("Đã áp credit vào hóa đơn.");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <InventoryHeader title="Ghi có NCC" />
      <InventoryPageContent>
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <Alert>
          <AlertDescription>
            Ghi có phát sinh khi phiếu trả NCC chuyển sang trạng thái{" "}
            <strong>credited</strong> hoặc <strong>refunded</strong>. Phiếu ghi
            có có thể áp vào hóa đơn còn nợ của cùng NCC để giảm công nợ. Hòan
            tiền mặt được đóng ngay khi phát hành (không áp).
          </AlertDescription>
        </Alert>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mã</TableHead>
                  <TableHead>NCC</TableHead>
                  <TableHead>{FORM_VI.type}</TableHead>
                  <TableHead>Phiếu trả</TableHead>
                  <TableHead className="text-right">{FORM_VI.total}</TableHead>
                  <TableHead className="text-right">Đã áp</TableHead>
                  <TableHead className="text-right">Còn lại</TableHead>
                  <TableHead>{FORM_VI.status}</TableHead>
                  <TableHead>Hóa đơn áp</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableEmptyStateRow
                    colSpan={10}
                    title="Chưa có phiếu ghi có nào"
                    description="Phiếu ghi có sẽ tự sinh khi xác nhận ghi có ở phiếu trả NCC."
                  />
                ) : null}
                {rows.map((r) => {
                  const total = Number(r.amount);
                  const applied = Number(r.applied_amount);
                  const remaining = total - applied;
                  const canApply =
                    r.status === "open" &&
                    r.kind === "credit_note" &&
                    remaining > 0;
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono">
                        {r.credit_number}
                      </TableCell>
                      <TableCell>{r.suppliers?.name ?? "—"}</TableCell>
                      <TableCell className="text-xs">
                        {KIND_LABEL[r.kind] ?? r.kind}
                      </TableCell>
                      <TableCell className="text-xs">
                        {r.supplier_returns ? (
                          <Link
                            href={`/inventory/supplier-returns/${r.supplier_returns.id}`}
                            className="text-primary hover:underline"
                          >
                            {r.supplier_returns.return_number}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatVND(total)} ₫
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatVND(applied)} ₫
                      </TableCell>
                      <TableCell className="text-right font-mono font-semibold">
                        {formatVND(remaining)} ₫
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {STATUS_LABEL[r.status] ?? r.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">
                        {r.supplier_invoices ? (
                          <Link
                            href={`/inventory/supplier-invoices`}
                            className="text-primary hover:underline"
                          >
                            {r.supplier_invoices.invoice_number}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell>
                        {canApply ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openApplyDialog(r)}
                          >
                            <IconCreditCard className="size-4" /> Áp vào hóa đơn
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </InventoryPageContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Áp credit vào hóa đơn NCC</DialogTitle>
          </DialogHeader>
          {target ? (
            <div className="space-y-4">
              <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                <p>
                  Credit: <strong>{target.credit_number}</strong> •{" "}
                  {target.suppliers?.name}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Tổng: {formatVND(Number(target.amount))} ₫ • Đã áp:{" "}
                  {formatVND(Number(target.applied_amount))} ₫ • Còn:{" "}
                  {formatVND(
                    Number(target.amount) - Number(target.applied_amount),
                  )}{" "}
                  ₫
                </p>
              </div>

              <div className="space-y-2">
                <Label>Hóa đơn còn nợ</Label>
                {isLoading ? (
                  <p className="text-xs text-muted-foreground">
                    Đang tải hóa đơn còn nợ…
                  </p>
                ) : openInvoices.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    NCC này không có hóa đơn còn nợ.
                  </p>
                ) : (
                  <Select
                    value={selectedInvoiceId}
                    onValueChange={setSelectedInvoiceId}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Chọn hóa đơn…" />
                    </SelectTrigger>
                    <SelectContent>
                      {openInvoices.map((inv) => {
                        const remaining =
                          Number(inv.total_amount) -
                          Number(inv.paid_amount ?? 0) -
                          Number(inv.credit_applied_amount ?? 0);
                        return (
                          <SelectItem key={inv.id} value={inv.id.toString()}>
                            {inv.invoice_number} • Còn {formatVND(remaining)} ₫
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="amount">Số tiền áp (₫)</Label>
                <FormattedNumberInput
                  id="amount"
                  maxFractionDigits={0}
                  value={String(amount)}
                  onValueChange={(value) => setAmount(Number(value || 0))}
                />
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">{ACTIONS_VI.cancel}</Button>
            </DialogClose>
            <Button
              onClick={handleApply}
              disabled={isApplying || !selectedInvoiceId || amount <= 0}
            >
              <IconCreditCard className="size-4" /> Áp credit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
