"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ChefHat,
  ClipboardList,
  Clock,
  FileDown,
  FilterX,
  MoreVertical,
  Plus,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
import { StatusBadge, SearchableSelect } from "../_components/shared";
import { stockIssues } from "../_components/mock-data";

export default function IssuesPage() {
  const [activeStatus, setActiveStatus] = useState("all");
  const [activeType, setActiveType] = useState("all");

  const filtered = stockIssues
    .filter((i) => activeStatus === "all" || i.status === activeStatus)
    .filter((i) => activeType === "all" || i.type === activeType);

  const draftCount = stockIssues.filter((i) => i.status === "draft").length;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div>
          <h2
            className="text-2xl font-bold tracking-tight"
            style={{ color: "var(--md-on-surface)" }}
          >
            Phiếu xuất kho
          </h2>
          <p
            className="mt-2 max-w-lg text-sm"
            style={{ color: "var(--md-on-surface-variant)" }}
          >
            Quản lý các hoạt động tiêu hao, hỏng hóc và sử dụng nội bộ tại bếp
            trung tâm và các chi nhánh.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="flex items-center gap-2 rounded-full border px-5 py-2.5 font-semibold shadow-sm transition-all"
            style={{
              backgroundColor: "var(--md-surface-lowest)",
              borderColor:
                "color-mix(in srgb, var(--md-outline-variant) 30%, transparent)",
              color: "var(--md-on-surface)",
            }}
          >
            <FileDown className="size-4" />
            <span>Xuất báo cáo</span>
          </button>
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
            <span>Tạo phiếu mới</span>
          </button>
        </div>
      </div>

      {/* Stats Bento Grid */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-4">
        {/* Total */}
        <div
          className="rounded-2xl p-6 ambient-shadow"
          style={{
            backgroundColor: "var(--md-surface-lowest)",
            border:
              "1px solid color-mix(in srgb, var(--md-outline-variant) 10%, transparent)",
          }}
        >
          <div className="mb-4 flex items-start justify-between">
            <div
              className="flex size-10 items-center justify-center rounded-xl"
              style={{
                backgroundColor:
                  "color-mix(in srgb, var(--md-tertiary) 15%, transparent)",
              }}
            >
              <ClipboardList
                className="size-5"
                style={{ color: "var(--md-tertiary)" }}
              />
            </div>
            <span
              className="text-label font-semibold uppercase tracking-widest"
              style={{ color: "var(--md-outline-variant)" }}
            >
              Tháng này
            </span>
          </div>
          <h3 className="text-3xl font-black tracking-tight">
            {stockIssues.length}
          </h3>
          <p
            className="mt-1 text-sm"
            style={{ color: "var(--md-on-surface-variant)" }}
          >
            Tổng phiếu đã xuất
          </p>
        </div>

        {/* Kitchen Use */}
        <div
          className="rounded-2xl p-6 ambient-shadow"
          style={{
            backgroundColor: "var(--md-surface-lowest)",
            border:
              "1px solid color-mix(in srgb, var(--md-outline-variant) 10%, transparent)",
          }}
        >
          <div className="mb-4 flex items-start justify-between">
            <div
              className="flex size-10 items-center justify-center rounded-xl"
              style={{ backgroundColor: "var(--md-secondary-container)" }}
            >
              <ChefHat
                className="size-5"
                style={{ color: "var(--md-secondary)" }}
              />
            </div>
            <span
              className="text-label font-semibold uppercase tracking-widest"
              style={{ color: "var(--md-outline-variant)" }}
            >
              Sử dụng bếp
            </span>
          </div>
          <h3
            className="text-3xl font-black tracking-tight"
            style={{ color: "var(--md-secondary)" }}
          >
            86
          </h3>
          <p
            className="mt-1 text-sm"
            style={{ color: "var(--md-on-surface-variant)" }}
          >
            Chiếm 60% tỉ lệ xuất
          </p>
        </div>

        {/* Write-off */}
        <div
          className="rounded-2xl p-6 ambient-shadow"
          style={{
            backgroundColor: "var(--md-surface-lowest)",
            border:
              "1px solid color-mix(in srgb, var(--md-outline-variant) 10%, transparent)",
          }}
        >
          <div className="mb-4 flex items-start justify-between">
            <div
              className="flex size-10 items-center justify-center rounded-xl"
              style={{ backgroundColor: "var(--md-error-container)" }}
            >
              <AlertTriangle
                className="size-5"
                style={{ color: "var(--md-on-error-container)" }}
              />
            </div>
            <span
              className="text-label font-semibold uppercase tracking-widest"
              style={{ color: "var(--md-outline-variant)" }}
            >
              Hư hỏng
            </span>
          </div>
          <h3
            className="text-3xl font-black tracking-tight"
            style={{ color: "var(--md-error)" }}
          >
            12
          </h3>
          <p
            className="mt-1 text-sm"
            style={{ color: "var(--md-on-surface-variant)" }}
          >
            Cần tối ưu quy trình
          </p>
        </div>

        {/* Pending */}
        <div
          className="rounded-2xl p-6 ambient-shadow"
          style={{
            backgroundColor: "var(--md-surface-lowest)",
            border:
              "1px solid color-mix(in srgb, var(--md-outline-variant) 10%, transparent)",
          }}
        >
          <div className="mb-4 flex items-start justify-between">
            <div
              className="flex size-10 items-center justify-center rounded-xl"
              style={{ backgroundColor: "var(--md-surface-highest)" }}
            >
              <Clock
                className="size-5"
                style={{ color: "var(--md-on-surface-variant)" }}
              />
            </div>
            <span
              className="text-label font-semibold uppercase tracking-widest"
              style={{ color: "var(--md-outline-variant)" }}
            >
              Chờ duyệt
            </span>
          </div>
          <h3 className="text-3xl font-black tracking-tight">
            {String(draftCount).padStart(2, "0")}
          </h3>
          <p
            className="mt-1 text-sm"
            style={{ color: "var(--md-on-surface-variant)" }}
          >
            Phiếu nháp hiện có
          </p>
        </div>
      </div>

      {/* Filters Bar */}
      <div
        className="flex flex-wrap items-center justify-between gap-4 rounded-2xl px-6 py-4"
        style={{
          backgroundColor: "var(--md-surface-low)",
          border:
            "1px solid color-mix(in srgb, var(--md-outline-variant) 10%, transparent)",
        }}
      >
        <div className="flex items-center gap-6">
          <div className="flex flex-col gap-1">
            <label
              className="text-label font-semibold uppercase tracking-widest"
              style={{ color: "var(--md-outline)" }}
            >
              Trạng thái
            </label>
            <SearchableSelect
              options={[
                { value: "all", label: "Tất cả trạng thái" },
                { value: "draft", label: "Draft" },
                { value: "confirmed", label: "Confirmed" },
                { value: "cancelled", label: "Cancelled" },
              ]}
              value={activeStatus}
              onValueChange={setActiveStatus}
              placeholder="Tất cả trạng thái"
              searchPlaceholder="Tìm trạng thái..."
              variant="ghost"
              style={{ color: "var(--md-on-surface)" }}
            />
          </div>
          <div
            className="h-8 w-px"
            style={{
              backgroundColor:
                "color-mix(in srgb, var(--md-outline-variant) 30%, transparent)",
            }}
          />
          <div className="flex flex-col gap-1">
            <label
              className="text-label font-semibold uppercase tracking-widest"
              style={{ color: "var(--md-outline)" }}
            >
              Loại xuất
            </label>
            <SearchableSelect
              options={[
                { value: "all", label: "Tất cả loại xuất" },
                { value: "consumption", label: "Consumption" },
                { value: "write_off", label: "Write-off" },
                { value: "kitchen_use", label: "Kitchen Use" },
              ]}
              value={activeType}
              onValueChange={setActiveType}
              placeholder="Tất cả loại xuất"
              searchPlaceholder="Tìm loại xuất..."
              variant="ghost"
              style={{ color: "var(--md-on-surface)" }}
            />
          </div>
        </div>
        <button
          type="button"
          className="flex items-center gap-1 text-sm font-medium hover:underline"
          style={{ color: "var(--md-primary)" }}
          onClick={() => {
            setActiveStatus("all");
            setActiveType("all");
          }}
        >
          <FilterX className="size-4" />
          Xoá bộ lọc
        </button>
      </div>

      {/* Table */}
      <div
        className="overflow-hidden rounded-3xl ambient-shadow"
        style={{
          backgroundColor: "var(--md-surface-lowest)",
          border:
            "1px solid color-mix(in srgb, var(--md-outline-variant) 5%, transparent)",
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
              <TableHead
                className="px-6 py-5 text-label font-bold uppercase tracking-widest"
                style={{ color: "var(--md-outline)" }}
              >
                Mã phiếu
              </TableHead>
              <TableHead
                className="px-6 py-5 text-label font-bold uppercase tracking-widest"
                style={{ color: "var(--md-outline)" }}
              >
                Loại xuất
              </TableHead>
              <TableHead
                className="px-6 py-5 text-label font-bold uppercase tracking-widest"
                style={{ color: "var(--md-outline)" }}
              >
                Chi nhánh
              </TableHead>
              <TableHead
                className="px-6 py-5 text-label font-bold uppercase tracking-widest"
                style={{ color: "var(--md-outline)" }}
              >
                Ngày tạo
              </TableHead>
              <TableHead
                className="px-6 py-5 text-label font-bold uppercase tracking-widest"
                style={{ color: "var(--md-outline)" }}
              >
                Người tạo
              </TableHead>
              <TableHead
                className="px-6 py-5 text-label font-bold uppercase tracking-widest"
                style={{ color: "var(--md-outline)" }}
              >
                Trạng thái
              </TableHead>
              <TableHead
                className="px-6 py-5 text-right text-label font-bold uppercase tracking-widest"
                style={{ color: "var(--md-outline)" }}
              >
                Thao tác
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((item) => (
              <TableRow
                key={item.id}
                className="group transition-colors"
                style={{
                  borderColor:
                    "color-mix(in srgb, var(--md-surface-low) 100%, transparent)",
                }}
              >
                <TableCell className="px-6 py-5">
                  <Link
                    href={`/demo/inventory/issues/${item.code}`}
                    className="text-sm font-bold hover:underline"
                    style={{ color: "var(--md-on-surface)" }}
                  >
                    {item.code}
                  </Link>
                </TableCell>
                <TableCell className="px-6 py-5">
                  <StatusBadge status={item.type} />
                </TableCell>
                <TableCell
                  className="px-6 py-5 text-sm font-medium"
                  style={{ color: "var(--md-on-surface-variant)" }}
                >
                  {item.branchName}
                </TableCell>
                <TableCell
                  className="px-6 py-5 text-sm"
                  style={{ color: "var(--md-on-surface-variant)" }}
                >
                  {item.date}
                </TableCell>
                <TableCell className="px-6 py-5">
                  <div className="flex items-center gap-2">
                    <div
                      className="flex size-6 items-center justify-center rounded-full text-label font-bold"
                      style={{
                        backgroundColor: "var(--md-surface-highest)",
                      }}
                    >
                      {item.createdBy
                        .split(" ")
                        .map((w) => w[0])
                        .join("")
                        .slice(0, 2)}
                    </div>
                    <span
                      className="text-sm"
                      style={{ color: "var(--md-on-surface-variant)" }}
                    >
                      {item.createdBy}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="px-6 py-5">
                  <StatusBadge status={item.status} />
                </TableCell>
                <TableCell className="px-6 py-5 text-right">
                  <button
                    type="button"
                    className="transition-colors"
                    style={{ color: "var(--md-outline)" }}
                  >
                    <MoreVertical className="size-5" />
                  </button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {/* Pagination */}
        <div
          className="flex items-center justify-between border-t px-6 py-4"
          style={{
            borderColor:
              "color-mix(in srgb, var(--md-outline-variant) 10%, transparent)",
          }}
        >
          <span
            className="text-xs font-medium"
            style={{ color: "var(--md-outline)" }}
          >
            Hiển thị {filtered.length} / {stockIssues.length} phiếu
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-full border px-3 py-1.5 text-xs font-medium"
              style={{
                borderColor: "var(--md-outline-variant)",
                color: "var(--md-outline)",
              }}
            >
              ← Trước
            </button>
            <span
              className="flex size-8 items-center justify-center rounded-full text-xs font-bold text-white"
              style={{ backgroundColor: "var(--md-primary)" }}
            >
              1
            </span>
            <button
              type="button"
              className="rounded-full border px-3 py-1.5 text-xs font-medium"
              style={{
                borderColor: "var(--md-outline-variant)",
                color: "var(--md-outline)",
              }}
            >
              Sau →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
