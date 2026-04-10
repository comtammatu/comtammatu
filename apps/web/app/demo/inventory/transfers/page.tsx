"use client";

import { useState } from "react";
import Link from "next/link";
import {
  CheckCircle,
  Clock,
  Eye,
  Filter,
  Lightbulb,
  PlusCircle,
  Printer,
  Search,
  Truck,
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
import { transfers } from "../_components/mock-data";

export default function TransfersPage() {
  const [statusFilter, setStatusFilter] = useState("all");
  const [branchFilter, setBranchFilter] = useState("all");
  const inTransit = transfers.filter((t) => t.status === "in_transit").length;
  const awaiting = transfers.filter((t) => t.status === "confirmed").length;
  const completedToday = transfers.filter(
    (t) => t.status === "received",
  ).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h2
            className="text-2xl font-bold tracking-tight"
            style={{ color: "var(--md-on-surface)" }}
          >
            Luân chuyển nội bộ
          </h2>
          <p
            className="mt-1 text-sm"
            style={{ color: "var(--md-on-surface-variant)" }}
          >
            Quản lý dòng luân chuyển nguyên liệu giữa các chi nhánh.
          </p>
        </div>
        <button
          type="button"
          className="flex items-center gap-2 rounded-full px-6 py-2.5 font-bold text-white shadow-md transition-shadow hover:shadow-lg"
          style={{
            background:
              "linear-gradient(135deg, var(--md-primary), var(--md-primary-container))",
          }}
        >
          <PlusCircle className="size-4" />
          Tạo phiếu mới
        </button>
      </div>

      {/* Bento Summary Cards */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {[
          {
            icon: <Truck className="size-7" />,
            iconBg: "color-mix(in srgb, var(--md-tertiary) 10%, transparent)",
            iconColor: "var(--md-tertiary)",
            label: "Đang vận chuyển",
            value: String(inTransit).padStart(2, "0"),
          },
          {
            icon: <Clock className="size-7" />,
            iconBg: "color-mix(in srgb, var(--md-secondary) 10%, transparent)",
            iconColor: "var(--md-secondary)",
            label: "Chờ nhận",
            value: String(awaiting).padStart(2, "0"),
          },
          {
            icon: <CheckCircle className="size-7" />,
            iconBg: "color-mix(in srgb, var(--md-primary) 10%, transparent)",
            iconColor: "var(--md-primary)",
            label: "Hoàn thành hôm nay",
            value: String(completedToday).padStart(2, "0"),
          },
        ].map((card) => (
          <div
            key={card.label}
            className="flex items-center gap-5 rounded-2xl p-6"
            style={{ backgroundColor: "var(--md-surface-low)" }}
          >
            <div
              className="flex size-14 items-center justify-center rounded-full"
              style={{ backgroundColor: card.iconBg, color: card.iconColor }}
            >
              {card.icon}
            </div>
            <div>
              <p
                className="text-sm font-semibold uppercase tracking-wider"
                style={{ color: "var(--md-on-surface-variant)" }}
              >
                {card.label}
              </p>
              <p className="text-3xl font-black">{card.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filter Bar */}
      <div
        className="flex flex-wrap items-center gap-4 rounded-xl p-4"
        style={{ backgroundColor: "var(--md-surface-low)" }}
      >
        <div className="relative min-w-col-lg flex-1">
          <Search
            className="absolute left-3 top-2.5 size-4"
            style={{ color: "var(--md-outline)" }}
          />
          <input
            type="text"
            placeholder="Tìm mã phiếu, kho gửi..."
            className="w-full rounded-lg border-none py-2 pl-10 pr-4 text-sm outline-none focus:ring-2"
            style={{
              backgroundColor: "var(--md-surface-lowest)",
              // @ts-expect-error -- CSS custom property for focus ring
              "--tw-ring-color":
                "color-mix(in srgb, var(--md-primary) 20%, transparent)",
            }}
            readOnly
          />
        </div>
        <div className="flex items-center gap-3">
          <SearchableSelect
            options={[
              { value: "all", label: "Trạng thái" },
              { value: "in_transit", label: "Đang vận chuyển" },
              { value: "confirmed", label: "Chờ nhận" },
              { value: "received", label: "Hoàn thành" },
            ]}
            value={statusFilter}
            onValueChange={setStatusFilter}
            placeholder="Trạng thái"
            searchPlaceholder="Tìm trạng thái..."
            variant="pill"
            className="min-w-col-sm"
            style={{ backgroundColor: "var(--md-surface-lowest)" }}
          />
          <SearchableSelect
            options={[
              { value: "all", label: "Chi nhánh đến" },
              { value: "q1", label: "CN Quận 1" },
              { value: "q3", label: "CN Quận 3" },
              { value: "bt", label: "CN Bình Thạnh" },
            ]}
            value={branchFilter}
            onValueChange={setBranchFilter}
            placeholder="Chi nhánh đến"
            searchPlaceholder="Tìm chi nhánh..."
            variant="pill"
            className="min-w-col-sm"
            style={{ backgroundColor: "var(--md-surface-lowest)" }}
          />
          <button
            type="button"
            className="flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors"
            style={{
              backgroundColor: "var(--md-surface-highest)",
              color: "var(--md-on-surface-variant)",
            }}
          >
            <Filter className="size-4" />
            Lọc thêm
          </button>
        </div>
      </div>

      {/* Data Table */}
      <div
        className="overflow-hidden rounded-2xl ambient-shadow"
        style={{ backgroundColor: "var(--md-surface-lowest)" }}
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
                "Mã phiếu",
                "Kho gửi",
                "Kho nhận",
                "Trạng thái",
                "Ngày tạo",
                "Thao tác",
              ].map((h) => (
                <TableHead
                  key={h}
                  className="px-6 py-4 text-xs font-bold uppercase tracking-widest"
                  style={{ color: "var(--md-outline)" }}
                >
                  {h}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {transfers.map((t) => (
              <TableRow
                key={t.id}
                className="group transition-colors"
                style={{
                  borderColor:
                    "color-mix(in srgb, var(--md-surface-container) 100%, transparent)",
                }}
              >
                <TableCell className="px-6 py-5">
                  <Link
                    href={`/demo/inventory/transfers/${t.code}`}
                    className="font-bold tracking-tight hover:underline"
                    style={{ color: "var(--md-primary)" }}
                  >
                    {t.code}
                  </Link>
                </TableCell>
                <TableCell className="px-6 py-5 text-sm font-medium">
                  {t.fromBranch}
                </TableCell>
                <TableCell className="px-6 py-5 text-sm font-medium">
                  {t.toBranch}
                </TableCell>
                <TableCell className="px-6 py-5">
                  <StatusBadge status={t.status} />
                </TableCell>
                <TableCell
                  className="px-6 py-5 text-sm"
                  style={{ color: "var(--md-on-surface-variant)" }}
                >
                  {t.date}
                </TableCell>
                <TableCell className="px-6 py-5">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="rounded-md p-1.5 transition-colors"
                      style={{ color: "var(--md-outline)" }}
                    >
                      <Eye className="size-4" />
                    </button>
                    <button
                      type="button"
                      className="rounded-md p-1.5 transition-colors"
                      style={{ color: "var(--md-outline)" }}
                    >
                      <Printer className="size-4" />
                    </button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Optimization tip */}
      <div
        className="flex items-start gap-3 rounded-xl border p-4"
        style={{
          borderColor:
            "color-mix(in srgb, var(--md-secondary) 20%, transparent)",
          backgroundColor:
            "color-mix(in srgb, var(--md-secondary) 5%, transparent)",
        }}
      >
        <Lightbulb
          className="mt-0.5 size-5 shrink-0"
          style={{ color: "var(--md-secondary)" }}
        />
        <div>
          <p className="text-sm font-semibold">Gợi ý tối ưu vận chuyển</p>
          <p
            className="mt-0.5 text-xs"
            style={{ color: "var(--md-on-surface-variant)" }}
          >
            Có 3 mặt hàng sắp hết hạn tại{" "}
            <span className="font-medium">CN Quận 3</span>. Bạn có thể kết hợp
            vận chuyển 50kg gạo ST25 từ Kho Thủ Đức để tiết kiệm chi phí
            Logistics 15%.
          </p>
        </div>
      </div>
    </div>
  );
}
