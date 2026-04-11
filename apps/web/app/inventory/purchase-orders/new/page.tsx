"use client";

import Link from "next/link";
import {
  ArrowLeft,
  Calendar,
  History,
  List,
  Plus,
  Search,
  Store,
  Trash2,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
import { formatVND } from "../../_lib/format";

const draftItems = [
  {
    name: "Gạo Tấm Đặc Biệt",
    sku: "NL-0012",
    qty: 25,
    unit: "kg",
    price: 22_000,
    total: 550_000,
    historyPrice: 23_500,
    trendDown: true,
  },
  {
    name: "Sườn Cốt Lết Tươi",
    sku: "NL-0450",
    qty: 15,
    unit: "kg",
    price: 180_000,
    total: 2_700_000,
    historyPrice: 175_000,
    trendDown: false,
  },
];

export default function NewPOPage() {
  const subtotal = 4_850_000;

  return (
    <div className="space-y-6">
      {/* Back + Header */}
      <div className="flex items-end justify-between">
        <div>
          <Link
            href="/inventory/purchase-orders"
            className="mb-2 inline-flex items-center gap-1 text-sm hover:underline"
            style={{ color: "var(--md-on-surface-variant)" }}
          >
            <ArrowLeft className="size-4" /> Quay lại
          </Link>
          <h2
            className="text-2xl font-bold tracking-tight"
            style={{ color: "var(--md-on-surface)" }}
          >
            Tạo Đơn đặt hàng mới
          </h2>
          <p
            className="mt-1 text-sm italic"
            style={{ color: "var(--md-on-surface-variant)" }}
          >
            Nhập chi tiết các nguyên liệu cần nhập kho từ nhà cung cấp.
          </p>
        </div>
        <button
          type="button"
          className="flex items-center gap-2 rounded-full px-6 py-2.5 font-semibold transition-colors"
          style={{
            backgroundColor: "var(--md-surface-low)",
            color: "var(--md-on-surface-variant)",
          }}
        >
          <History className="size-4" />
          Xem PO gần đây
        </button>
      </div>

      {/* Bento Form Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Supplier Info */}
        <div
          className="rounded-xl p-6 shadow-sm lg:col-span-2 ambient-shadow"
          style={{
            backgroundColor: "var(--md-surface-lowest)",
            border:
              "1px solid color-mix(in srgb, var(--md-outline-variant) 10%, transparent)",
          }}
        >
          <div className="mb-6 flex items-center gap-2">
            <Store className="size-5" style={{ color: "var(--md-primary)" }} />
            <h3 className="text-lg font-bold">Thông tin Nhà cung cấp</h3>
          </div>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="space-y-2">
              <label
                className="text-xs font-semibold uppercase tracking-wider"
                style={{ color: "var(--md-on-surface-variant)", opacity: 0.7 }}
              >
                Nhà cung cấp
              </label>
              <div className="relative">
                <Search
                  className="absolute left-3 top-1/2 size-4 -translate-y-1/2"
                  style={{
                    color: "var(--md-on-surface-variant)",
                    opacity: 0.5,
                  }}
                />
                <input
                  type="text"
                  placeholder="Tìm tên hoặc mã NCC..."
                  defaultValue="C.P. Việt Nam"
                  className="w-full rounded-lg border-0 border-b-2 border-transparent py-2.5 pl-10 pr-4 text-sm transition-all focus:ring-0"
                  style={{ backgroundColor: "var(--md-surface-low)" }}
                  readOnly
                />
              </div>
            </div>
            <div className="space-y-2">
              <label
                className="text-xs font-semibold uppercase tracking-wider"
                style={{ color: "var(--md-on-surface-variant)", opacity: 0.7 }}
              >
                Ngày đặt hàng
              </label>
              <div className="relative">
                <Calendar
                  className="absolute left-3 top-1/2 size-4 -translate-y-1/2"
                  style={{
                    color: "var(--md-on-surface-variant)",
                    opacity: 0.5,
                  }}
                />
                <input
                  type="text"
                  defaultValue="10/04/2026"
                  className="w-full rounded-lg border-0 border-b-2 border-transparent py-2.5 pl-10 pr-4 text-sm transition-all focus:ring-0"
                  style={{ backgroundColor: "var(--md-surface-low)" }}
                  readOnly
                />
              </div>
            </div>
            <div className="space-y-2 md:col-span-2">
              <label
                className="text-xs font-semibold uppercase tracking-wider"
                style={{ color: "var(--md-on-surface-variant)", opacity: 0.7 }}
              >
                Ghi chú đơn hàng
              </label>
              <textarea
                placeholder="Ví dụ: Giao trước 8h sáng, thịt tươi trong ngày..."
                rows={2}
                className="w-full resize-none rounded-lg border-0 border-b-2 border-transparent px-4 py-2.5 text-sm transition-all focus:ring-0"
                style={{ backgroundColor: "var(--md-surface-low)" }}
                readOnly
              />
            </div>
          </div>
        </div>

        {/* PO Summary Card */}
        <div
          className="flex flex-col justify-between rounded-xl p-6"
          style={{
            backgroundColor:
              "color-mix(in srgb, var(--md-primary) 5%, transparent)",
            border:
              "1px solid color-mix(in srgb, var(--md-primary) 10%, transparent)",
          }}
        >
          <div>
            <div className="mb-4 flex items-center justify-between">
              <span
                className="text-xs font-semibold uppercase tracking-wider"
                style={{ color: "var(--md-primary)" }}
              >
                Tóm tắt PO
              </span>
              <span
                className="rounded-full px-2 py-1 text-label font-bold"
                style={{
                  backgroundColor: "var(--md-primary-fixed)",
                  color: "var(--md-primary)",
                }}
              >
                DỰ THẢO
              </span>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span style={{ color: "var(--md-on-surface-variant)" }}>
                  Số lượng dòng:
                </span>
                <span className="font-bold">03 dòng</span>
              </div>
              <div className="flex justify-between text-sm">
                <span style={{ color: "var(--md-on-surface-variant)" }}>
                  Tổng số lượng SP:
                </span>
                <span className="font-bold">45.0 kg</span>
              </div>
              <div className="flex justify-between text-sm">
                <span style={{ color: "var(--md-on-surface-variant)" }}>
                  Dự kiến giao:
                </span>
                <span className="font-bold">Sáng mai</span>
              </div>
            </div>
          </div>
          <div
            className="mt-6 border-t pt-6"
            style={{
              borderColor:
                "color-mix(in srgb, var(--md-primary) 10%, transparent)",
            }}
          >
            <p
              className="text-xs font-medium"
              style={{ color: "var(--md-primary)", opacity: 0.6 }}
            >
              Tổng tiền tạm tính
            </p>
            <p
              className="text-3xl font-extrabold tracking-tighter"
              style={{ color: "var(--md-primary)" }}
            >
              {formatVND(subtotal)}{" "}
              <span className="text-sm font-normal">VNĐ</span>
            </p>
          </div>
        </div>
      </div>

      {/* Line Items Table */}
      <div
        className="overflow-hidden rounded-xl ambient-shadow"
        style={{
          backgroundColor: "var(--md-surface-lowest)",
          border:
            "1px solid color-mix(in srgb, var(--md-outline-variant) 10%, transparent)",
        }}
      >
        <div
          className="flex items-center justify-between border-b px-6 py-4"
          style={{
            backgroundColor:
              "color-mix(in srgb, var(--md-surface-low) 50%, transparent)",
            borderColor:
              "color-mix(in srgb, var(--md-outline-variant) 10%, transparent)",
          }}
        >
          <h3 className="flex items-center gap-2 text-lg font-bold">
            <List className="size-5" style={{ color: "var(--md-primary)" }} />
            Danh sách Nguyên liệu
          </h3>
          <button
            type="button"
            className="flex items-center gap-1 rounded-full border px-4 py-1.5 text-sm font-bold transition-colors"
            style={{
              borderColor:
                "color-mix(in srgb, var(--md-primary) 20%, transparent)",
              color: "var(--md-primary)",
            }}
          >
            <Plus className="size-4" />
            Thêm dòng mới
          </button>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              {[
                { label: "Nguyên liệu", align: "" },
                { label: "SL đặt", align: "text-center" },
                { label: "Đơn vị", align: "" },
                { label: "Giá ước tính (VNĐ)", align: "" },
                { label: "Thành tiền", align: "text-right" },
                { label: "", align: "" },
              ].map((h) => (
                <TableHead
                  key={h.label || "del"}
                  className={`px-6 py-4 whitespace-nowrap text-caption font-bold uppercase tracking-wider ${h.align}`}
                  style={{
                    color: "var(--md-on-surface-variant)",
                    opacity: 0.6,
                  }}
                >
                  {h.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {draftItems.map((item) => (
              <TableRow
                key={item.sku}
                className="group transition-colors"
                style={{
                  borderColor:
                    "color-mix(in srgb, var(--md-outline-variant) 5%, transparent)",
                }}
              >
                <TableCell className="px-6 py-4">
                  <input
                    type="text"
                    defaultValue={item.name}
                    className="w-full border-none bg-transparent p-0 text-sm font-semibold focus:ring-0"
                    readOnly
                  />
                  <p
                    className="text-label font-medium"
                    style={{
                      color: "var(--md-on-surface-variant)",
                      opacity: 0.6,
                    }}
                  >
                    Mã: {item.sku}
                  </p>
                </TableCell>
                <TableCell className="px-4 py-4">
                  <input
                    type="number"
                    defaultValue={item.qty}
                    className="w-full rounded-md border-none py-1.5 text-center text-sm focus:ring-1"
                    style={{
                      backgroundColor:
                        "color-mix(in srgb, var(--md-surface-low) 40%, transparent)",
                    }}
                    readOnly
                  />
                </TableCell>
                <TableCell
                  className="px-4 py-4 text-sm font-medium"
                  style={{ color: "var(--md-on-surface-variant)" }}
                >
                  {item.unit}
                </TableCell>
                <TableCell className="px-4 py-4">
                  <div className="space-y-1">
                    <input
                      type="text"
                      defaultValue={formatVND(item.price)}
                      className="w-full rounded-md border-none px-3 py-1.5 font-mono text-sm focus:ring-1"
                      style={{
                        backgroundColor:
                          "color-mix(in srgb, var(--md-surface-low) 40%, transparent)",
                      }}
                      readOnly
                    />
                    <div className="flex items-center gap-1 px-1">
                      {item.trendDown ? (
                        <TrendingDown
                          className="size-3"
                          style={{ color: "var(--md-secondary)" }}
                        />
                      ) : (
                        <TrendingUp
                          className="size-3"
                          style={{ color: "var(--md-error)" }}
                        />
                      )}
                      <span
                        className="text-label italic"
                        style={{ color: "var(--md-on-surface-variant)" }}
                      >
                        Giá TB lịch sử: {formatVND(item.historyPrice)}
                      </span>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="px-4 py-4 text-right font-mono text-sm font-bold">
                  {formatVND(item.total)}
                </TableCell>
                <TableCell className="px-6 py-4 text-right">
                  <button
                    type="button"
                    className="transition-colors"
                    style={{ color: "var(--md-outline-variant)" }}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {/* Validation + Subtotal footer */}
        <div
          className="flex items-center justify-between border-t px-6 py-4"
          style={{
            borderColor:
              "color-mix(in srgb, var(--md-outline-variant) 10%, transparent)",
            backgroundColor:
              "color-mix(in srgb, var(--md-surface-low) 30%, transparent)",
          }}
        >
          <div className="flex items-center gap-2">
            <span
              className="size-2 rounded-full"
              style={{ backgroundColor: "var(--md-secondary)" }}
            />
            <span
              className="text-xs font-medium"
              style={{ color: "var(--md-secondary)" }}
            >
              Dữ liệu hợp lệ. Sẵn sàng gửi PO.
            </span>
          </div>
          <div className="text-right">
            <span
              className="text-xs"
              style={{ color: "var(--md-on-surface-variant)" }}
            >
              Tổng cộng:{" "}
            </span>
            <span className="font-bold">{formatVND(subtotal)} VNĐ</span>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex justify-end gap-4">
        <button
          type="button"
          className="rounded-full px-8 py-3 font-bold transition-all"
          style={{
            backgroundColor: "var(--md-surface-high)",
            color: "var(--md-on-surface-variant)",
          }}
        >
          Lưu Nháp
        </button>
        <button
          type="button"
          className="rounded-full px-10 py-3 font-bold text-white shadow-lg transition-all hover:scale-[0.98]"
          style={{
            background:
              "linear-gradient(135deg, var(--md-primary), var(--md-primary-container))",
            boxShadow: "0 4px 14px rgba(211,84,0,0.2)",
          }}
        >
          Gửi PO Ngay
        </button>
      </div>
    </div>
  );
}
