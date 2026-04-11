"use client";

import Link from "next/link";
import {
  ArrowLeft,
  XCircle,
  TrendingUp,
  TrendingDown,
  CheckCircle,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from "@comtammatu/ui/components/table";
import {
  StatusBadge,
  TimelineStepper,
  TrendSparkline,
} from "../../_components/shared";
import { formatVND } from "../../_lib/format";

export type PODetail = {
  code: string;
  status: string;
  supplier: string;
  date: string;
  sentAt: string;
  total: number;
  tax: number;
  grandTotal: number;
  supplierInfo: { address: string; contact: string; payment: string };
  items: Array<{
    name: string;
    sku: string;
    qty: number;
    unit: string;
    price: number;
    total: number;
    variance: number;
    trend: "up" | "down" | "stable";
  }>;
};

const priceHistory = [
  175, 178, 180, 182, 179, 183, 185, 188, 190, 192, 189, 185,
];

export function PODetailClient({ po }: { po: PODetail }) {
  return (
    <div className="space-y-6">
      <Link
        href="/inventory/purchase-orders"
        className="inline-flex items-center gap-1 text-sm hover:underline"
        style={{ color: "var(--md-on-surface-variant)" }}
      >
        <ArrowLeft className="size-4" /> Đơn đặt hàng
      </Link>

      {/* Header Identity Card */}
      <section
        className="relative overflow-hidden rounded-2xl p-8 shadow-sm"
        style={{ backgroundColor: "var(--md-surface-low)" }}
      >
        <div className="absolute right-8 top-8">
          <StatusBadge status={po.status} />
        </div>

        <div className="grid grid-cols-1 gap-12 md:grid-cols-3">
          {/* Column 1: Code + Supplier */}
          <div className="space-y-4">
            <div>
              <p
                className="mb-1 text-label uppercase tracking-wider"
                style={{ color: "var(--md-outline)" }}
              >
                Mã PO
              </p>
              <h3 className="text-3xl font-black tracking-tight">{po.code}</h3>
            </div>
            <div>
              <p
                className="mb-1 text-label uppercase tracking-wider"
                style={{ color: "var(--md-outline)" }}
              >
                Nhà cung cấp
              </p>
              <p className="font-semibold">{po.supplier}</p>
            </div>
          </div>

          {/* Column 2: Date + Sent */}
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
                Ngày tạo
              </p>
              <p className="font-semibold">{po.date}</p>
            </div>
            <div>
              <p
                className="mb-1 text-label uppercase tracking-wider"
                style={{ color: "var(--md-outline)" }}
              >
                Ngày gửi
              </p>
              <p className="font-semibold">{po.sentAt}</p>
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
                Tổng tiền hàng
              </p>
              <p className="text-sm font-semibold">{formatVND(po.total)} VNĐ</p>
            </div>
            <div>
              <p
                className="mb-1 text-label uppercase tracking-wider"
                style={{ color: "var(--md-outline)" }}
              >
                Tổng cộng (incl. VAT)
              </p>
              <p
                className="text-2xl font-black"
                style={{ color: "var(--md-primary)" }}
              >
                {formatVND(po.grandTotal)}{" "}
                <span className="text-xs font-normal">VNĐ</span>
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Timeline */}
      <section
        className="flex justify-center overflow-hidden rounded-2xl py-6 ambient-shadow"
        style={{
          backgroundColor: "var(--md-surface-lowest)",
          border:
            "1px solid color-mix(in srgb, var(--md-outline-variant) 10%, transparent)",
        }}
      >
        <TimelineStepper
          steps={[
            { label: "Draft", date: po.date, completed: true },
            {
              label: "Sent",
              date: po.sentAt,
              completed: po.status !== "draft",
            },
            { label: "Đang vận chuyển", active: po.status === "sent" },
            { label: "Received" },
          ]}
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Items table -- 2/3 */}
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
              <h4 className="text-lg font-bold">Chi tiết danh mục hàng</h4>
              <span
                className="text-xs font-medium"
                style={{ color: "var(--md-outline)" }}
              >
                {po.items.length} items
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
                    { label: "Mặt hàng", align: "" },
                    { label: "Số lượng", align: "text-right" },
                    { label: "Đơn giá", align: "text-right" },
                    { label: "Thành tiền", align: "text-right" },
                    { label: "Biến động giá", align: "text-right" },
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
                {po.items.map((item) => (
                  <TableRow
                    key={item.sku}
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
                      {formatVND(item.qty)}
                    </TableCell>
                    <TableCell className="px-6 py-4 text-right font-mono tabular-nums">
                      {formatVND(item.price)}đ
                    </TableCell>
                    <TableCell className="px-6 py-4 text-right font-mono tabular-nums font-semibold">
                      {formatVND(item.total)}đ
                    </TableCell>
                    <TableCell className="px-6 py-4 text-right">
                      {item.variance !== 0 ? (
                        <span
                          className="inline-flex items-center gap-1 text-xs font-semibold"
                          style={{
                            color:
                              item.variance > 0
                                ? "var(--md-error)"
                                : "var(--md-secondary)",
                          }}
                        >
                          {item.variance > 0 ? (
                            <TrendingUp className="size-3" />
                          ) : (
                            <TrendingDown className="size-3" />
                          )}
                          {item.variance > 0 ? "+" : ""}
                          {item.variance}%
                        </span>
                      ) : (
                        <span
                          className="text-xs"
                          style={{ color: "var(--md-outline)" }}
                        >
                          → 0.0
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow
                  style={{
                    borderColor:
                      "color-mix(in srgb, var(--md-outline-variant) 10%, transparent)",
                  }}
                >
                  <TableCell
                    colSpan={3}
                    className="px-6 py-3 text-right text-sm"
                    style={{ color: "var(--md-on-surface-variant)" }}
                  >
                    Tổng tiền hàng
                  </TableCell>
                  <TableCell className="px-6 py-3 text-right font-mono tabular-nums font-semibold">
                    {formatVND(po.total)}đ
                  </TableCell>
                  <TableCell />
                </TableRow>
                <TableRow
                  style={{
                    borderColor:
                      "color-mix(in srgb, var(--md-outline-variant) 10%, transparent)",
                  }}
                >
                  <TableCell
                    colSpan={3}
                    className="px-6 py-3 text-right text-sm"
                    style={{ color: "var(--md-on-surface-variant)" }}
                  >
                    Thuế (VAT 8%)
                  </TableCell>
                  <TableCell className="px-6 py-3 text-right font-mono tabular-nums">
                    {formatVND(po.tax)}đ
                  </TableCell>
                  <TableCell />
                </TableRow>
                <TableRow
                  style={{
                    borderColor:
                      "color-mix(in srgb, var(--md-outline-variant) 10%, transparent)",
                  }}
                >
                  <TableCell
                    colSpan={3}
                    className="px-6 py-3 text-right text-sm font-bold"
                  >
                    Tổng cộng
                  </TableCell>
                  <TableCell
                    className="px-6 py-3 text-right font-mono tabular-nums font-bold"
                    style={{ color: "var(--md-primary)" }}
                  >
                    {formatVND(po.grandTotal)}đ
                  </TableCell>
                  <TableCell />
                </TableRow>
              </TableFooter>
            </Table>
          </section>
        </div>

        {/* Sidebar -- 1/3 */}
        <div className="space-y-4">
          {/* Price Intelligence */}
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
              <h4 className="text-sm font-bold">Price Intelligence</h4>
            </div>
            <div className="space-y-4 p-6">
              <div>
                <p
                  className="text-xs"
                  style={{ color: "var(--md-on-surface-variant)" }}
                >
                  Đang chọn: {po.items[0]?.name ?? "—"}
                </p>
                <p
                  className="mt-1 text-xs font-medium"
                  style={{ color: "var(--md-primary)" }}
                >
                  Cảnh báo: Cao hơn mức trung bình 12 tháng (+14.000đ/kg)
                </p>
              </div>
              <TrendSparkline
                data={priceHistory}
                width={220}
                height={60}
                color="var(--md-primary)"
              />
              <div
                className="space-y-2 border-t pt-3"
                style={{
                  borderColor:
                    "color-mix(in srgb, var(--md-outline-variant) 20%, transparent)",
                }}
              >
                <div className="flex items-start gap-2">
                  <div
                    className="mt-0.5 size-2 rounded-full"
                    style={{ backgroundColor: "var(--md-secondary)" }}
                  />
                  <p className="text-xs">
                    <span className="font-medium">Gợi ý tối ưu:</span> Giá sườn
                    non thường giảm 15% vào cuối quý. Cân nhắc mua số lượng lớn
                    vào tháng 11.
                  </p>
                </div>
                <div className="flex items-start gap-2">
                  <div
                    className="mt-0.5 size-2 rounded-full"
                    style={{ backgroundColor: "var(--md-tertiary)" }}
                  />
                  <p className="text-xs">
                    <span className="font-medium">Đối chiếu NCC khác:</span> An
                    Bình Food đang chào giá 178.000đ (-4%) cho cùng quy cách
                    phẩm chất.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Supplier info */}
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
              <h4 className="text-sm font-bold">Thông tin NCC</h4>
            </div>
            <div className="space-y-3 p-6 text-sm">
              <div>
                <p
                  className="text-label uppercase tracking-wider"
                  style={{ color: "var(--md-outline)" }}
                >
                  Địa chỉ xuất hóa đơn
                </p>
                <p className="mt-1 font-medium">{po.supplierInfo.address}</p>
              </div>
              <div>
                <p
                  className="text-label uppercase tracking-wider"
                  style={{ color: "var(--md-outline)" }}
                >
                  Người liên hệ
                </p>
                <p className="mt-1 font-medium">{po.supplierInfo.contact}</p>
              </div>
              <div>
                <p
                  className="text-label uppercase tracking-wider"
                  style={{ color: "var(--md-outline)" }}
                >
                  Hạn thanh toán
                </p>
                <p className="mt-1 font-medium">{po.supplierInfo.payment}</p>
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
          <XCircle className="size-5" />
          Hủy PO
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
          Tạo Phiếu Nhập kho (GRN)
        </button>
      </footer>
    </div>
  );
}
