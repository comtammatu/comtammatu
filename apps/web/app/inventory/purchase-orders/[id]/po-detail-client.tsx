"use client";

import Link from "next/link";
import {
  ArrowLeft,
  XCircle,
  CheckCircle,
} from "lucide-react";
import { cn, getSurfacePanelClassName } from "@comtammatu/ui";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from "@comtammatu/ui/components/table";
import {
  StatusBadge,
  TimelineStepper,
} from "../../_components/shared";
import { formatVND } from "../../_lib/format";
import { tRoute } from "../../_lib/dictionary";

export type PODetail = {
  code: string;
  status: string;
  supplier: string;
  date: string;
  sentAt: string;
  total: number;
  tax: number;
  grandTotal: number;
  supplierInfo: { address: string; contact: string; payment: string };
  items: Array<{
    name: string;
    sku: string;
    qty: number;
    unit: string;
    price: number;
    total: number;
    variance: number;
    trend: "up" | "down" | "stable";
  }>;
};

export function PODetailClient({ po }: { po: PODetail }) {
  const panelClassName = getSurfacePanelClassName("inventory", "ambient-shadow");
  const supplierInfoAvailable = [
    po.supplierInfo.address,
    po.supplierInfo.contact,
    po.supplierInfo.payment,
  ].some((value) => value && value !== "—");

  return (
    <div className="space-y-6">
      <Link
        href="/inventory/purchase-orders"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
      >
        <ArrowLeft className="size-4" />{" "}
        {tRoute("/inventory/purchase-orders", "heading")}
      </Link>

      {/* Header Identity Card */}
      <section
        className={cn(
          panelClassName,
          "relative overflow-hidden rounded-2xl bg-muted p-5 shadow-sm sm:p-6 lg:p-8",
        )}
      >
        <div className="absolute right-5 top-5 sm:right-6 sm:top-6 lg:right-8 lg:top-8">
          <StatusBadge status={po.status} />
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3 md:gap-8 lg:gap-12">
          <div className="space-y-4">
            <div>
              <p className="mb-1 text-label uppercase tracking-wider text-muted-foreground">
                Mã PO
              </p>
              <h3 className="text-3xl font-black tracking-tight">{po.code}</h3>
            </div>
            <div>
              <p className="mb-1 text-label uppercase tracking-wider text-muted-foreground">
                Nhà cung cấp
              </p>
              <p className="font-semibold">{po.supplier}</p>
            </div>
          </div>

          <div className="space-y-4 border-border/40 md:border-l md:pl-8 lg:pl-12">
            <div>
              <p className="mb-1 text-label uppercase tracking-wider text-muted-foreground">
                Ngày tạo
              </p>
              <p className="font-semibold">{po.date}</p>
            </div>
            <div>
              <p className="mb-1 text-label uppercase tracking-wider text-muted-foreground">
                Ngày gửi
              </p>
              <p className="font-semibold">{po.sentAt}</p>
            </div>
          </div>

          <div className="space-y-4 border-border/40 md:border-l md:pl-8 lg:pl-12">
            <div>
              <p className="mb-1 text-label uppercase tracking-wider text-muted-foreground">
                Tổng tiền hàng
              </p>
              <p className="text-sm font-semibold">{formatVND(po.total)} VNĐ</p>
            </div>
            <div>
              <p className="mb-1 text-label uppercase tracking-wider text-muted-foreground">
                Tổng cộng (incl. VAT)
              </p>
              <p className="text-2xl font-black text-primary">
                {formatVND(po.grandTotal)}{" "}
                <span className="text-xs font-normal">VNĐ</span>
              </p>
            </div>
          </div>
        </div>
      </section>

      <section
        className={cn(
          panelClassName,
          "flex justify-center overflow-hidden rounded-2xl bg-card py-6",
        )}
      >
        <TimelineStepper
          steps={[
            { label: "Nháp", date: po.date, completed: true },
            {
              label: "Đã gửi",
              date: po.sentAt,
              completed: po.status !== "draft",
            },
            { label: "Đang vận chuyển", active: po.status === "sent" },
            { label: "Đã nhận" },
          ]}
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <section
            className={cn(panelClassName, "overflow-hidden rounded-2xl bg-card")}
          >
            <div className="flex flex-col gap-3 border-b border-border/50 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
              <h4 className="text-lg font-bold">Chi tiết danh mục hàng</h4>
              <span className="text-xs font-medium text-muted-foreground">
                {po.items.length} mặt hàng
              </span>
            </div>

            <div className="space-y-3 p-4 md:hidden">
              {po.items.map((item) => (
                <div
                  key={item.sku}
                  className="rounded-2xl border border-border/70 bg-muted/20 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-bold">{item.name}</p>
                      <p className="text-xs text-muted-foreground">{item.sku}</p>
                    </div>
                    <div
                      className={cn(
                        "rounded-full px-2.5 py-1 text-xs font-semibold",
                        item.variance > 0
                          ? "bg-destructive/10 text-destructive"
                          : item.variance < 0
                            ? "bg-success/10 text-success"
                            : "bg-muted text-muted-foreground",
                      )}
                    >
                      {item.variance > 0 ? "+" : ""}
                      {item.variance}%
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-muted-foreground">Số lượng</p>
                      <p className="font-semibold">
                        {item.qty} {item.unit}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Đơn giá</p>
                      <p className="font-semibold">{formatVND(item.price)}đ</p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-muted-foreground">Thành tiền</p>
                      <p className="font-semibold text-primary">
                        {formatVND(item.total)}đ
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    {[
                      { label: "Mặt hàng", align: "" },
                      { label: "Số lượng", align: "text-right" },
                      { label: "Đơn giá", align: "text-right" },
                      { label: "Thành tiền", align: "text-right" },
                      { label: "Biến động giá", align: "text-right" },
                    ].map((h) => (
                      <TableHead
                        key={h.label}
                        className={`px-6 py-4 whitespace-nowrap text-label font-bold uppercase tracking-wider ${h.align}`}
                      >
                        {h.label}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {po.items.map((item) => (
                    <TableRow
                      key={item.sku}
                      className="group transition-colors"
                    >
                      <TableCell className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="font-bold">{item.name}</span>
                          <span className="text-label text-muted-foreground">
                            {item.sku}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="px-6 py-4 text-right font-mono tabular-nums">
                        {item.qty}
                      </TableCell>
                      <TableCell className="px-6 py-4 text-right font-mono tabular-nums">
                        {formatVND(item.price)}đ
                      </TableCell>
                      <TableCell className="px-6 py-4 text-right font-mono tabular-nums font-semibold">
                        {formatVND(item.total)}đ
                      </TableCell>
                      <TableCell className="px-6 py-4 text-right">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold",
                            item.variance > 0
                              ? "bg-destructive/10 text-destructive"
                              : item.variance < 0
                                ? "bg-success/10 text-success"
                                : "bg-muted text-muted-foreground",
                          )}
                        >
                          {item.variance > 0 ? "+" : ""}
                          {item.variance}%
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow className="border-border/50">
                    <TableCell
                      colSpan={3}
                      className="px-6 py-3 text-right text-sm text-muted-foreground"
                    >
                      Tổng tiền hàng
                    </TableCell>
                    <TableCell className="px-6 py-3 text-right font-mono tabular-nums font-semibold">
                      {formatVND(po.total)}đ
                    </TableCell>
                    <TableCell />
                  </TableRow>
                  <TableRow className="border-border/50">
                    <TableCell
                      colSpan={3}
                      className="px-6 py-3 text-right text-sm text-muted-foreground"
                    >
                      Thuế (VAT 8%)
                    </TableCell>
                    <TableCell className="px-6 py-3 text-right font-mono tabular-nums">
                      {formatVND(po.tax)}đ
                    </TableCell>
                    <TableCell />
                  </TableRow>
                  <TableRow className="border-border/50">
                    <TableCell
                      colSpan={3}
                      className="px-6 py-3 text-right text-sm font-bold"
                    >
                      Tổng cộng
                    </TableCell>
                    <TableCell className="px-6 py-3 text-right font-mono tabular-nums font-bold text-primary">
                      {formatVND(po.grandTotal)}đ
                    </TableCell>
                    <TableCell />
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          </section>
        </div>

        <div className="space-y-4">
          <div className={cn(panelClassName, "rounded-2xl bg-card")}>
            <div className="border-b border-border/50 p-6">
              <h4 className="text-sm font-bold">Tóm tắt đơn mua</h4>
            </div>
            <div className="space-y-3 p-6 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Số mặt hàng</span>
                <span className="font-semibold">{po.items.length}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Tổng tiền hàng</span>
                <span className="font-semibold">{formatVND(po.total)}đ</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Thuế</span>
                <span className="font-semibold">{formatVND(po.tax)}đ</span>
              </div>
              <div className="border-t border-border/50 pt-3">
                <p className="text-muted-foreground">Tổng cộng</p>
                <p className="mt-1 text-2xl font-black text-primary">
                  {formatVND(po.grandTotal)}đ
                </p>
              </div>
            </div>
          </div>

          <div className={cn(panelClassName, "rounded-2xl bg-card")}>
            <div className="border-b border-border/50 p-6">
              <h4 className="text-sm font-bold">Thông tin NCC</h4>
            </div>
            {supplierInfoAvailable ? (
              <div className="space-y-3 p-6 text-sm">
                <div>
                  <p className="text-label uppercase tracking-wider text-muted-foreground">
                    Địa chỉ xuất hóa đơn
                  </p>
                  <p className="mt-1 font-medium">{po.supplierInfo.address}</p>
                </div>
                <div>
                  <p className="text-label uppercase tracking-wider text-muted-foreground">
                    Người liên hệ
                  </p>
                  <p className="mt-1 font-medium">{po.supplierInfo.contact}</p>
                </div>
                <div>
                  <p className="text-label uppercase tracking-wider text-muted-foreground">
                    Hạn thanh toán
                  </p>
                  <p className="mt-1 font-medium">{po.supplierInfo.payment}</p>
                </div>
              </div>
            ) : (
              <div className="p-6 text-sm text-muted-foreground">
                Chưa có thêm thông tin nhà cung cấp trong đơn mua này.
              </div>
            )}
          </div>
        </div>
      </div>

      <footer className="flex flex-col gap-3 border-t border-border/50 py-6 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          className="focus-ring-standard flex min-h-11 items-center justify-center gap-2 rounded-full px-6 py-3 font-bold text-destructive transition-colors hover:bg-destructive/8"
        >
          <XCircle className="size-5" />
          Hủy PO
        </button>
        <button
          type="button"
          className="focus-ring-standard flex min-h-11 items-center justify-center gap-2 rounded-full bg-primary px-10 py-3 font-bold text-primary-foreground shadow-lg shadow-primary/20 transition-transform hover:scale-[0.98]"
        >
          <CheckCircle className="size-5" />
          Tạo Phiếu Nhập kho (GRN)
        </button>
      </footer>
    </div>
  );
}
