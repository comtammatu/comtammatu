"use client";

import { useState, useTransition } from "react";
import { FileX2, Receipt } from "lucide-react";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
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
import { cancelTaxInvoice } from "./actions";
import type { InvoiceRow } from "./page";
import { TableEmptyStateRow } from "../components/table-empty-state-row";

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

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface InvoiceListProps {
  initialInvoices: InvoiceRow[];
}

export function InvoiceList({ initialInvoices }: InvoiceListProps) {
  const [invoices, setInvoices] = useState(initialInvoices);
  const [cancelTarget, setCancelTarget] = useState<InvoiceRow | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleCancel() {
    if (!cancelTarget) return;
    const id = cancelTarget.id;
    startTransition(async () => {
      const result = await cancelTaxInvoice(id, "Hủy theo yêu cầu");
      if (!result.success) {
        toast.error(result.error ?? "Không thể hủy hóa đơn");
        setCancelTarget(null);
        return;
      }
      toast.success("Đã hủy hóa đơn");
      setInvoices((prev) =>
        prev.map((inv) =>
          inv.id === id ? { ...inv, status: "cancelled" } : inv,
        ),
      );
      setCancelTarget(null);
    });
  }

  return (
    <>
      <div className="space-y-4">
        {invoices.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border px-6 py-10 text-center">
            <Receipt className="mx-auto size-8 text-muted-foreground" />
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
                  <p className="text-muted-foreground">Giá trị</p>
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
                    <FileX2 className="size-4" />
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
                <TableHead>Đơn hàng</TableHead>
                <TableHead>Người mua</TableHead>
                <TableHead className="text-right">Giá trị</TableHead>
                <TableHead>Trạng thái</TableHead>
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
                    <Receipt className="mx-auto size-8 text-muted-foreground" />
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
                        <FileX2 className="size-4" />
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
        onOpenChange={(open) => !open && setCancelTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận hủy hóa đơn</AlertDialogTitle>
            <AlertDialogDescription>
              Hủy hóa đơn{" "}
              <strong>
                {cancelTarget?.invoice_number ?? `#${cancelTarget?.id}`}
              </strong>
              ? Hành động này không thể hoàn tác.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Không</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancel}
              disabled={isPending}
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
