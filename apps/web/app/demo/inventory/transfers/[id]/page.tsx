"use client";

import Link from "next/link";
import { ArrowLeft, MapPin, CheckCircle, Printer } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from "@comtammatu/ui/components/table";
import { StatusBadge, TimelineStepper } from "../../_components/shared";
import { formatVND } from "../../_components/mock-data";

const transfer = {
  code: "TRF-2604-001",
  status: "in_transit" as const,
  fromBranch: "Kho Trung tâm Quận 1",
  toBranch: "Chi nhánh Quận 3",
  createdBy: "Trần Anh Tuấn",
  date: "08/04/2026 09:15",
  note: "Ưu tiên luân chuyển Gạo tấm ST25 cho bếp sáng. Kiểm tra kỹ nhiệt độ thùng Thịt nướng khi nhận.",
  subtotal: 12_275_000,
  shipping: 175_000,
  total: 12_450_000,
  items: [
    {
      name: "Gạo tấm ST25 Đặc sản",
      sku: "GRA-001",
      qty: 50,
      unit: "Kg",
      cost: 28_000,
      total: 1_400_000,
      received: null,
    },
    {
      name: "Thịt cốt lết (Đã ướp)",
      sku: "MEAT-002",
      qty: 120,
      unit: "Kg",
      cost: 85_000,
      total: 10_200_000,
      received: null,
    },
    {
      name: "Mỡ hành thành phẩm",
      sku: "SAU-002",
      qty: 15,
      unit: "Lít",
      cost: 45_000,
      total: 675_000,
      received: null,
    },
  ],
};

