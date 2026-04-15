"use client";

import Link from "next/link";
import { ArrowLeft, MapPin, CheckCircle, Printer } from "lucide-react";
import { cn } from "@comtammatu/ui";
import { Button } from "@comtammatu/ui/components/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from "@comtammatu/ui/components/table";
import { SectionCard } from "@comtammatu/ui/components/inventory-patterns";
import {
  PageHeader,
  StatusBadge,
  TimelineStepper,
} from "../../_components/shared";
import { TableEmptyStateRow } from "../../_components/table-empty-state-row";
import { tRoute, tTerm } from "../../_lib/dictionary";
import { formatVND } from "../../_lib/format";

export type TransferDetail = {
  code: string;
  status: string;
  fromBranch: string;
  toBranch: string;
  createdBy: string;
  date: string;
  note: string | null;
  subtotal: number;
  shipping: number;
  total: number;
  items: Array<{
    name: string;
    sku: string;
    qty: number;
    unit: string;
    cost: number;
    total: number;
    received: number | null;
  }>;
};

export function TransferDetailClient({
  transfer,
}: {
  transfer: TransferDetail;
}) {
  const panelClassName = "rounded-lg border bg-card shadow-sm";
  const receivedCount = transfer.items.filter(
    (item) => item.received != null,
  ).length;

  return (
    <div className="space-y-6">
      <Link
        href="/inventory/transfers"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
      >
        <ArrowLeft className="size-4" /> {tRoute("/inventory/transfers")}
      </Link>

      <PageHeader
        eyebrow="Điều chuyển"
        title={transfer.code}
        description={`Luồng ${transfer.fromBranch} → ${transfer.toBranch} • Người tạo ${transfer.createdBy} • ${transfer.date}`}
        actions={<StatusBadge status={transfer.status} />}
      />

      {/* Timeline */}
      <section
        className={cn(
          panelClassName,
          "flex justify-center overflow-hidden rounded-lg bg-card py-6",
        )}
      >
        <TimelineStepper
          steps={[
            { label: "Nháp", completed: true },
            { label: "Đã gửi", completed: transfer.status !== "draft" },
            {
              label: "Đang vận chuyển",
              active: transfer.status === "in_transit",
              completed:
                transfer.status === "receiving" ||
                transfer.status === "completed",
            },
            {
              label: "Đã nhận",
              completed: transfer.status === "completed",
            },
          ]}
        />
      </section>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: "Tổng giá trị",
            value: `${formatVND(transfer.total)}đ`,
            icon: null,
          },
          {
            label: "Tổng mặt hàng",
            value: String(transfer.items.length).padStart(2, "0"),
            icon: null,
          },
          {
            label: tTerm("fromWarehouse"),
            value: transfer.fromBranch,
            icon: <MapPin className="size-3 text-primary" />,
          },
          {
            label: tTerm("toWarehouse"),
            value: transfer.toBranch,
            icon: <MapPin className="size-3 text-info" />,
          },
          {
            label: "Đã ghi nhận nhận",
            value: String(receivedCount).padStart(2, "0"),
            icon: null,
          },
        ].map((info) => (
          <div
            key={info.label}
            className={cn(panelClassName, "rounded-lg bg-card p-4")}
          >
            <p className="text-label uppercase tracking-wider text-muted-foreground">
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
        <SectionCard
          className="rounded-lg border border-border bg-card"
          density="compact"
        >
          <p className="text-label font-medium uppercase tracking-wider text-muted-foreground">
            Ghi chú vận chuyển
          </p>
          <p className="mt-1 text-sm italic">&ldquo;{transfer.note}&rdquo;</p>
        </SectionCard>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Items table */}
        <div className="lg:col-span-2">
          <section
            className={cn(
              panelClassName,
              "overflow-hidden rounded-lg bg-card",
            )}
          >
            <div className="flex flex-col gap-3 border-b border-border p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
              <h4 className="text-lg font-bold">{tTerm("ingredientsList")}</h4>
              <button
                type="button"
                className="rounded-full bg-success/10 px-4 py-2 text-sm font-bold text-success transition-all"
              >
                Kiểm bổ sung
              </button>
            </div>

            <div className="space-y-3 p-4 md:hidden">
              {transfer.items.map((item) => (
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
                    <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium">
                      {item.unit}
                    </span>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-muted-foreground">SL gửi</p>
                      <p className="font-semibold">{item.qty}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">SL nhận</p>
                      <p className="font-semibold">
                        {item.received != null ? item.received : "Đang vận"}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Giá WAC</p>
                      <p className="font-semibold">{formatVND(item.cost)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Thành tiền</p>
                      <p className="font-semibold text-primary">
                        {formatVND(item.total)}
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
                      { label: tTerm("ingredient"), align: "" },
                      { label: "SL gửi", align: "text-right" },
                      { label: "Đơn vị", align: "" },
                      { label: "Giá WAC", align: "text-right" },
                      { label: "Thành tiền", align: "text-right" },
                      { label: "SL nhận", align: "text-right" },
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
                  {transfer.items.length === 0 && (
                    <TableEmptyStateRow
                      colSpan={6}
                      paddingClassName="py-16"
                      title="Chưa có nguyên liệu điều chuyển"
                      description="Danh sách mặt hàng sẽ xuất hiện tại đây khi phiếu có dòng hàng."
                    />
                  )}
                  {transfer.items.map((item) => (
                    <TableRow
                      key={item.sku || item.name}
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
                      <TableCell className="px-6 py-4 text-right font-mono tabular-nums font-semibold">
                        {item.qty}
                      </TableCell>
                      <TableCell className="px-6 py-4">
                        <span className="rounded bg-muted px-2 py-1 text-xs font-medium">
                          {item.unit}
                        </span>
                      </TableCell>
                      <TableCell className="px-6 py-4 text-right font-mono tabular-nums">
                        {formatVND(item.cost)}
                      </TableCell>
                      <TableCell className="px-6 py-4 text-right font-mono tabular-nums">
                        {formatVND(item.total)}
                      </TableCell>
                      <TableCell className="px-6 py-4 text-right italic text-muted-foreground">
                        {item.received != null ? item.received : "Đang vận..."}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow className="border-border">
                    <TableCell
                      colSpan={4}
                      className="px-6 py-3 text-right text-sm text-muted-foreground"
                    >
                      Tạm tính
                    </TableCell>
                    <TableCell className="px-6 py-3 text-right font-mono tabular-nums">
                      {formatVND(transfer.subtotal)}đ
                    </TableCell>
                    <TableCell />
                  </TableRow>
                  <TableRow className="border-border">
                    <TableCell
                      colSpan={4}
                      className="px-6 py-3 text-right text-sm text-muted-foreground"
                    >
                      Phí vận chuyển
                    </TableCell>
                    <TableCell className="px-6 py-3 text-right font-mono tabular-nums">
                      {formatVND(transfer.shipping)}đ
                    </TableCell>
                    <TableCell />
                  </TableRow>
                  <TableRow className="border-border">
                    <TableCell
                      colSpan={4}
                      className="px-6 py-3 text-right text-sm font-bold"
                    >
                      Tổng thanh toán
                    </TableCell>
                    <TableCell className="px-6 py-3 text-right font-mono tabular-nums font-bold text-primary">
                      {formatVND(transfer.total)}đ
                    </TableCell>
                    <TableCell />
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          </section>
        </div>

        {/* Sidebar value card */}
        <SectionCard
          className="h-fit rounded-lg border-primary/20 bg-primary/5"
          density="comfortable"
        >
          <p className="text-label uppercase tracking-wider text-muted-foreground">
            Tổng giá trị luân chuyển
          </p>
          <p className="mt-2 text-2xl font-black tabular-nums text-primary">
            {formatVND(transfer.total)} VNĐ
          </p>
          <SectionCard className="mt-3 rounded-xl bg-card" density="compact">
            <p className="text-label uppercase tracking-wider text-muted-foreground">
              Tổng mặt hàng
            </p>
            <p className="text-lg font-bold tabular-nums">
              {String(transfer.items.length).padStart(2, "0")}
            </p>
          </SectionCard>
        </SectionCard>
      </div>

      {/* Footer Action Bar */}
      <footer className="flex flex-col gap-3 border-t border-border py-6 sm:flex-row sm:items-center sm:justify-between">
        <Button
          type="button"
          variant="outline"
          className="rounded-full px-6 font-bold text-muted-foreground"
        >
          <Printer className="size-5" />
          In phiếu
        </Button>
        <Button
          type="button"
          className="rounded-full px-10 font-bold shadow-lg"
        >
          <CheckCircle className="size-5" />
          Xác nhận nhận hàng
        </Button>
      </footer>
    </div>
  );
}
