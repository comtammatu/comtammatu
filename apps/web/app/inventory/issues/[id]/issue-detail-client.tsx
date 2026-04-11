"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle, PlusCircle, Trash2, X } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
import { StatusBadge, SearchableSelect } from "../../_components/shared";
import { formatVND } from "../../_lib/format";

export type IssueDetail = {
  code: string;
  status: string;
  branch: string;
  date: string;
  type: string;
  createdBy: string;
  total: number;
  items: Array<{
    name: string;
    sku: string;
    qty: number;
    unit: string;
    cost: number;
    total: number;
    note: string;
  }>;
};

const reasonOptions = [
  { value: "Nấu cơm hàng ngày", label: "Nấu cơm hàng ngày" },
  { value: "Sơ chế món nướng", label: "Sơ chế món nướng" },
  { value: "Tẩm ướp gia vị", label: "Tẩm ướp gia vị" },
  { value: "Bù hao hụt", label: "Bù hao hụt" },
  { value: "Hủy hàng lỗi", label: "Hủy hàng lỗi" },
];

export function IssueDetailClient({
  issueDetail,
}: {
  issueDetail: IssueDetail;
}) {
  const [notes, setNotes] = useState<Record<string, string>>(
    Object.fromEntries(issueDetail.items.map((item) => [item.name, item.note])),
  );
  return (
    <div className="space-y-6">
      <Link
        href="/inventory/issues"
        className="inline-flex items-center gap-1 text-sm hover:underline"
        style={{ color: "var(--md-on-surface-variant)" }}
      >
        <ArrowLeft className="size-4" /> Chi tiết Phiếu xuất
      </Link>

      {/* Header Identity Card */}
      <section
        className="relative overflow-hidden rounded-2xl p-8 shadow-sm"
        style={{ backgroundColor: "var(--md-surface-low)" }}
      >
        {/* Status badge top-right */}
        <div className="absolute right-8 top-8">
          <StatusBadge status={issueDetail.status} />
        </div>

        <div className="grid grid-cols-1 gap-12 md:grid-cols-3">
          {/* Column 1: Code + Type */}
          <div className="space-y-4">
            <div>
              <p
                className="mb-1 text-label uppercase tracking-widest"
                style={{ color: "var(--md-outline)" }}
              >
                Mã phiếu
              </p>
              <h3 className="text-3xl font-black tracking-tight">
                {issueDetail.code}
              </h3>
            </div>
            <div>
              <p
                className="mb-1 text-label uppercase tracking-widest"
                style={{ color: "var(--md-outline)" }}
              >
                Loại phiếu
              </p>
              <p className="flex items-center gap-2 font-semibold">
                <StatusBadge status={issueDetail.type} />
              </p>
            </div>
          </div>

          {/* Column 2: Branch + Date */}
          <div
            className="space-y-4 border-l pl-12"
            style={{
              borderColor:
                "color-mix(in srgb, var(--md-outline-variant) 30%, transparent)",
            }}
          >
            <div>
              <p
                className="mb-1 text-label uppercase tracking-widest"
                style={{ color: "var(--md-outline)" }}
              >
                Chi nhánh
              </p>
              <p className="font-semibold">{issueDetail.branch}</p>
            </div>
            <div>
              <p
                className="mb-1 text-label uppercase tracking-widest"
                style={{ color: "var(--md-outline)" }}
              >
                Ngày tạo
              </p>
              <p className="font-semibold">{issueDetail.date}</p>
            </div>
          </div>

          {/* Column 3: Creator + Total */}
          <div
            className="space-y-4 border-l pl-12"
            style={{
              borderColor:
                "color-mix(in srgb, var(--md-outline-variant) 30%, transparent)",
            }}
          >
            <div>
              <p
                className="mb-1 text-label uppercase tracking-widest"
                style={{ color: "var(--md-outline)" }}
              >
                Người lập phiếu
              </p>
              <div className="mt-1 flex items-center gap-2">
                <span
                  className="flex size-6 items-center justify-center rounded-full text-label font-bold"
                  style={{
                    backgroundColor: "var(--md-primary-fixed)",
                    color: "var(--md-primary)",
                  }}
                >
                  {issueDetail.createdBy
                    .split(" ")
                    .map((w) => w[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase()}
                </span>
                <p className="font-semibold">{issueDetail.createdBy}</p>
              </div>
            </div>
            <div>
              <p
                className="mb-1 text-label uppercase tracking-widest"
                style={{ color: "var(--md-outline)" }}
              >
                Tổng giá trị
              </p>
              <p
                className="text-2xl font-black"
                style={{ color: "var(--md-primary)" }}
              >
                {formatVND(issueDetail.total)}{" "}
                <span className="text-xs font-normal">VNĐ</span>
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Line Items Table */}
      <section
        className="overflow-hidden rounded-2xl ambient-shadow"
        style={{
          backgroundColor: "var(--md-surface-lowest)",
          border:
            "1px solid color-mix(in srgb, var(--md-outline-variant) 20%, transparent)",
        }}
      >
        {/* Table header bar */}
        <div
          className="flex items-center justify-between border-b bg-white p-6"
          style={{
            borderColor:
              "color-mix(in srgb, var(--md-outline-variant) 10%, transparent)",
          }}
        >
          <h4 className="text-lg font-bold">Danh sách nguyên liệu</h4>
          <button
            type="button"
            className="flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold transition-all"
            style={{
              backgroundColor: "var(--md-secondary-container)",
              color: "var(--md-on-secondary-container)",
            }}
          >
            <PlusCircle className="size-4" />
            Thêm nguyên liệu
          </button>
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
                { label: "Nguyên liệu", align: "" },
                { label: "Số lượng", align: "text-right" },
                { label: "Đơn vị", align: "" },
                { label: "Đơn giá (WAC)", align: "text-right" },
                { label: "Thành tiền", align: "text-right" },
                { label: "Lý do xuất", align: "" },
                { label: "", align: "text-center" },
              ].map((h) => (
                <TableHead
                  key={h.label || "del"}
                  className={`px-6 py-4 text-label font-bold uppercase tracking-widest ${h.align}`}
                  style={{ color: "var(--md-outline)" }}
                >
                  {h.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {issueDetail.items.map((item) => (
              <TableRow
                key={item.name}
                className="transition-colors"
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
                      SKU: {item.sku}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="px-6 py-4 text-right">
                  <input
                    type="number"
                    defaultValue={item.qty}
                    className="w-full rounded-lg border-0 px-3 py-1.5 text-right text-sm font-semibold focus:ring-2"
                    style={{
                      backgroundColor: "var(--md-surface-low)",
                      // @ts-expect-error -- CSS custom property
                      "--tw-ring-color":
                        "color-mix(in srgb, var(--md-primary) 30%, transparent)",
                    }}
                    readOnly
                  />
                </TableCell>
                <TableCell className="px-6 py-4">
                  <span
                    className="rounded px-2 py-1 text-xs font-medium"
                    style={{ backgroundColor: "var(--md-surface-container)" }}
                  >
                    {item.unit}
                  </span>
                </TableCell>
                <TableCell className="px-6 py-4 text-right font-medium">
                  {formatVND(item.cost)}
                </TableCell>
                <TableCell className="px-6 py-4 text-right font-bold">
                  {formatVND(item.total)}
                </TableCell>
                <TableCell className="px-6 py-4">
                  <SearchableSelect
                    options={reasonOptions}
                    value={notes[item.name] ?? item.note}
                    onValueChange={(v) =>
                      setNotes((prev) => ({ ...prev, [item.name]: v }))
                    }
                    placeholder="Chọn lý do..."
                    searchPlaceholder="Tìm lý do..."
                    variant="ghost"
                    style={{
                      color: "var(--md-on-surface)",
                      borderBottom:
                        "1px solid color-mix(in srgb, var(--md-outline-variant) 50%, transparent)",
                      paddingBottom: 4,
                    }}
                  />
                </TableCell>
                <TableCell className="px-6 py-4 text-center">
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

        {/* Totals footer */}
        <div
          className="flex justify-end p-8"
          style={{
            backgroundColor:
              "color-mix(in srgb, var(--md-surface-low) 30%, transparent)",
          }}
        >
          <div className="w-72 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span style={{ color: "var(--md-outline)" }}>Tổng số dòng:</span>
              <span className="font-bold">
                {String(issueDetail.items.length).padStart(2, "0")}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span style={{ color: "var(--md-outline)" }}>
                Cộng tiền hàng:
              </span>
              <span className="font-bold">{formatVND(issueDetail.total)}</span>
            </div>
            <div
              className="flex items-end justify-between border-t pt-3"
              style={{
                borderColor:
                  "color-mix(in srgb, var(--md-outline-variant) 30%, transparent)",
              }}
            >
              <span className="text-sm font-bold">TỔNG CỘNG</span>
              <div className="text-right">
                <span
                  className="block text-2xl font-black leading-none"
                  style={{ color: "var(--md-primary)" }}
                >
                  {formatVND(issueDetail.total)}
                </span>
                <span
                  className="text-label font-semibold"
                  style={{ color: "var(--md-outline)" }}
                >
                  VNĐ (Bao gồm thuế)
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

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
          Hủy phiếu
        </button>
        <div className="flex items-center gap-4">
          <button
            type="button"
            className="rounded-full px-8 py-3 font-bold transition-all"
            style={{
              backgroundColor: "var(--md-surface-high)",
              color: "var(--md-on-surface-variant)",
            }}
          >
            Lưu nháp
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
            Xác nhận xuất kho
          </button>
        </div>
      </footer>
    </div>
  );
}
