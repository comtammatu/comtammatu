"use client";

import Link from "next/link";
import { ArrowLeft, FileDown, CheckCircle, X } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
import { StatusBadge } from "../../_components/shared";

const session = {
  code: "ST-2604-01",
  status: "in_progress" as const,
  branch: "Quận 1, Hồ Chí Minh",
  startDate: "08/04/2026 – 08:30",
  progress: 68,
  totalItems: 124,
  counted: 84,
  totalVarianceValue: -2_400_000,
  items: [
    {
      name: "Gạo Tấm ST25",
      sku: "GRA-001",
      unit: "Kg",
      system: 120,
      counted: 119.5,
      variance: -0.5,
      pct: -0.42,
      reason: "Ghi chú...",
    },
    {
      name: "Sườn Cốt Lết",
      sku: "MEAT-002",
      unit: "Kg",
      system: 45.0,
      counted: 43.5,
      variance: -1.5,
      pct: -3.33,
      reason: "Hao hụt trong quá trình sơ chế",
    },
    {
      name: "Trứng Vịt",
      sku: "EGG-001",
      unit: "Quả",
      system: 200,
      counted: 185,
      variance: -15,
      pct: -7.5,
      reason: "",
    },
    {
      name: "Dầu Ăn Cái Lân",
      sku: "OIL-002",
      unit: "Lít",
      system: 99.9,
      counted: null,
      variance: null,
      pct: null,
      reason: "",
    },
  ],
};

function varianceColor(pct: number | null): {
  color: string;
  fontWeight?: string;
} {
  if (pct === null) return { color: "var(--md-outline)" };
  const abs = Math.abs(pct);
  if (abs <= 1) return { color: "var(--md-secondary)" };
  if (abs <= 5) return { color: "var(--md-primary)" };
  return { color: "var(--md-error)", fontWeight: "600" };
}

