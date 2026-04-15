"use client";

import { FileDown, Plus } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { SectionCard } from "@/components/foundation/ui-patterns";
import { cn, getSurfacePanelClassName } from "@comtammatu/ui";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
import { StatCard, StatusBadge, PageHeader } from "../_components/shared";
import { formatVND } from "../_lib/format";
import { tNav, tRoute } from "../_lib/dictionary";

export type SupplierInvoiceRow = {
  id: number;
  code: string;
  supplierName: string;
  poCode: string;
  grnCode: string | null;
  matchStatus: string;
  paymentStatus: string;
  amount: number;
  variance: number | null;
};

export function SupplierInvoicesClient({
  invoices,
}: {
  invoices: SupplierInvoiceRow[];
}) {
  const totalAP = invoices.reduce((s, i) => s + i.amount, 0);
  const selectedInvoice = invoices[0];
  const panelClassName = getSurfacePanelClassName("inventory", "ambient-shadow");

  return (
    <div className="space-y-6">
      <PageHeader
        title={tRoute("/inventory/supplier-invoices", "heading")}
        description="Đối soát hóa đơn NCC."
        actions={
          <Button
            type="button"
            className="shadow-xl shadow-primary/15 transition-transform active:scale-[0.98]"
          >
            <Plus className="size-4" />
            Tạo hóa đơn NCC
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard value="03" label="Chờ đối soát" />
        <StatCard value="7.2%" label="Chênh lệch > 5%" />
        <StatCard value="01" label="Đã khớp" />
        <StatCard value={`${formatVND(totalAP)}đ`} label="Tổng tiền nợ NCC" />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Table -- 3/5 */}
        <div className="lg:col-span-3">
          <SectionCard
            className={cn(panelClassName, "overflow-hidden rounded-2xl bg-card")}
            density="compact"
          >
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  {[
                    { label: "Số hóa đơn", align: "" },
                    { label: "NCC", align: "" },
                    { label: "PO / GRN", align: "" },
                    { label: "Đối soát 3-way", align: "" },
                    { label: "Thanh toán", align: "" },
                    { label: "Tổng tiền", align: "text-right" },
                  ].map((h) => (
                    <TableHead
                      key={h.label}
                      className={`px-6 py-4 whitespace-nowrap text-label font-bold uppercase tracking-wider ${h.align}`}
                    >
                      {h.label}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((inv) => (
                  <TableRow
                    key={inv.id}
                    className="group cursor-pointer transition-colors"
                  >
                    <TableCell className="px-6 py-4 font-bold text-primary">
                      {inv.code}
                    </TableCell>
                    <TableCell className="px-6 py-4">
                      {inv.supplierName}
                    </TableCell>
                    <TableCell className="px-6 py-4">
                      <p className="font-mono font-medium">{inv.poCode}</p>
                      {inv.grnCode && (
                        <p className="text-xs text-muted-foreground">
                          {inv.grnCode}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="px-6 py-4">
                      <StatusBadge status={inv.matchStatus} />
                    </TableCell>
                    <TableCell className="px-6 py-4">
                      <StatusBadge status={inv.paymentStatus} />
                    </TableCell>
                    <TableCell className="px-6 py-4 text-right font-mono tabular-nums font-semibold">
                      {formatVND(inv.amount)}đ
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </SectionCard>
        </div>

        {/* Analysis panel -- 2/5 */}
        <div className="space-y-4 lg:col-span-2">
          <SectionCard
            className={cn(panelClassName, "rounded-2xl bg-card")}
            density="compact"
          >
            <div className="-m-5 border-b border-border/50 px-5 py-5 md:-m-6 md:px-6 md:py-6">
              <h4 className="text-sm font-bold">
                Phân tích Đối soát: {selectedInvoice?.code}
              </h4>
            </div>
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">
                Chi tiết khớp giữa các giai đoạn cung ứng
              </p>

              {[
                {
                  step: 1,
                  label: tNav("purchaseOrders", "heading"),
                  code: selectedInvoice?.poCode,
                  amount: 40_000_000,
                },
                {
                  step: 2,
                  label: tNav("grn", "heading"),
                  code: selectedInvoice?.grnCode,
                  amount: 39_800_000,
                },
                {
                  step: 3,
                  label: tRoute("/inventory/supplier-invoices", "heading"),
                  code: selectedInvoice?.code,
                  amount: selectedInvoice?.amount ?? 0,
                },
              ].map((item) => (
                <div
                  key={item.step}
                  className="flex items-center gap-3 rounded-lg border border-border/50 bg-muted p-3"
                >
                  <div className="flex size-7 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
                    {item.step}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted-foreground">
                      {item.label}
                    </p>
                    <p className="text-sm font-medium font-mono">
                      {item.code ?? "—"}
                    </p>
                  </div>
                  <p className="text-sm font-mono tabular-nums font-semibold">
                    {formatVND(item.amount)}đ
                  </p>
                </div>
              ))}

              {selectedInvoice &&
                selectedInvoice.variance !== null &&
                selectedInvoice.variance > 0 && (
                  <div
                    className="rounded-2xl border border-destructive/25 bg-destructive/5 p-3"
                  >
                    <p className="text-xs font-bold text-destructive">
                      Cảnh báo chênh lệch cao ({selectedInvoice.variance}%)
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Hóa đơn thực tế cao hơn giá trị thực nhận. Vui lòng kiểm
                      tra đơn giá mặt hàng và liên hệ NCC.
                    </p>
                  </div>
                )}

              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  type="button"
                  variant="secondary"
                  className="flex-1 whitespace-nowrap"
                >
                  <span className="flex items-center justify-center gap-1">
                    <FileDown className="size-3" />
                    Xuất file đối soát
                  </span>
                </Button>
                <Button
                  type="button"
                  className="flex-1 whitespace-nowrap"
                >
                  Liên hệ NCC
                </Button>
              </div>
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
