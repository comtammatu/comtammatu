"use client";

import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle,
  CheckCircle2,
  AlertTriangle,
  X,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
import { StatusBadge } from "../../_components/shared";
import { formatVND } from "../../_lib/format";

export type GRNDetail = {
  code: string;
  poCode: string;
  poId?: number;
  supplier: string;
  date: string;
  total: number;
  tax: number;
  status: string;
  items: Array<{
    name: string;
    sku: string;
    required: number;
    actual: number;
    unit: string;
    cost: number;
    lot: string;
    expiry: string;
    temp: string | null;
    status: string;
  }>;
};

export function GRNDetailClient({ grn }: { grn: GRNDetail }) {
  const qcPassed = grn.items.filter((i) => i.status === "pass").length;
  const qcWarning = grn.items.filter((i) => i.status === "warning").length;

  return (
    <div className="space-y-6">
      <Link
        href="/inventory/grn"
        className="inline-flex items-center gap-1 text-sm hover:underline"
        style={{ color: "var(--md-on-surface-variant)" }}
      >
        <ArrowLeft className="size-4" /> Chi tiết Phiếu nhập kho
      </Link>

      {/* Header Identity Card */}
      <section
        className="relative overflow-hidden rounded-2xl p-8 shadow-sm"
        style={{ backgroundColor: "var(--md-surface-low)" }}
      >
        <div className="absolute right-8 top-8">
          <StatusBadge status={grn.status} />
        </div>

        <div className="grid grid-cols-1 gap-12 md:grid-cols-3">
          {/* Column 1: Code + PO */}
          <div className="space-y-4">
            <div>
              <p
                className="mb-1 text-label uppercase tracking-wider"
                style={{ color: "var(--md-outline)" }}
              >
                Mã phiếu nhập
              </p>
              <h3 className="text-3xl font-black tracking-tight">{grn.code}</h3>
            </div>
            <div>
              <p
                className="mb-1 text-label uppercase tracking-wider"
                style={{ color: "var(--md-outline)" }}
              >
                Mã PO
              </p>
              {grn.poCode && grn.poId ? (
                <Link
                  href={`/inventory/purchase-orders/${grn.poId}`}
                  className="font-semibold hover:underline"
                  style={{ color: "var(--md-primary)" }}
                >
                  {grn.poCode}
                </Link>
              ) : (
                <span style={{ color: "var(--md-outline)" }}>—</span>
              )}
            </div>
          </div>

          {/* Column 2: Supplier + Date */}
          <div
            className="space-y-4 border-l pl-12"
            style={{
              borderColor:
                "color-mix(in srgb, var(--md-outline-variant) 30%, transparent)",
            }}
          >
            <div>
              <p
                className="mb-1 text-label uppercase tracking-wider"
                style={{ color: "var(--md-outline)" }}
              >
                Nhà cung cấp
              </p>
              <p className="font-semibold">{grn.supplier}</p>
            </div>
            <div>
              <p
                className="mb-1 text-label uppercase tracking-wider"
                style={{ color: "var(--md-outline)" }}
              >
                Ngày nhập
              </p>
              <p className="font-semibold">{grn.date}</p>
            </div>
          </div>

          {/* Column 3: Total */}
          <div
            className="space-y-4 border-l pl-12"
            style={{
              borderColor:
                "color-mix(in srgb, var(--md-outline-variant) 30%, transparent)",
            }}
          >
            <div>
              <p
                className="mb-1 text-label uppercase tracking-wider"
                style={{ color: "var(--md-outline)" }}
              >
                Tổng giá trị nhập
              </p>
              <p
                className="text-2xl font-black"
                style={{ color: "var(--md-primary)" }}
              >
                {formatVND(grn.total)}{" "}
                <span className="text-xs font-normal">VNĐ</span>
              </p>
            </div>
            <div>
              <p
                className="mb-1 text-label uppercase tracking-wider"
                style={{ color: "var(--md-outline)" }}
              >
                Thuế (VAT)
              </p>
              <p className="font-semibold">{formatVND(grn.tax)} VNĐ</p>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Items -- 2/3 */}
        <div className="lg:col-span-2">
          <section
            className="overflow-hidden rounded-2xl ambient-shadow"
            style={{
              backgroundColor: "var(--md-surface-lowest)",
              border:
                "1px solid color-mix(in srgb, var(--md-outline-variant) 20%, transparent)",
            }}
          >
            <div
              className="flex items-center justify-between border-b p-6"
              style={{
                borderColor:
                  "color-mix(in srgb, var(--md-outline-variant) 10%, transparent)",
              }}
            >
              <h4 className="text-lg font-bold">Danh sách mặt hàng nhập</h4>
              <span
                className="text-xs font-medium"
                style={{ color: "var(--md-outline)" }}
              >
                {grn.items.length} mặt hàng
              </span>
            </div>

            <Table>
              <TableHeader>
                <TableRow
                  style={{
                    backgroundColor:
                      "color-mix(in srgb, var(--md-surface-low) 50%, transparent)",
                  }}
                >
                  {[
                    { label: "Sản phẩm", align: "" },
                    { label: "Yêu cầu", align: "text-right" },
                    { label: "Thực nhận", align: "text-right" },
                    { label: "Đơn giá", align: "text-right" },
                    { label: "Số lô / HSD", align: "" },
                    { label: "Nhiệt độ", align: "" },
                    { label: "QC", align: "text-center" },
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
                {grn.items.map((item) => (
                  <TableRow
                    key={item.sku || item.name}
                    className="group transition-colors"
                    style={{
                      borderColor:
                        "color-mix(in srgb, var(--md-outline-variant) 5%, transparent)",
                    }}
                  >
                    <TableCell className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="font-bold">{item.name}</span>
                        <span
                          className="text-label"
                          style={{ color: "var(--md-outline)" }}
                        >
                          {item.sku}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="px-6 py-4 text-right font-mono tabular-nums">
                      {item.required} {item.unit}
                    </TableCell>
                    <TableCell className="px-6 py-4 text-right font-mono tabular-nums">
                      <span
                        className={
                          item.actual < item.required ? "font-semibold" : ""
                        }
                        style={
                          item.actual < item.required
                            ? { color: "var(--md-primary)" }
                            : undefined
                        }
                      >
                        {item.actual}
                      </span>
                    </TableCell>
                    <TableCell className="px-6 py-4 text-right font-mono tabular-nums">
                      {formatVND(item.cost)}đ
                    </TableCell>
                    <TableCell className="px-6 py-4">
                      <p className="font-mono font-medium">{item.lot}</p>
                      <p
                        className="text-xs"
                        style={{ color: "var(--md-outline)" }}
                      >
                        {item.expiry}
                      </p>
                    </TableCell>
                    <TableCell className="px-6 py-4">
                      {item.temp ? (
                        <span className="font-mono">{item.temp}</span>
                      ) : (
                        <span style={{ color: "var(--md-outline)" }}>—</span>
                      )}
                    </TableCell>
                    <TableCell className="px-6 py-4 text-center">
                      {item.status === "pass" ? (
                        <CheckCircle2
                          className="mx-auto size-4"
                          style={{ color: "var(--md-secondary)" }}
                        />
                      ) : (
                        <AlertTriangle
                          className="mx-auto size-4"
                          style={{ color: "var(--md-primary)" }}
                        />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </section>
        </div>

        {/* Sidebar -- 1/3 */}
        <div className="space-y-4">
          {/* Quality Summary */}
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
              <h4 className="text-sm font-bold">Tổng hợp chất lượng</h4>
            </div>
            <div className="space-y-3 p-6">
              <div className="flex items-center justify-between">
                <span
                  className="text-sm"
                  style={{ color: "var(--md-on-surface-variant)" }}
                >
                  Hàng đạt chuẩn (QC)
                </span>
                <span
                  className="text-lg font-bold"
                  style={{ color: "var(--md-secondary)" }}
                >
                  {qcPassed}/{grn.items.length}
                </span>
              </div>
              {qcWarning > 0 && (
                <div className="flex items-center justify-between">
                  <span
                    className="text-sm"
                    style={{ color: "var(--md-on-surface-variant)" }}
                  >
                    Hàng lưu/thiếu
                  </span>
                  <span
                    className="text-lg font-bold"
                    style={{ color: "var(--md-primary)" }}
                  >
                    {qcWarning}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Total value card */}
          <div
            className="rounded-2xl p-6"
            style={{
              backgroundColor:
                "color-mix(in srgb, var(--md-primary) 5%, var(--md-surface-lowest))",
              border:
                "1px solid color-mix(in srgb, var(--md-primary) 20%, transparent)",
            }}
          >
            <p
              className="text-label uppercase tracking-wider"
              style={{ color: "var(--md-outline)" }}
            >
              Tổng giá trị nhập
            </p>
            <p
              className="mt-2 text-2xl font-black tabular-nums"
              style={{ color: "var(--md-primary)" }}
            >
              {formatVND(grn.total)} VNĐ
            </p>
            <div
              className="mt-3 space-y-1 text-xs"
              style={{ color: "var(--md-on-surface-variant)" }}
            >
              <div className="flex justify-between">
                <span>Tổng thuế (VAT)</span>
                <span className="font-mono tabular-nums">
                  {formatVND(grn.tax)}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Phí vận chuyển</span>
                <span className="font-mono tabular-nums">0</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Action Bar */}
      <footer
        className="flex items-center justify-between border-t py-6"
        style={{
          borderColor:
            "color-mix(in srgb, var(--md-outline-variant) 50%, transparent)",
        }}
      >
        <button
          type="button"
          className="flex items-center gap-2 rounded-full px-6 py-3 font-bold transition-all"
          style={{ color: "var(--md-error)" }}
        >
          <X className="size-5" />
          Hủy bỏ
        </button>
        <button
          type="button"
          className="flex items-center gap-2 rounded-full px-10 py-3 font-bold text-white shadow-lg transition-all hover:scale-[0.98]"
          style={{
            background:
              "linear-gradient(135deg, var(--md-primary), var(--md-primary-container))",
            boxShadow: "0 4px 14px rgba(211,84,0,0.2)",
          }}
        >
          <CheckCircle className="size-5" />
          Xác nhận nhập kho
        </button>
      </footer>
    </div>
  );
}
