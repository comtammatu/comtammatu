"use client";

import Link from "next/link";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { SectionCard } from "@/components/patterns";
import {
  ArrowLeft,
  CheckCircle,
  CheckCircle2,
  AlertTriangle,
  X,
} from "lucide-react";
import { cn } from "@comtammatu/ui";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
import { formatVND } from "../../_lib/format";
import { tRoute } from "../../_lib/dictionary";
import {
  getInventoryStatusBadgeVariant,
  getInventoryStatusLabel,
} from "../../_lib/ui";

export type GRNDetail = {
  code: string;
  poCode: string;
  poId?: number;
  supplier: string;
  date: string;
  total: number;
  tax: number;
  status: string;
  items: Array<{
    name: string;
    sku: string;
    required: number;
    actual: number;
    unit: string;
    cost: number;
    lot: string;
    expiry: string;
    temp: string | null;
    status: string;
  }>;
};

export function GRNDetailClient({ grn }: { grn: GRNDetail }) {
  const qcPassed = grn.items.filter((i) => i.status === "pass").length;
  const qcWarning = grn.items.filter((i) => i.status === "warning").length;
  const panelClassName = "rounded-lg border bg-card shadow-sm";

  return (
    <div className="space-y-6">
      <Link
        href="/inventory/grn"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
      >
        <ArrowLeft className="size-4" /> {tRoute("/inventory/grn", "heading")}
      </Link>

      {/* Header Identity Card */}
      <section
        className={cn(
          panelClassName,
          "relative overflow-hidden bg-muted p-5 sm:p-6 lg:p-8",
        )}
      >
        <div className="absolute right-5 top-5 sm:right-6 sm:top-6 lg:right-8 lg:top-8">
          <Badge variant={getInventoryStatusBadgeVariant(grn.status)}>
            {getInventoryStatusLabel(grn.status)}
          </Badge>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3 md:gap-8 lg:gap-12">
          <div className="space-y-4">
            <div>
              <p className="mb-1 text-xs uppercase tracking-wider text-muted-foreground">
                Mã phiếu nhập
              </p>
              <h3 className="text-3xl font-black tracking-tight">{grn.code}</h3>
            </div>
            <div>
              <p className="mb-1 text-xs uppercase tracking-wider text-muted-foreground">
                Mã PO
              </p>
              {grn.poCode && grn.poId ? (
                <Link
                  href={`/inventory/purchase-orders/${grn.poId}`}
                  className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-sm font-semibold text-primary hover:underline"
                >
                  {grn.poCode}
                </Link>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </div>
          </div>

          <div className="space-y-4 border-border md:border-l md:pl-8 lg:pl-12">
            <div>
              <p className="mb-1 text-xs uppercase tracking-wider text-muted-foreground">
                Nhà cung cấp
              </p>
              <p className="font-semibold">{grn.supplier}</p>
            </div>
            <div>
              <p className="mb-1 text-xs uppercase tracking-wider text-muted-foreground">
                Ngày nhập
              </p>
              <p className="font-semibold">{grn.date}</p>
            </div>
          </div>

          <div className="space-y-4 border-border md:border-l md:pl-8 lg:pl-12">
            <div>
              <p className="mb-1 text-xs uppercase tracking-wider text-muted-foreground">
                Tổng giá trị nhập
              </p>
              <p className="text-2xl font-black text-primary">
                {formatVND(grn.total)}{" "}
                <span className="text-xs font-normal">VNĐ</span>
              </p>
            </div>
            <div>
              <p className="mb-1 text-xs uppercase tracking-wider text-muted-foreground">
                Thuế (VAT)
              </p>
              <p className="font-semibold">{formatVND(grn.tax)} VNĐ</p>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <section className={cn(panelClassName, "overflow-hidden")}>
            <div className="flex flex-col gap-3 border-b border-border p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
              <h4 className="text-lg font-bold">Danh sách mặt hàng nhập</h4>
              <span className="text-xs font-medium text-muted-foreground">
                {grn.items.length} mặt hàng
              </span>
            </div>

            <div className="space-y-3 p-4 md:hidden">
              {grn.items.map((item) => (
                <div
                  key={item.sku || item.name}
                  className="rounded-lg border border-border bg-muted/20 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-bold">{item.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.sku}
                      </p>
                    </div>
                    {item.status === "pass" ? (
                      <CheckCircle2 className="size-4 text-success" />
                    ) : (
                      <AlertTriangle className="size-4 text-primary" />
                    )}
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-muted-foreground">Yêu cầu</p>
                      <p className="mt-1 font-medium">
                        {item.required} {item.unit}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Thực nhận</p>
                      <p className="mt-1 font-medium">{item.actual}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Đơn giá</p>
                      <p className="mt-1 font-mono">{formatVND(item.cost)}đ</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Nhiệt độ</p>
                      <p className="mt-1">{item.temp ?? "—"}</p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-muted-foreground">Số lô / HSD</p>
                      <p className="mt-1 font-mono">{item.lot}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.expiry}
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
                      { label: "Sản phẩm", align: "" },
                      { label: "Yêu cầu", align: "text-right" },
                      { label: "Thực nhận", align: "text-right" },
                      { label: "Đơn giá", align: "text-right" },
                      { label: "Số lô / HSD", align: "" },
                      { label: "Nhiệt độ", align: "" },
                      { label: "QC", align: "text-center" },
                    ].map((h) => (
                      <TableHead
                        key={h.label}
                        className={`px-6 py-4 whitespace-nowrap text-xs font-bold uppercase tracking-wider ${h.align}`}
                      >
                        {h.label}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {grn.items.map((item) => (
                    <TableRow
                      key={item.sku || item.name}
                      className="group transition-colors"
                    >
                      <TableCell className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="font-bold">{item.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {item.sku}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="px-6 py-4 text-right font-mono tabular-nums">
                        {item.required} {item.unit}
                      </TableCell>
                      <TableCell className="px-6 py-4 text-right font-mono tabular-nums">
                        <span
                          className={
                            item.actual < item.required
                              ? "font-semibold text-primary"
                              : undefined
                          }
                        >
                          {item.actual}
                        </span>
                      </TableCell>
                      <TableCell className="px-6 py-4 text-right font-mono tabular-nums">
                        {formatVND(item.cost)}đ
                      </TableCell>
                      <TableCell className="px-6 py-4">
                        <p className="font-mono font-medium">{item.lot}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.expiry}
                        </p>
                      </TableCell>
                      <TableCell className="px-6 py-4">
                        {item.temp ? (
                          <span className="font-mono">{item.temp}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="px-6 py-4 text-center">
                        {item.status === "pass" ? (
                          <CheckCircle2 className="mx-auto size-4 text-success" />
                        ) : (
                          <AlertTriangle className="mx-auto size-4 text-primary" />
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>
        </div>

        {/* Sidebar -- 1/3 */}
        <div className="space-y-4">
          {/* Quality Summary */}
          <SectionCard className={panelClassName} density="compact">
            <div className="-m-5 border-b border-border px-5 py-5 md:-m-6 md:px-6 md:py-6">
              <h4 className="text-sm font-bold">Tổng hợp chất lượng</h4>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  Hàng đạt chuẩn (QC)
                </span>
                <span className="text-lg font-bold text-success">
                  {qcPassed}/{grn.items.length}
                </span>
              </div>
              {qcWarning > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    Hàng lưu/thiếu
                  </span>
                  <span className="text-lg font-bold text-primary">
                    {qcWarning}
                  </span>
                </div>
              )}
            </div>
          </SectionCard>

          {/* Total value card */}
          <SectionCard
            className="rounded-lg border-primary/20 bg-primary/5"
            density="compact"
          >
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              Tổng giá trị nhập
            </p>
            <p className="mt-2 text-2xl font-black tabular-nums text-primary">
              {formatVND(grn.total)} VNĐ
            </p>
            <div className="mt-3 space-y-1 text-xs text-muted-foreground">
              <div className="flex justify-between">
                <span>Tổng thuế (VAT)</span>
                <span className="font-mono tabular-nums">
                  {formatVND(grn.tax)}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Phí vận chuyển</span>
                <span className="font-mono tabular-nums">0</span>
              </div>
            </div>
          </SectionCard>
        </div>
      </div>

      {/* Footer Action Bar */}
      <footer className="flex flex-col gap-3 border-t border-border py-6 sm:flex-row sm:items-center sm:justify-between">
        <Button
          type="button"
          variant="ghost"
          className="justify-center text-destructive hover:bg-destructive/8 hover:text-destructive"
        >
          <X className="size-5" />
          Hủy bỏ
        </Button>
        <Button
          type="button"
          className="justify-center shadow-lg transition-transform hover:scale-[0.98]"
        >
          <CheckCircle className="size-5" />
          Xác nhận nhập kho
        </Button>
      </footer>
    </div>
  );
}
