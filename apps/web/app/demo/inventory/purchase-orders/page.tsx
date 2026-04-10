"use client";

import { useState } from "react";
import Link from "next/link";
import { Calendar, FileUp, MoreVertical, PlusCircle } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
import { StatCard, StatusBadge } from "../_components/shared";
import { purchaseOrders, formatVND } from "../_components/mock-data";

const statusTabs = [
  "Tất cả",
  "draft",
  "sent",
  "received",
  "cancelled",
] as const;
const tabLabels: Record<string, string> = {
  "Tất cả": "Tất cả",
  draft: "Nháp",
  sent: "Đã gửi",
  received: "Đã nhận",
  cancelled: "Đã hủy",
};

export default function PurchaseOrdersPage() {
  const [activeTab, setActiveTab] = useState<string>("Tất cả");
  const filtered =
    activeTab === "Tất cả"
      ? purchaseOrders
      : purchaseOrders.filter((p) => p.status === activeTab);
  const totalValue = purchaseOrders.reduce((s, p) => s + p.total, 0);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h2
            className="text-2xl font-bold tracking-tight leading-tight"
            style={{ color: "var(--md-on-surface)" }}
          >
            Danh sách Đơn đặt hàng (PO)
          </h2>
        </div>
        <div className="flex gap-3">
          <Link
            href="/demo/inventory/grn"
            className="flex items-center gap-2 rounded-xl px-6 py-3 font-bold transition-opacity hover:opacity-90"
            style={{
              backgroundColor: "var(--md-secondary-container)",
              color: "var(--md-on-secondary-container)",
            }}
          >
            <FileUp className="size-4" />
            GRN
          </Link>
          <Link
            href="/demo/inventory/purchase-orders/new"
            className="flex items-center gap-2 rounded-xl px-8 py-3 font-bold text-white shadow-lg transition-transform hover:scale-[1.02]"
            style={{
              background:
                "linear-gradient(135deg, var(--md-primary), var(--md-primary-container))",
              boxShadow: "0 4px 14px rgba(158,61,0,0.2)",
            }}
          >
            <PlusCircle className="size-4" />
            Tạo PO Mới
          </Link>
        </div>
      </div>

      {/* Bento Tabs + Date Range */}
      <div className="grid grid-cols-12 gap-4">
        {/* Status Tabs - segmented control */}
        <div
          className="col-span-8 flex gap-1 rounded-2xl p-1"
          style={{ backgroundColor: "var(--md-surface-low)" }}
        >
          {statusTabs.map((tab) => {
            const count =
              tab === "Tất cả"
                ? purchaseOrders.length
                : purchaseOrders.filter((p) => p.status === tab).length;
            const isActive = activeTab === tab;
            return (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className="flex-1 rounded-xl py-2 text-sm font-medium transition-colors"
                style={
                  isActive
                    ? {
                        backgroundColor: "white",
                        color: "var(--md-primary)",
                        fontWeight: 700,
                        boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
                      }
                    : { color: "var(--md-on-surface-variant)" }
                }
              >
                {tabLabels[tab]}
                {isActive ? ` (${count})` : ""}
              </button>
            );
          })}
        </div>

        {/* Date Range */}
        <div
          className="col-span-4 flex items-center rounded-2xl px-4"
          style={{ backgroundColor: "var(--md-surface-low)" }}
        >
          <Calendar
            className="mr-2 size-4"
            style={{ color: "var(--md-on-surface-variant)" }}
          />
          <span
            className="text-sm font-medium"
            style={{ color: "var(--md-on-surface-variant)" }}
          >
            Tháng này: 01/04 - 30/04
          </span>
        </div>
      </div>

      {/* Data Table */}
      <div
        className="overflow-hidden rounded-3xl ambient-shadow"
        style={{
          backgroundColor: "var(--md-surface-lowest)",
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
                className="px-6 py-5 text-xs font-bold uppercase tracking-widest"
                style={{ color: "var(--md-outline)" }}
              >
                Mã PO
              </TableHead>
              <TableHead
                className="px-6 py-5 text-xs font-bold uppercase tracking-widest"
                style={{ color: "var(--md-outline)" }}
              >
                Nhà cung cấp
              </TableHead>
              <TableHead
                className="px-6 py-5 text-xs font-bold uppercase tracking-widest"
                style={{ color: "var(--md-outline)" }}
              >
                Trạng thái
              </TableHead>
              <TableHead
                className="px-6 py-5 text-xs font-bold uppercase tracking-widest"
                style={{ color: "var(--md-outline)" }}
              >
                Ngày đặt
              </TableHead>
              <TableHead
                className="px-6 py-5 text-xs font-bold uppercase tracking-widest"
                style={{ color: "var(--md-outline)" }}
              >
                Dự kiến giao
              </TableHead>
              <TableHead
                className="px-6 py-5 text-right text-xs font-bold uppercase tracking-widest"
                style={{ color: "var(--md-outline)" }}
              >
                Tổng tiền
              </TableHead>
              <TableHead
                className="px-6 py-5 text-xs font-bold uppercase tracking-widest"
                style={{ color: "var(--md-outline)" }}
              >
                Người tạo
              </TableHead>
              <TableHead className="px-6 py-5" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((po) => (
              <TableRow
                key={po.id}
                className="group transition-colors"
                style={{
                  borderColor:
                    "color-mix(in srgb, var(--md-surface-low) 100%, transparent)",
                }}
              >
                <TableCell className="px-6 py-5">
                  <Link
                    href={`/demo/inventory/purchase-orders/${po.code}`}
                    className="font-bold hover:underline"
                    style={{ color: "var(--md-primary)" }}
                  >
                    {po.code}
                  </Link>
                </TableCell>
                <TableCell className="px-6 py-5">
                  <div className="flex items-center gap-3">
                    <div
                      className="flex size-8 items-center justify-center rounded text-xs font-bold"
                      style={{
                        backgroundColor: "var(--md-surface-container)",
                        color: "var(--md-outline)",
                      }}
                    >
                      {po.supplierName
                        .split(" ")
                        .map((w) => w[0])
                        .join("")
                        .slice(0, 2)
                        .toUpperCase()}
                    </div>
                    <span className="text-sm font-medium">
                      {po.supplierName}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="px-6 py-5">
                  <StatusBadge status={po.status} />
                </TableCell>
                <TableCell
                  className="px-6 py-5 text-sm"
                  style={{ color: "var(--md-on-surface-variant)" }}
                >
                  {po.date}
                </TableCell>
                <TableCell
                  className="px-6 py-5 text-sm font-medium"
                  style={{ color: "var(--md-on-surface-variant)" }}
                >
                  {po.expectedDelivery ?? "—"}
                </TableCell>
                <TableCell className="px-6 py-5 text-right text-sm font-bold">
                  {formatVND(po.total)} ₫
                </TableCell>
                <TableCell className="px-6 py-5">
                  <div className="flex items-center gap-2">
                    <div
                      className="flex size-6 items-center justify-center rounded-full text-[10px] font-bold"
                      style={{ backgroundColor: "var(--md-surface-highest)" }}
                    >
                      {po.createdBy
                        .split(" ")
                        .map((w) => w[0])
                        .join("")
                        .slice(0, 2)}
                    </div>
                    <span
                      className="text-sm"
                      style={{ color: "var(--md-on-surface-variant)" }}
                    >
                      {po.createdBy}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="px-6 py-5 text-right">
                  <button
                    type="button"
                    className="opacity-0 transition-opacity group-hover:opacity-100"
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
            Hiển thị {filtered.length} / {purchaseOrders.length} đơn hàng
          </span>
          <div className="flex items-center gap-2">
            <span
              className="flex size-8 items-center justify-center rounded-lg text-xs font-bold text-white"
              style={{ backgroundColor: "var(--md-primary)" }}
            >
              1
            </span>
          </div>
        </div>
      </div>

      {/* Bottom Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          value={`${formatVND(totalValue)}đ`}
          label="Tổng giá trị đặt hàng"
          trend={{ value: "12%", positive: true }}
        />
        <StatCard value="02" label="Đơn chờ tiếp nhận" />
        <StatCard value="C.P. Việt Nam" label="NCC uy tín nhất" />
        <StatCard value="02" label="Đơn giao trễ hạn" />
      </div>
    </div>
  );
}
