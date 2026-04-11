"use client";

import Link from "next/link";
import {
  Clock,
  Download,
  Filter,
  MoreVertical,
  Plus,
  Receipt,
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
import { StatusBadge } from "../_components/shared";
import { formatVND } from "../_lib/format";

export type GrnRow = {
  id: number;
  code: string;
  supplierName: string;
  poCode: string;
  date: string;
  total: number;
  status: string;
};

export function GrnListClient({ grns }: { grns: GrnRow[] }) {
  const totalValue = grns.reduce((s, g) => s + g.total, 0);
  const pendingCount = grns.filter((g) => g.status === "pending").length;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div>
          <h2
            className="text-2xl font-bold tracking-tight"
            style={{ color: "var(--md-on-surface)" }}
          >
            Phiếu nhập kho
          </h2>
          <p
            className="mt-2 max-w-md text-sm"
            style={{ color: "var(--md-on-surface-variant)" }}
          >
            Quản lý và theo dõi quá trình nhập hàng từ nhà cung cấp vào hệ thống
            kho trung tâm.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="flex items-center gap-2 rounded-full px-5 py-2.5 font-semibold transition-colors"
            style={{
              backgroundColor: "var(--md-surface-low)",
              color: "var(--md-on-surface)",
            }}
          >
            <Filter className="size-4" />
            Lọc dữ liệu
          </button>
          <button
            type="button"
            className="flex items-center gap-2 rounded-full px-6 py-2.5 font-bold text-white shadow-xl transition-transform hover:scale-[1.02]"
            style={{
              background:
                "linear-gradient(135deg, var(--md-primary), var(--md-primary-container))",
              boxShadow: "0 4px 14px rgba(211,84,0,0.1)",
            }}
          >
            <Plus className="size-4" />
            Tạo GRN
          </button>
        </div>
      </div>

      {/* Asymmetric Dashboard Highlights */}
      <div className="grid grid-cols-12 gap-6">
        {/* Pending Count */}
        <div
          className="col-span-12 rounded-3xl p-6 ambient-shadow md:col-span-4"
          style={{
            backgroundColor: "var(--md-surface-lowest)",
            border:
              "1px solid color-mix(in srgb, var(--md-outline-variant) 10%, transparent)",
          }}
        >
          <div className="mb-4 flex items-center gap-4">
            <div
              className="flex size-12 items-center justify-center rounded-2xl"
              style={{
                backgroundColor:
                  "color-mix(in srgb, var(--md-tertiary) 15%, transparent)",
              }}
            >
              <Clock
                className="size-5"
                style={{ color: "var(--md-tertiary)" }}
              />
            </div>
            <span
              className="text-sm font-semibold"
              style={{ color: "var(--md-on-surface-variant)" }}
            >
              Đang chờ xử lý
            </span>
          </div>
          <div className="mb-1 text-4xl font-black tracking-tight">
            {String(pendingCount).padStart(2, "0")}
          </div>
          <div
            className="text-xs font-semibold"
            style={{ color: "var(--md-tertiary)" }}
          >
            +3 từ hôm qua
          </div>
        </div>

        {/* Total Value Hero */}
        <div
          className="relative col-span-12 flex items-center justify-between overflow-hidden rounded-3xl p-6 ambient-shadow md:col-span-8"
          style={{
            backgroundColor: "var(--md-surface-lowest)",
            border:
              "1px solid color-mix(in srgb, var(--md-outline-variant) 10%, transparent)",
          }}
        >
          <div className="z-10">
            <div
              className="mb-2 text-sm font-semibold"
              style={{ color: "var(--md-on-surface-variant)" }}
            >
              Giá trị nhập kho tháng này
            </div>
            <div className="mb-2 text-4xl font-black tracking-tight">
              {formatVND(totalValue)}
              <span className="ml-1 text-xl font-medium opacity-50">₫</span>
            </div>
            <div
              className="flex items-center gap-2 text-sm font-semibold"
              style={{ color: "var(--md-secondary)" }}
            >
              <TrendingUp className="size-4" />
              14.2% so với tháng trước
            </div>
          </div>
          <div
            className="absolute right-0 top-0 flex h-full w-1/3 items-center justify-center"
            style={{
              background:
                "linear-gradient(to left, color-mix(in srgb, var(--md-secondary-container) 20%, transparent), transparent)",
            }}
          >
            <Receipt
              className="size-24 translate-x-1/4 opacity-10"
              style={{ color: "var(--md-secondary)" }}
            />
          </div>
        </div>
      </div>

      {/* Table Section */}
      <div
        className="overflow-hidden rounded-3xl ambient-shadow"
        style={{
          backgroundColor: "var(--md-surface-lowest)",
          border:
            "1px solid color-mix(in srgb, var(--md-outline-variant) 10%, transparent)",
        }}
      >
        {/* Table Toolbar */}
        <div
          className="flex items-center justify-between border-b p-6"
          style={{
            backgroundColor:
              "color-mix(in srgb, var(--md-surface-low) 30%, transparent)",
            borderColor:
              "color-mix(in srgb, var(--md-outline-variant) 5%, transparent)",
          }}
        >
          <div className="flex gap-4">
            <span
              className="rounded-full px-3 py-1 text-sm font-bold"
              style={{
                backgroundColor: "var(--md-surface-high)",
                color: "var(--md-on-surface-variant)",
              }}
            >
              Tất cả ({grns.length})
            </span>
            <span
              className="cursor-pointer px-3 py-1 text-sm font-medium opacity-60 hover:opacity-100"
              style={{ color: "var(--md-on-surface-variant)" }}
            >
              Mới nhất
            </span>
            <span
              className="cursor-pointer px-3 py-1 text-sm font-medium opacity-60 hover:opacity-100"
              style={{ color: "var(--md-on-surface-variant)" }}
            >
              Giá trị cao
            </span>
          </div>
          <button
            type="button"
            className="flex items-center gap-1 text-sm font-bold hover:underline"
            style={{ color: "var(--md-primary)" }}
          >
            Xuất báo cáo Excel
            <Download className="size-4" />
          </button>
        </div>

        <Table>
          <TableHeader>
            <TableRow
              style={{
                borderColor:
                  "color-mix(in srgb, var(--md-outline-variant) 10%, transparent)",
              }}
            >
              <TableHead
                className="px-8 py-5 text-caption font-bold uppercase tracking-widest"
                style={{ color: "var(--md-on-surface-variant)", opacity: 0.6 }}
              >
                Mã GRN
              </TableHead>
              <TableHead
                className="px-6 py-5 text-caption font-bold uppercase tracking-widest"
                style={{ color: "var(--md-on-surface-variant)", opacity: 0.6 }}
              >
                Nhà cung cấp
              </TableHead>
              <TableHead
                className="px-6 py-5 text-caption font-bold uppercase tracking-widest"
                style={{ color: "var(--md-on-surface-variant)", opacity: 0.6 }}
              >
                PO liên kết
              </TableHead>
              <TableHead
                className="px-6 py-5 text-caption font-bold uppercase tracking-widest"
                style={{ color: "var(--md-on-surface-variant)", opacity: 0.6 }}
              >
                Ngày nhận
              </TableHead>
              <TableHead
                className="px-6 py-5 text-caption font-bold uppercase tracking-widest"
                style={{ color: "var(--md-on-surface-variant)", opacity: 0.6 }}
              >
                Tổng tiền
              </TableHead>
              <TableHead
                className="px-6 py-5 text-caption font-bold uppercase tracking-widest"
                style={{ color: "var(--md-on-surface-variant)", opacity: 0.6 }}
              >
                Trạng thái
              </TableHead>
              <TableHead
                className="px-8 py-5 text-right text-caption font-bold uppercase tracking-widest"
                style={{ color: "var(--md-on-surface-variant)", opacity: 0.6 }}
              >
                Thao tác
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {grns.map((g) => (
              <TableRow
                key={g.id}
                className="group transition-colors"
                style={{
                  borderColor:
                    "color-mix(in srgb, var(--md-outline-variant) 5%, transparent)",
                  opacity: g.status === "cancelled" ? 0.6 : 1,
                }}
              >
                <TableCell className="px-8 py-6">
                  <Link
                    href={`/inventory/grn/${g.id}`}
                    className="font-bold hover:underline"
                    style={{ color: "var(--md-on-surface)" }}
                  >
                    {g.code}
                  </Link>
                </TableCell>
                <TableCell
                  className="px-6 py-6 text-sm font-medium"
                  style={{ color: "var(--md-on-surface)" }}
                >
                  {g.supplierName}
                </TableCell>
                <TableCell
                  className="px-6 py-6 font-mono text-sm"
                  style={{ color: "var(--md-on-surface-variant)" }}
                >
                  {g.poCode}
                </TableCell>
                <TableCell
                  className="px-6 py-6 text-sm"
                  style={{ color: "var(--md-on-surface-variant)" }}
                >
                  {g.date}
                </TableCell>
                <TableCell className="px-6 py-6 text-sm font-bold">
                  {formatVND(g.total)}{" "}
                  <span className="text-label opacity-40">₫</span>
                </TableCell>
                <TableCell className="px-6 py-6">
                  <StatusBadge status={g.status} />
                </TableCell>
                <TableCell className="px-8 py-6 text-right">
                  <button
                    type="button"
                    className="rounded-lg p-2 opacity-0 transition-all group-hover:opacity-100"
                    style={{ color: "var(--md-on-surface-variant)" }}
                  >
                    <MoreVertical className="size-5" />
                  </button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
