"use client";

import { FileDown, Plus } from "lucide-react";
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Hóa đơn Nhà cung cấp"
        description="Quản lý và đối soát chứng từ nhập hàng trong hệ thống."
        actions={
          <button
            type="button"
            className="flex items-center gap-2 rounded-full px-6 py-2.5 font-bold text-white shadow-xl transition-transform active:scale-[0.98]"
            style={{
              background:
                "linear-gradient(135deg, var(--md-primary), var(--md-primary-container))",
              boxShadow: "0 4px 14px rgba(211,84,0,0.15)",
            }}
          >
            <Plus className="size-4" />
            Tạo hóa đơn
          </button>
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
          <section
            className="overflow-hidden rounded-2xl ambient-shadow"
            style={{
              backgroundColor: "var(--md-surface-lowest)",
              border:
                "1px solid color-mix(in srgb, var(--md-outline-variant) 10%, transparent)",
            }}
          >
            <Table>
              <TableHeader>
                <TableRow
                  style={{
                    backgroundColor:
                      "color-mix(in srgb, var(--md-surface-low) 50%, transparent)",
                  }}
                >
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
                      style={{ color: "var(--md-outline)" }}
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
                    style={{
                      borderColor:
                        "color-mix(in srgb, var(--md-outline-variant) 5%, transparent)",
                    }}
                  >
                    <TableCell
                      className="px-6 py-4 font-bold"
                      style={{ color: "var(--md-primary)" }}
                    >
                      {inv.code}
                    </TableCell>
                    <TableCell className="px-6 py-4">
                      {inv.supplierName}
                    </TableCell>
                    <TableCell className="px-6 py-4">
                      <p className="font-mono font-medium">{inv.poCode}</p>
                      {inv.grnCode && (
                        <p
                          className="text-xs"
                          style={{ color: "var(--md-outline)" }}
                        >
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
          </section>
        </div>

        {/* Analysis panel -- 2/5 */}
        <div className="space-y-4 lg:col-span-2">
          <div
            className="rounded-2xl ambient-shadow"
            style={{
              backgroundColor: "var(--md-surface-lowest)",
              border:
                "1px solid color-mix(in srgb, var(--md-outline-variant) 20%, transparent)",
            }}
          >
            <div
              className="border-b p-6"
              style={{
                borderColor:
                  "color-mix(in srgb, var(--md-outline-variant) 10%, transparent)",
              }}
            >
              <h4 className="text-sm font-bold">
                Phân tích Đối soát: {selectedInvoice?.code}
              </h4>
            </div>
            <div className="space-y-4 p-6">
              <p
                className="text-xs"
                style={{ color: "var(--md-on-surface-variant)" }}
              >
                Chi tiết khớp giữa các giai đoạn cung ứng
              </p>

              {[
                {
                  step: 1,
                  label: "Đặt hàng (PO)",
                  code: selectedInvoice?.poCode,
                  amount: 40_000_000,
                },
                {
                  step: 2,
                  label: "Thực nhận (GRN)",
                  code: selectedInvoice?.grnCode,
                  amount: 39_800_000,
                },
                {
                  step: 3,
                  label: "Hóa đơn (Invoice)",
                  code: selectedInvoice?.code,
                  amount: selectedInvoice?.amount ?? 0,
                },
              ].map((item) => (
                <div
                  key={item.step}
                  className="flex items-center gap-3 rounded-lg p-3"
                  style={{
                    backgroundColor: "var(--md-surface-low)",
                    border:
                      "1px solid color-mix(in srgb, var(--md-outline-variant) 15%, transparent)",
                  }}
                >
                  <div
                    className="flex size-7 items-center justify-center rounded-full text-xs font-bold"
                    style={{
                      backgroundColor:
                        "color-mix(in srgb, var(--md-primary) 15%, transparent)",
                      color: "var(--md-primary)",
                    }}
                  >
                    {item.step}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p
                      className="text-xs"
                      style={{ color: "var(--md-on-surface-variant)" }}
                    >
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
                    className="rounded-lg p-3"
                    style={{
                      backgroundColor:
                        "color-mix(in srgb, var(--md-error) 5%, var(--md-surface-lowest))",
                      border:
                        "1px solid color-mix(in srgb, var(--md-error) 25%, transparent)",
                    }}
                  >
                    <p
                      className="text-xs font-bold"
                      style={{ color: "var(--md-error)" }}
                    >
                      Cảnh báo chênh lệch cao ({selectedInvoice.variance}%)
                    </p>
                    <p
                      className="mt-1 text-xs"
                      style={{ color: "var(--md-on-surface-variant)" }}
                    >
                      Hóa đơn thực tế cao hơn giá trị thực nhận. Vui lòng kiểm
                      tra đơn giá mặt hàng và liên hệ NCC.
                    </p>
                  </div>
                )}

              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  className="flex-1 whitespace-nowrap rounded-full px-4 py-2 text-sm font-bold transition-all"
                  style={{
                    backgroundColor: "var(--md-surface-high)",
                    color: "var(--md-on-surface-variant)",
                  }}
                >
                  <span className="flex items-center justify-center gap-1">
                    <FileDown className="size-3" />
                    Xuất file đối soát
                  </span>
                </button>
                <button
                  type="button"
                  className="flex-1 whitespace-nowrap rounded-full px-4 py-2 text-sm font-bold text-white transition-all"
                  style={{
                    background:
                      "linear-gradient(135deg, var(--md-primary), var(--md-primary-container))",
                  }}
                >
                  Liên hệ NCC
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