export default function TransferDetailPage() {
  return (
    <div className="space-y-6">
      <Link
        href="/demo/inventory/transfers"
        className="inline-flex items-center gap-1 text-sm hover:underline"
        style={{ color: "var(--md-on-surface-variant)" }}
      >
        <ArrowLeft className="size-4" /> Chi tiết Phiếu luân chuyển
      </Link>

      {/* Header Identity Card */}
      <section
        className="relative overflow-hidden rounded-2xl p-8 shadow-sm"
        style={{ backgroundColor: "var(--md-surface-low)" }}
      >
        <div className="absolute right-8 top-8">
          <StatusBadge status={transfer.status} />
        </div>

        <div className="grid grid-cols-1 gap-12 md:grid-cols-3">
          {/* Column 1: Code */}
          <div className="space-y-4">
            <div>
              <p
                className="mb-1 text-label uppercase tracking-widest"
                style={{ color: "var(--md-outline)" }}
              >
                Mã phiếu
              </p>
              <h3 className="text-3xl font-black tracking-tight">
                {transfer.code}
              </h3>
            </div>
            <div>
              <p
                className="mb-1 text-label uppercase tracking-widest"
                style={{ color: "var(--md-outline)" }}
              >
                Cập nhật cuối
              </p>
              <p className="font-semibold">14:30 Hôm nay</p>
            </div>
          </div>

          {/* Column 2: Route */}
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
                Người tạo
              </p>
              <p className="font-semibold">{transfer.createdBy}</p>
            </div>
            <div>
              <p
                className="mb-1 text-label uppercase tracking-widest"
                style={{ color: "var(--md-outline)" }}
              >
                Ngày gửi
              </p>
              <p className="font-semibold">{transfer.date}</p>
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
                className="mb-1 text-label uppercase tracking-widest"
                style={{ color: "var(--md-outline)" }}
              >
                Tổng giá trị
              </p>
              <p
                className="text-2xl font-black"
                style={{ color: "var(--md-primary)" }}
              >
                {formatVND(transfer.total)}{" "}
                <span className="text-xs font-normal">VNĐ</span>
              </p>
            </div>
            <div>
              <p
                className="mb-1 text-label uppercase tracking-widest"
                style={{ color: "var(--md-outline)" }}
              >
                Tổng mặt hàng
              </p>
              <p className="text-lg font-bold tabular-nums">
                {String(transfer.items.length).padStart(2, "0")}
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
            { label: "Draft", completed: true },
            { label: "Đã gửi", completed: true },
            { label: "Đang vận chuyển", active: true },
            { label: "Đã nhận" },
          ]}
        />
      </section>

      {/* Route info */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          {
            label: "Kho gửi",
            value: transfer.fromBranch,
            icon: (
              <MapPin
                className="size-3"
                style={{ color: "var(--md-primary)" }}
              />
            ),
          },
          {
            label: "Kho nhận",
            value: transfer.toBranch,
            icon: (
              <MapPin
                className="size-3"
                style={{ color: "var(--md-tertiary)" }}
              />
            ),
          },
          { label: "Người tạo", value: transfer.createdBy, icon: null },
          { label: "Ngày gửi", value: transfer.date, icon: null },
        ].map((info) => (
          <div
            key={info.label}
            className="rounded-xl p-4"
            style={{
              backgroundColor: "var(--md-surface-lowest)",
              border:
                "1px solid color-mix(in srgb, var(--md-outline-variant) 15%, transparent)",
            }}
          >
            <p
              className="text-label uppercase tracking-widest"
              style={{ color: "var(--md-outline)" }}
            >
              {info.label}
            </p>
            <p className="mt-1 flex items-center gap-1 text-sm font-semibold">
              {info.icon} {info.value}
            </p>
          </div>
        ))}
      </div>

      {/* Note */}
      {transfer.note && (
        <div
          className="rounded-xl p-4"
          style={{
            backgroundColor:
              "color-mix(in srgb, var(--md-surface-low) 60%, transparent)",
            border:
              "1px solid color-mix(in srgb, var(--md-outline-variant) 15%, transparent)",
          }}
        >
          <p
            className="text-label font-medium uppercase tracking-widest"
            style={{ color: "var(--md-outline)" }}
          >
            Ghi chú vận chuyển
          </p>
          <p className="mt-1 text-sm italic">&ldquo;{transfer.note}&rdquo;</p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Items table */}
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
              <h4 className="text-lg font-bold">Danh sách nguyên liệu</h4>
              <button
                type="button"
                className="rounded-full px-4 py-2 text-sm font-bold transition-all"
                style={{
                  backgroundColor: "var(--md-secondary-container)",
                  color: "var(--md-on-secondary-container)",
                }}
              >
                Kiểm bổ sung
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
                    { label: "SL gửi", align: "text-right" },
                    { label: "Đơn vị", align: "" },
                    { label: "Giá WAC", align: "text-right" },
                    { label: "Thành tiền", align: "text-right" },
                    { label: "SL nhận", align: "text-right" },
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
                {transfer.items.map((item) => (
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
                    <TableCell className="px-6 py-4 text-right font-mono tabular-nums font-semibold">
                      {formatVND(item.qty)}
                    </TableCell>
                    <TableCell className="px-6 py-4">
                      <span
                        className="rounded px-2 py-1 text-xs font-medium"
                        style={{
                          backgroundColor: "var(--md-surface-container)",
                        }}
                      >
                        {item.unit}
                      </span>
                    </TableCell>
                    <TableCell className="px-6 py-4 text-right font-mono tabular-nums">
                      {formatVND(item.cost)}
                    </TableCell>
                    <TableCell className="px-6 py-4 text-right font-mono tabular-nums">
                      {formatVND(item.total)}
                    </TableCell>
                    <TableCell
                      className="px-6 py-4 text-right italic"
                      style={{ color: "var(--md-outline)" }}
                    >
                      Đang vận...
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
                    colSpan={4}
                    className="px-6 py-3 text-right text-sm"
                    style={{ color: "var(--md-on-surface-variant)" }}
                  >
                    Tạm tính
                  </TableCell>
                  <TableCell className="px-6 py-3 text-right font-mono tabular-nums">
                    {formatVND(transfer.subtotal)}đ
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
                    colSpan={4}
                    className="px-6 py-3 text-right text-sm"
                    style={{ color: "var(--md-on-surface-variant)" }}
                  >
                    Phí vận chuyển
                  </TableCell>
                  <TableCell className="px-6 py-3 text-right font-mono tabular-nums">
                    {formatVND(transfer.shipping)}đ
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
                    colSpan={4}
                    className="px-6 py-3 text-right text-sm font-bold"
                  >
                    Tổng thanh toán
                  </TableCell>
                  <TableCell
                    className="px-6 py-3 text-right font-mono tabular-nums font-bold"
                    style={{ color: "var(--md-primary)" }}
                  >
                    {formatVND(transfer.total)}đ
                  </TableCell>
                  <TableCell />
                </TableRow>
              </TableFooter>
            </Table>
          </section>
        </div>

        {/* Sidebar value card */}
        <div
          className="h-fit rounded-2xl p-6"
          style={{
            backgroundColor:
              "color-mix(in srgb, var(--md-primary) 5%, var(--md-surface-lowest))",
            border:
              "1px solid color-mix(in srgb, var(--md-primary) 20%, transparent)",
          }}
        >
          <p
            className="text-label uppercase tracking-widest"
            style={{ color: "var(--md-outline)" }}
          >
            Tổng giá trị luân chuyển
          </p>
          <p
            className="mt-2 text-2xl font-black tabular-nums"
            style={{ color: "var(--md-primary)" }}
          >
            {formatVND(transfer.total)} VNĐ
          </p>
          <div
            className="mt-3 rounded-lg p-3"
            style={{
              backgroundColor: "var(--md-surface-lowest)",
              border:
                "1px solid color-mix(in srgb, var(--md-outline-variant) 15%, transparent)",
            }}
          >
            <p
              className="text-label uppercase tracking-widest"
              style={{ color: "var(--md-outline)" }}
            >
              Tổng mặt hàng
            </p>
            <p className="text-lg font-bold tabular-nums">
              {String(transfer.items.length).padStart(2, "0")}
            </p>
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
          style={{
            backgroundColor: "var(--md-surface-high)",
            color: "var(--md-on-surface-variant)",
          }}
        >
          <Printer className="size-5" />
          In phiếu
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
          Xác nhận nhận hàng
        </button>
      </footer>
    </div>
  );
}
