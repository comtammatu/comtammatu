"use client";

import { useState } from "react";
import {
  AlertOctagon,
  AlertTriangle,
  Bell,
  Clock,
  Lightbulb,
  Trash2,
} from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
import { expiryAlerts } from "../_components/mock-data";

const tabs = ["Tất cả", "expired", "critical", "warning"] as const;
const tabLabels: Record<string, string> = {
  "Tất cả": "Tất cả",
  expired: "Đã hết hạn",
  critical: "Sắp hết hạn",
  warning: "Theo dõi",
};

export default function ExpiryPage() {
  const [activeTab, setActiveTab] = useState<string>("Tất cả");
  const filtered =
    activeTab === "Tất cả"
      ? expiryAlerts
      : expiryAlerts.filter((e) => e.urgency === activeTab);
  const expiredCount = expiryAlerts.filter(
    (e) => e.urgency === "expired",
  ).length;
  const criticalCount = expiryAlerts.filter(
    (e) => e.urgency === "critical",
  ).length;
  const warningCount = expiryAlerts.filter(
    (e) => e.urgency === "warning",
  ).length;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div>
          <h2
            className="text-2xl font-bold tracking-tight"
            style={{ color: "var(--md-on-surface)" }}
          >
            Cảnh báo Hạn sử dụng
          </h2>
          <p
            className="mt-2 max-w-lg text-sm"
            style={{ color: "var(--md-on-surface-variant)" }}
          >
            Theo dõi và quản lý các mặt hàng sắp hết hạn hoặc đã quá hạn để đảm
            bảo chất lượng nguyên liệu.
          </p>
        </div>
        <button
          type="button"
          className="flex items-center gap-2 rounded-xl px-5 py-2.5 font-bold text-white"
          style={{ backgroundColor: "var(--md-error)" }}
        >
          <Trash2 className="size-4" />
          Hủy tất cả hàng đã hết hạn
        </button>
      </div>

      {/* Stats Grid with Icon Badges */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {/* Expired */}
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
              <AlertOctagon
                className="size-5"
                style={{ color: "var(--md-on-error-container)" }}
              />
            </div>
            <span
              className="text-[10px] font-semibold uppercase tracking-widest"
              style={{ color: "var(--md-outline-variant)" }}
            >
              Quá hạn
            </span>
          </div>
          <h3
            className="text-3xl font-black tracking-tight"
            style={{ color: "var(--md-error)" }}
          >
            {String(expiredCount).padStart(2, "0")}
          </h3>
          <p
            className="mt-1 text-sm"
            style={{ color: "var(--md-on-surface-variant)" }}
          >
            Mặt hàng đã hết hạn
          </p>
        </div>

        {/* Critical */}
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
              style={{ backgroundColor: "var(--md-primary-fixed)" }}
            >
              <AlertTriangle
                className="size-5"
                style={{ color: "var(--md-primary)" }}
              />
            </div>
            <span
              className="text-[10px] font-semibold uppercase tracking-widest"
              style={{ color: "var(--md-outline-variant)" }}
            >
              3 ngày tới
            </span>
          </div>
          <h3
            className="text-3xl font-black tracking-tight"
            style={{ color: "var(--md-primary)" }}
          >
            {String(criticalCount).padStart(2, "0")}
          </h3>
          <p
            className="mt-1 text-sm"
            style={{ color: "var(--md-on-surface-variant)" }}
          >
            Hết hạn trong 3 ngày tới
          </p>
        </div>

        {/* Warning */}
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
              <Clock
                className="size-5"
                style={{ color: "var(--md-tertiary)" }}
              />
            </div>
            <span
              className="text-[10px] font-semibold uppercase tracking-widest"
              style={{ color: "var(--md-outline-variant)" }}
            >
              7 ngày tới
            </span>
          </div>
          <h3
            className="text-3xl font-black tracking-tight"
            style={{ color: "var(--md-tertiary)" }}
          >
            {String(warningCount).padStart(2, "0")}
          </h3>
          <p
            className="mt-1 text-sm"
            style={{ color: "var(--md-on-surface-variant)" }}
          >
            Hết hạn trong 7 ngày tới
          </p>
        </div>
      </div>

      {/* Segmented Tabs */}
      <div
        className="flex gap-1 rounded-2xl p-1"
        style={{ backgroundColor: "var(--md-surface-low)" }}
      >
        {tabs.map((tab) => {
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
            </button>
          );
        })}
      </div>

      {/* Data Table */}
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
              {[
                "Nguyên liệu",
                "Số lô",
                "Ngày hết hạn",
                "Ngày còn lại",
                "Phiếu nhập",
                "Chi nhánh",
                "Thao tác",
              ].map((h) => (
                <TableHead
                  key={h}
                  className={`px-6 py-4 text-xs font-bold uppercase tracking-widest ${h === "Ngày còn lại" ? "text-center" : ""} ${h === "Thao tác" ? "text-right" : ""}`}
                  style={{ color: "var(--md-outline)" }}
                >
                  {h}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((item) => (
              <TableRow
                key={item.id}
                className="transition-colors"
                style={{
                  borderColor:
                    "color-mix(in srgb, var(--md-outline-variant) 10%, transparent)",
                }}
              >
                <TableCell className="px-6 py-5 text-sm font-semibold">
                  {item.ingredientName}
                </TableCell>
                <TableCell
                  className="px-6 py-5 font-mono text-sm"
                  style={{ color: "var(--md-on-surface-variant)" }}
                >
                  {item.lot}
                </TableCell>
                <TableCell className="px-6 py-5 text-sm">
                  {item.expiryDate}
                </TableCell>
                <TableCell className="px-6 py-5 text-center">
                  <span
                    className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold"
                    style={
                      item.urgency === "expired"
                        ? {
                            backgroundColor:
                              "color-mix(in srgb, var(--md-error) 15%, transparent)",
                            color: "var(--md-error)",
                          }
                        : item.urgency === "critical"
                          ? {
                              backgroundColor: "var(--md-primary-fixed)",
                              color: "var(--md-primary)",
                            }
                          : {
                              backgroundColor:
                                "color-mix(in srgb, var(--md-tertiary) 15%, transparent)",
                              color: "var(--md-tertiary)",
                            }
                    }
                  >
                    {item.daysLeft <= 0
                      ? `Đã hết hạn ${Math.abs(item.daysLeft)} ngày`
                      : `Còn ${item.daysLeft} ngày`}
                  </span>
                </TableCell>
                <TableCell
                  className="px-6 py-5 font-mono text-sm"
                  style={{ color: "var(--md-primary)" }}
                >
                  {item.grnCode}
                </TableCell>
                <TableCell className="px-6 py-5 text-sm">
                  {item.branchName}
                </TableCell>
                <TableCell className="px-6 py-5 text-right">
                  {item.urgency === "expired" ? (
                    <Button variant="destructive" size="sm" className="gap-1">
                      <Trash2 className="size-3" /> Hủy hàng
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm">
                      Chi tiết
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Tips */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div
          className="flex items-start gap-3 rounded-xl border p-4"
          style={{
            borderColor:
              "color-mix(in srgb, var(--md-primary) 20%, transparent)",
            backgroundColor:
              "color-mix(in srgb, var(--md-primary) 5%, transparent)",
          }}
        >
          <Lightbulb
            className="mt-0.5 size-5 shrink-0"
            style={{ color: "var(--md-primary)" }}
          />
          <div>
            <p className="text-sm font-semibold">Gợi ý tối ưu hóa</p>
            <p
              className="mt-1 text-xs"
              style={{ color: "var(--md-on-surface-variant)" }}
            >
              Dựa trên dữ liệu 30 ngày qua, tỷ lệ hàng quá hạn tại CN Quận 1 cao
              hơn 15% so với trung bình. Hệ thống đề xuất điều chuyển nguyên
              liệu sớm sang các chi nhánh có lượng tiêu thụ cao hơn.
            </p>
          </div>
        </div>
        <div
          className="rounded-xl border p-4"
          style={{
            borderColor:
              "color-mix(in srgb, var(--md-outline-variant) 30%, transparent)",
            backgroundColor:
              "color-mix(in srgb, var(--md-surface-low) 50%, transparent)",
          }}
        >
          <p className="text-sm font-semibold">Thông báo tự động</p>
          <p
            className="mt-1 text-xs"
            style={{ color: "var(--md-on-surface-variant)" }}
          >
            Cài đặt nhắc báo qua Email hoặc Zalo cho quản lý kho khi hàng hóa
            còn dưới 5 ngày sử dụng.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <Bell className="size-4" style={{ color: "var(--md-secondary)" }} />
            <span
              className="text-xs font-medium"
              style={{ color: "var(--md-secondary)" }}
            >
              Đã bật Email
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