export default function StocktakeDetailPage() {
  return (
    <div className="space-y-6">
      <Link
        href="/demo/inventory/stocktake"
        className="inline-flex items-center gap-1 text-sm hover:underline"
        style={{ color: "var(--md-on-surface-variant)" }}
      >
        <ArrowLeft className="size-4" /> Phiếu Kiểm kê
      </Link>

      {/* Header Identity Card */}
      <section
        className="relative overflow-hidden rounded-2xl p-8 shadow-sm"
        style={{ backgroundColor: "var(--md-surface-low)" }}
      >
        <div className="absolute right-8 top-8">
          <StatusBadge status={session.status} />
        </div>

        <div className="grid grid-cols-1 gap-12 md:grid-cols-3">
          {/* Column 1: Code + Branch */}
          <div className="space-y-4">
            <div>
              <p
                className="mb-1 text-label uppercase tracking-widest"
                style={{ color: "var(--md-outline)" }}
              >
                Mã phiếu
              </p>
              <h3 className="text-3xl font-black tracking-tight">
                {session.code}
              </h3>
            </div>
            <div>
              <p
                className="mb-1 text-label uppercase tracking-widest"
                style={{ color: "var(--md-outline)" }}
              >
                Chi nhánh
              </p>
              <p className="font-semibold">{session.branch}</p>
            </div>
          </div>

          {/* Column 2: Time + Progress */}
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
                Thời gian
              </p>
              <p className="font-semibold">{session.startDate}</p>
            </div>
            <div>
              <p
                className="mb-1 text-label uppercase tracking-widest"
                style={{ color: "var(--md-outline)" }}
              >
                Tiến độ
              </p>
              <p
                className="text-lg font-black"
                style={{ color: "var(--md-primary)" }}
              >
                {session.progress}%
              </p>
            </div>
          </div>

          {/* Column 3: Counts + Variance */}
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
                Đã kiểm / Tổng
              </p>
              <p className="font-semibold tabular-nums">
                {session.counted} / {session.totalItems}
              </p>
            </div>
            <div>
              <p
                className="mb-1 text-label uppercase tracking-widest"
                style={{ color: "var(--md-outline)" }}
              >
                Chênh lệch ước tính
              </p>
              <p
                className="text-xl font-black tabular-nums"
                style={{ color: "var(--md-error)" }}
              >
                {session.totalVarianceValue.toLocaleString("vi-VN")} VNĐ
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Summary stat cards */}
      <div className="grid grid-cols-3 gap-4">
        {[
          {
            value: session.totalItems,
            label: "Tổng số nguyên liệu",
            color: undefined,
          },
          {
            value: session.counted,
            label: "Đã kiểm kê",
            color: "var(--md-primary)",
          },
          {
            value: `${session.totalVarianceValue.toLocaleString("vi-VN")} VNĐ`,
            label: "Tổng chênh lệch ước tính",
            color: "var(--md-error)",
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl p-5 text-center ambient-shadow"
            style={{
              backgroundColor: "var(--md-surface-lowest)",
              border:
                "1px solid color-mix(in srgb, var(--md-outline-variant) 10%, transparent)",
            }}
          >
            <p
              className="text-2xl font-bold tabular-nums"
              style={stat.color ? { color: stat.color } : undefined}
            >
              {stat.value}
            </p>
            <p
              className="mt-1 text-xs"
              style={{ color: "var(--md-on-surface-variant)" }}
            >
              {stat.label}
            </p>
          </div>
        ))}
      </div>

      {/* Table header bar */}
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold">Bảng Kiểm kê Chi tiết</p>
        <div className="flex gap-2">
          <button
            type="button"
            className="rounded-full px-4 py-2 text-sm font-medium transition-all"
            style={{
              backgroundColor: "var(--md-surface-high)",
              color: "var(--md-on-surface-variant)",
            }}
          >
            Lọc tất cả
          </button>
          <button
            type="button"
            className="flex items-center gap-1 rounded-full px-4 py-2 text-sm font-medium transition-all"
            style={{
              backgroundColor: "var(--md-surface-high)",
              color: "var(--md-on-surface-variant)",
            }}
          >
            <FileDown className="size-3" /> Xuất File
          </button>
        </div>
      </div>

      {/* Items table */}
      <section
        className="overflow-hidden rounded-2xl ambient-shadow"
        style={{
          backgroundColor: "var(--md-surface-lowest)",
          border:
            "1px solid color-mix(in srgb, var(--md-outline-variant) 20%, transparent)",
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
                { label: "Nguyên liệu", align: "" },
                { label: "Đơn vị", align: "" },
                { label: "SL Hệ thống", align: "text-right" },
                { label: "SL Thực đếm", align: "text-right" },
                { label: "Chênh lệch", align: "text-right" },
                { label: "% CL", align: "text-right" },
                { label: "Lý do điều chỉnh", align: "" },
              ].map((h) => (
                <TableHead
                  key={h.label}
                  className={`px-6 py-4 text-label font-bold uppercase tracking-widest ${h.align}`}
                  style={{ color: "var(--md-outline)" }}
                >
                  {h.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {session.items.map((item) => (
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
                <TableCell className="px-6 py-4">{item.unit}</TableCell>
                <TableCell className="px-6 py-4 text-right font-mono tabular-nums">
                  {item.system}
                </TableCell>
                <TableCell className="px-6 py-4 text-right font-mono tabular-nums">
                  {item.counted !== null ? (
                    item.counted
                  ) : (
                    <span
                      className="italic"
                      style={{ color: "var(--md-outline)" }}
                    >
                      —
                    </span>
                  )}
                </TableCell>
                <TableCell
                  className="px-6 py-4 text-right font-mono tabular-nums"
                  style={varianceColor(item.pct)}
                >
                  {item.variance !== null ? item.variance : "—"}
                </TableCell>
                <TableCell
                  className="px-6 py-4 text-right font-mono tabular-nums"
                  style={varianceColor(item.pct)}
                >
                  {item.pct !== null ? `${item.pct}%` : "—"}
                </TableCell>
                <TableCell
                  className="px-6 py-4 max-w-48 truncate"
                  style={{ color: "var(--md-on-surface-variant)" }}
                >
                  {item.reason || (
                    <span
                      className="italic"
                      style={{ color: "var(--md-outline)" }}
                    >
                      —
                    </span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      {/* Guidance cards */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div
          className="rounded-xl p-4"
          style={{
            backgroundColor:
              "color-mix(in srgb, var(--md-error) 5%, var(--md-surface-lowest))",
            border:
              "1px solid color-mix(in srgb, var(--md-error) 20%, transparent)",
          }}
        >
          <p className="text-sm font-bold" style={{ color: "var(--md-error)" }}>
            Lưu ý quan trọng
          </p>
          <ul
            className="mt-2 space-y-1 text-xs list-disc pl-4"
            style={{ color: "var(--md-on-surface-variant)" }}
          >
            <li>
              Bạn bước phải nhập lý do cho các nguyên liệu có chênh lệch lớn hơn
              5%.
            </li>
            <li>
              Số liệu hệ thống đã được snapshot tại thời điểm bắt đầu phiên kiểm
              kê.
            </li>
          </ul>
        </div>
        <div
          className="rounded-xl p-4"
          style={{
            backgroundColor:
              "color-mix(in srgb, var(--md-surface-low) 60%, transparent)",
            border:
              "1px solid color-mix(in srgb, var(--md-outline-variant) 15%, transparent)",
          }}
        >
          <p className="text-sm font-bold">Hướng dẫn nhanh</p>
          <p
            className="mt-1 text-xs"
            style={{ color: "var(--md-on-surface-variant)" }}
          >
            Sử dụng phím{" "}
            <kbd
              className="rounded px-1 font-mono text-xs"
              style={{
                backgroundColor: "var(--md-surface-high)",
                color: "var(--md-on-surface-variant)",
              }}
            >
              Tab
            </kbd>{" "}
            để chuyển nhanh giữa các ô nhập liệu. Hệ thống sẽ tự động tính toán
            chênh lệch và % hao hụt ngay khi bạn rời khỏi ô &ldquo;Thực
            đếm&rdquo;.
          </p>
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
          Hủy phiếu
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
          Hoàn thành kiểm kê
        </button>
      </footer>
    </div>
  );
}
