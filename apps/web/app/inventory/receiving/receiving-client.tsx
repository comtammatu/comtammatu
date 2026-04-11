"use client";

import Link from "next/link";
import {
  ArrowRight,
  ClipboardCheck,
  FileText,
  Lightbulb,
  ShoppingCart,
  Zap,
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

export type ReceivingProps = {
  poCount: number;
  grnCount: number;
  invoiceCount: number;
};

const recentActivity = [
  {
    code: "#PO-2604-005",
    supplier: "C.P. Việt Nam",
    date: "Hôm nay, 08:30",
    status: "sent" as const,
    total: 18_750_000,
  },
  {
    code: "#GRN-2604-002",
    supplier: "Rau Củ Đà Lạt Fresh",
    date: "Hôm qua, 16:35",
    status: "confirmed" as const,
    total: 3_680_000,
  },
  {
    code: "#INV-2604-091",
    supplier: "Gia vị Cholimex",
    date: "01/04, 10:00",
    status: "discrepancy" as const,
    total: 5_400_000,
  },
  {
    code: "#PO-2604-006",
    supplier: "Thịt Sạch FreshFood",
    date: "08/04, 14:20",
    status: "sent" as const,
    total: 8_900_000,
  },
];

export function ReceivingClient({
  poCount,
  grnCount,
  invoiceCount,
}: ReceivingProps) {
  const steps = [
    {
      step: 1,
      icon: ShoppingCart,
      label: "Đơn đặt hàng (PO)",
      count: poCount,
      sub: "Đơn đang chờ duyệt/gửi",
      href: "/inventory/purchase-orders",
      btnLabel: "Quản lý Đơn đặt hàng",
      color: "var(--md-primary)",
    },
    {
      step: 2,
      icon: ClipboardCheck,
      label: "Nhận hàng (GRN)",
      count: grnCount,
      sub: "Phiếu đang chờ xác nhận",
      href: "/inventory/grn",
      btnLabel: "Quản lý Nhận hàng",
      color: "var(--md-secondary)",
    },
    {
      step: 3,
      icon: FileText,
      label: "Hóa đơn (Invoice)",
      count: invoiceCount,
      sub: "Hóa đơn cần đối soát 3-way",
      href: "/inventory/supplier-invoices",
      btnLabel: "Quản lý Hóa đơn",
      color: "var(--md-tertiary)",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2
          className="text-2xl font-bold tracking-tight"
          style={{ color: "var(--md-on-surface)" }}
        >
          Trung tâm Nhập kho
        </h2>
        <p
          className="mt-1 text-sm"
          style={{ color: "var(--md-on-surface-variant)", opacity: 0.8 }}
        >
          Quản lý quy trình cung ứng từ đặt hàng đến đối soát hóa đơn.
        </p>
      </div>

      {/* Workflow Stepper Bento Grid */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {steps.map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.step}
              className="group relative overflow-hidden rounded-xl p-8 shadow-sm transition-shadow hover:shadow-md ambient-shadow"
              style={{ backgroundColor: "var(--md-surface-lowest)" }}
            >
              {/* Watermark icon */}
              <div className="absolute right-4 top-4 opacity-5 transition-opacity group-hover:opacity-10">
                <Icon className="size-24" />
              </div>

              {/* Step number + label */}
              <div className="mb-6 flex items-center gap-3">
                <span
                  className="flex size-8 items-center justify-center rounded-full font-bold text-white"
                  style={{ backgroundColor: "var(--md-primary)" }}
                >
                  {item.step}
                </span>
                <h3 className="text-xl font-bold">{item.label}</h3>
              </div>

              {/* Count */}
              <div className="mb-8">
                <span
                  className="text-4xl font-black tracking-tighter"
                  style={{ color: item.color }}
                >
                  {String(item.count).padStart(2, "0")}
                </span>
                <p
                  className="mt-1 text-sm"
                  style={{ color: "var(--md-on-surface-variant)" }}
                >
                  {item.sub}
                </p>
              </div>

              {/* CTA button */}
              <Link
                href={item.href}
                className="flex w-full items-center justify-center gap-2 rounded-full border-b-2 py-3 font-bold transition-all"
                style={{
                  backgroundColor: "var(--md-surface-low)",
                  color: item.color,
                  borderColor: `color-mix(in srgb, ${item.color} 10%, transparent)`,
                }}
              >
                {item.btnLabel}
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
              </Link>
            </div>
          );
        })}
      </div>

      {/* Activity + Sidebar */}
      <div className="grid gap-8 lg:grid-cols-4">
        {/* Recent Activity Table */}
        <div className="lg:col-span-3">
          <div className="mb-6 flex items-center justify-between">
            <h3 className="text-lg font-bold">Hoạt động gần đây</h3>
            <button
              type="button"
              className="text-sm font-semibold hover:underline"
              style={{ color: "var(--md-primary)" }}
            >
              Xem tất cả
            </button>
          </div>
          <div
            className="overflow-hidden rounded-xl ambient-shadow"
            style={{ backgroundColor: "var(--md-surface-lowest)" }}
          >
            <Table>
              <TableHeader>
                <TableRow
                  style={{
                    backgroundColor:
                      "color-mix(in srgb, var(--md-surface-low) 50%, transparent)",
                    borderColor:
                      "color-mix(in srgb, var(--md-outline-variant) 10%, transparent)",
                  }}
                >
                  {[
                    "Mã Phiếu",
                    "Nhà Cung Cấp",
                    "Ngày",
                    "Trạng Thái",
                    "Tổng Tiền",
                  ].map((h) => (
                    <TableHead
                      key={h}
                      className={`px-6 py-4 text-xs font-bold uppercase tracking-wider ${h === "Tổng Tiền" ? "text-right" : ""}`}
                      style={{
                        color: "var(--md-on-surface-variant)",
                        opacity: 0.6,
                      }}
                    >
                      {h}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentActivity.map((item) => (
                  <TableRow
                    key={item.code}
                    className="transition-colors"
                    style={{
                      borderColor:
                        "color-mix(in srgb, var(--md-surface-low) 100%, transparent)",
                    }}
                  >
                    <TableCell className="px-6 py-4 font-mono text-sm font-medium">
                      {item.code}
                    </TableCell>
                    <TableCell className="px-6 py-4 text-sm font-semibold">
                      {item.supplier}
                    </TableCell>
                    <TableCell
                      className="px-6 py-4 text-sm"
                      style={{ color: "var(--md-on-surface-variant)" }}
                    >
                      {item.date}
                    </TableCell>
                    <TableCell className="px-6 py-4">
                      <StatusBadge status={item.status} />
                    </TableCell>
                    <TableCell
                      className="px-6 py-4 text-right text-sm font-bold"
                      style={{ color: "var(--md-primary)" }}
                    >
                      {formatVND(item.total)}đ
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Quick Actions */}
          <div
            className="rounded-xl p-5 ambient-shadow"
            style={{ backgroundColor: "var(--md-surface-lowest)" }}
          >
            <h4
              className="mb-3 text-sm font-semibold"
              style={{ color: "var(--md-on-surface)" }}
            >
              Thao tác nhanh
            </h4>
            <div className="space-y-2">
              <Link
                href="/inventory/purchase-orders/new"
                className="flex w-full items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-medium transition-colors"
                style={{
                  borderColor:
                    "color-mix(in srgb, var(--md-outline-variant) 30%, transparent)",
                }}
              >
                <Zap
                  className="size-4"
                  style={{ color: "var(--md-primary)" }}
                />
                Tạo PO nhanh
              </Link>
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-medium transition-colors"
                style={{
                  borderColor:
                    "color-mix(in srgb, var(--md-outline-variant) 30%, transparent)",
                }}
              >
                Nhập hàng không qua PO
              </button>
            </div>
          </div>

          {/* Tip Card */}
          <div
            className="rounded-xl p-5"
            style={{
              backgroundColor:
                "color-mix(in srgb, var(--md-surface-low) 50%, transparent)",
            }}
          >
            <div className="flex items-center gap-2">
              <Lightbulb
                className="size-4"
                style={{ color: "var(--md-primary)" }}
              />
              <p
                className="text-xs font-semibold"
                style={{ color: "var(--md-on-surface-variant)" }}
              >
                Mẹo quản lý
              </p>
            </div>
            <p
              className="mt-2 text-sm"
              style={{ color: "var(--md-on-surface-variant)" }}
            >
              Sử dụng quy trình 3-way matching để đảm bảo số lượng nhận thực tế
              khớp với đơn đặt và hóa đơn nhà cung cấp.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
