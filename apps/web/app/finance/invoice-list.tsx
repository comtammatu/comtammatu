"use client";

import { useState, useTransition } from "react";
import { FileX as IconFileX, Receipt as IconReceipt } from "lucide-react";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Label } from "@comtammatu/ui/components/label";
import { Textarea } from "@comtammatu/ui/components/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@comtammatu/ui/components/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
import { toast } from "@comtammatu/ui/components/sonner";
import { formatVND } from "@comtammatu/shared/format";
import { formatDateTimeVN } from "@comtammatu/shared/datetime";
import { useTenantTimezone } from "@/_lib/timezone-context";
import { cancelTaxInvoice } from "./actions";
import type { InvoiceRow } from "./page";
import { TableEmptyStateRow } from "@/admin/components/table-empty-state-row";

import { FORM_VI, ORDER_VI } from "@comtammatu/shared/messages";
const STATUS_LABEL: Record<string, string> = {
  draft: "Nháp",
  issued: "Đã phát hành",
  cancelled: "Đã hủy",
};

const STATUS_VARIANT: Record<
  string,
  "secondary" | "default" | "destructive" | "outline"
> = {
  draft: "secondary",
  issued: "default",
  cancelled: "destructive",
};

interface InvoiceListProps {
  initialInvoices: InvoiceRow[];
}

const CANCEL_REASON_MIN = 20;
const CANCEL_REASON_MAX = 500;

export function InvoiceList({ initialInvoices }: InvoiceListProps) {
  const tz = useTenantTimezone();
  const formatDate = (iso: string) => formatDateTimeVN(iso, tz);
  const [invoices, setInvoices] = useState(initialInvoices);
  const [cancelTarget, setCancelTarget] = useState<InvoiceRow | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [isPending, startTransition] = useTransition();

  const trimmedReason = cancelReason.trim();
  const reasonValid =
    trimmedReason.length >= CANCEL_REASON_MIN &&
    trimmedReason.length <= CANCEL_REASON_MAX;

  function resetCancelDialog() {
    setCancelTarget(null);
    setCancelReason("");
  }

  function handleCancel() {
    if (!cancelTarget || !reasonValid) return;
    const id = cancelTarget.id;
    const reason = trimmedReason;
    startTransition(async () => {
      const result = await cancelTaxInvoice(id, reason);
      if (!result.success) {
        toast.error(result.error ?? "Không thể hủy hóa đơn");
        return;
      }
      toast.success("Đã hủy hóa đơn");
      setInvoices((prev) =>
        prev.map((inv) =>
          inv.id === id ? { ...inv, status: "cancelled" } : inv,
        ),
      );
      resetCancelDialog();
    });
  }

  return (
    <>
      <div className="space-y-4">
        {invoices.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border px-6 py-10 text-center">
            <IconReceipt className="mx-auto size-8 text-muted-foreground" />
            <p className="mt-3 text-sm text-muted-foreground">
              Chưa có hóa đơn nào
            </p>
          </div>
        ) : null}

        <div className="space-y-3 md:hidden">
          {invoices.map((inv) => (
            <div
              key={inv.id}
              className="rounded-lg border border-border/70 bg-background p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-sm">
                    {inv.invoice_number ?? "—"}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {inv.orders?.order_number ?? `#${inv.id}`}
                  </p>
                </div>
                <Badge variant={STATUS_VARIANT[inv.status] ?? "secondary"}>
                  {STATUS_LABEL[inv.status] ?? inv.status}
                </Badge>
              </div>
              <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <p className="text-muted-foreground">Người mua</p>
                  <p className="mt-1">{inv.buyer_name ?? "—"}</p>
                  {inv.buyer_tax_code ? (
                    <p className="text-xs text-muted-foreground">
                      MST: {inv.buyer_tax_code}
                    </p>
                  ) : null}
                </div>
                <div className="text-left sm:text-right">
                  <p className="text-muted-foreground">{FORM_VI.value}</p>
                  <p className="mt-1 font-mono font-semibold">
                    {formatVND(inv.total_amount)}
                  </p>
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  {formatDate(inv.issued_at ?? inv.created_at)}
                </p>
                {inv.status === "issued" ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setCancelTarget(inv)}
                  >
                    <IconFileX className="size-4" />
                    Hủy hóa đơn
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
        </div>

        <div className="hidden rounded-md border md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Số HĐ</TableHead>
                <TableHead>{ORDER_VI.long}</TableHead>
                <TableHead>Người mua</TableHead>
                <TableHead className="text-right">{FORM_VI.value}</TableHead>
                <TableHead>{FORM_VI.status}</TableHead>
                <TableHead>Thời gian</TableHead>
                <TableHead className="w-16" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.length === 0 && (
                <TableEmptyStateRow
                  colSpan={7}
                  title="Chưa có hóa đơn nào"
                  icon={
                    <IconReceipt className="mx-auto size-8 text-muted-foreground" />
                  }
                />
              )}
              {invoices.map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell className="font-mono text-sm">
                    {inv.invoice_number ?? "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {inv.orders?.order_number ?? `#${inv.id}`}
                  </TableCell>
                  <TableCell>
                    {inv.buyer_name ? (
                      <div>
                        <p className="text-sm">{inv.buyer_name}</p>
                        {inv.buyer_tax_code && (
                          <p className="text-xs text-muted-foreground">
                            MST: {inv.buyer_tax_code}
                          </p>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {formatVND(inv.total_amount)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[inv.status] ?? "secondary"}>
                      {STATUS_LABEL[inv.status] ?? inv.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(inv.issued_at ?? inv.created_at)}
                  </TableCell>
                  <TableCell>
                    {inv.status === "issued" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 text-destructive hover:text-destructive"
                        onClick={() => setCancelTarget(inv)}
                      >
                        <IconFileX className="size-4" />
                        <span className="sr-only">Hủy hóa đơn</span>
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <AlertDialog
        open={!!cancelTarget}
        onOpenChange={(open) => !open && resetCancelDialog()}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận hủy hóa đơn</AlertDialogTitle>
            <AlertDialogDescription>
              Hủy hóa đơn{" "}
              <strong>
                {cancelTarget?.invoice_number ?? `#${cancelTarget?.id}`}
              </strong>
              ? Hành động này không thể hòan tác. Lý do hủy được lưu vào
              hồ sơ HĐĐT theo yêu cầu của Nghị định 70/2025.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="invoice-cancel-reason">
              Lý do hủy (tối thiểu {CANCEL_REASON_MIN} ký tự)
            </Label>
            <Textarea
              id="invoice-cancel-reason"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Ví dụ: Khách hàng yêu cầu xuất lại HĐĐT vì sai mã số thuế."
              rows={3}
              maxLength={CANCEL_REASON_MAX}
              disabled={isPending}
            />
            <p className="text-xs text-muted-foreground">
              {trimmedReason.length}/{CANCEL_REASON_MAX}
            </p>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Không</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancel}
              disabled={isPending || !reasonValid}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Hủy hóa đơn
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
