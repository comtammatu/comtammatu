"use client";

import React, { useState, useTransition } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@comtammatu/ui/components/card";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
import { Button } from "@comtammatu/ui/components/button";
import { Input } from "@comtammatu/ui/components/input";
import { Label } from "@comtammatu/ui/components/label";
import { fetchDailyRevenue } from "../../../finance/actions";
import type { DailyRevenueRow } from "./page";

interface Props {
  initialRows: DailyRevenueRow[];
  initialBranchId: number;
  initialStart: string;
  initialEnd: string;
}

export function RevenueReportClient({
  initialRows,
  initialBranchId,
  initialStart,
  initialEnd,
}: Props) {
  const [rows, setRows] = useState(initialRows);
  const [startDate, setStartDate] = useState(initialStart);
  const [endDate, setEndDate] = useState(initialEnd);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleFilter() {
    setError(null);
    startTransition(async () => {
      if (initialBranchId <= 0) {
        setError("Không tìm thấy chi nhánh tổng hợp.");
        return;
      }
      const res = await fetchDailyRevenue(initialBranchId, startDate, endDate);
      if (!res.success) {
        setError(res.error ?? "Lỗi không xác định");
        return;
      }
      setRows((res.data ?? []) as DailyRevenueRow[]);
    });
  }

  const totalRevenue = rows.reduce((s, r) => s + (r.total_revenue ?? 0), 0);
  const totalOrders = rows.reduce((s, r) => s + r.order_count, 0);
  const totalTax = rows.reduce((s, r) => s + (r.total_tax ?? 0), 0);
  const totalCash = rows.reduce((s, r) => s + (r.cash_revenue ?? 0), 0);
  const totalVietqr = rows.reduce((s, r) => s + (r.vietqr_revenue ?? 0), 0);
  const totalMomo = rows.reduce((s, r) => s + (r.momo_revenue ?? 0), 0);
  const averageRevenue =
    rows.length > 0 ? Math.round(totalRevenue / rows.length) : 0;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-5 sm:p-6">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="space-y-3">
              <span className="inline-flex items-center rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                Báo cáo doanh thu
              </span>
              <div className="space-y-2">
                <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                  Doanh thu theo ngày
                </h2>
                <p className="max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
                  Tổng hợp doanh thu, số đơn và cơ cấu thanh toán theo từng ngày
                  để theo dõi nhịp bán hàng toàn chi nhánh.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 self-start">
              <Button
                onClick={handleFilter}
                disabled={isPending}
                className="min-h-11 px-5"
              >
                {isPending ? "Đang tải..." : "Làm mới báo cáo"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3 items-end gap-3">
        <div className="grid min-w-44 flex-1 gap-1.5 sm:max-w-44 sm:flex-none">
          <Label className="text-xs">Từ ngày</Label>
          <Input
            type="date"
            value={startDate}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setStartDate(e.target.value)
            }
          />
        </div>
        <div className="grid min-w-44 flex-1 gap-1.5 sm:max-w-44 sm:flex-none">
          <Label className="text-xs">Đến ngày</Label>
          <Input
            type="date"
            value={endDate}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setEndDate(e.target.value)
            }
          />
        </div>
        <div className="flex min-w-44 flex-1 items-center justify-between gap-3 rounded-5xl border border-border/60 bg-background/75 px-4 py-3 sm:max-w-sm">
          <div className="space-y-0.5">
            <p className="text-2xs font-semibold uppercase tracking-widest text-muted-foreground">
              Khoảng ngày
            </p>
            <p className="text-sm font-medium text-foreground">
              {startDate} - {endDate}
            </p>
          </div>
          {error ? (
            <p className="text-right text-sm text-destructive">{error}</p>
          ) : (
            <p className="text-right text-sm text-muted-foreground">
              {rows.length} ngày có dữ liệu
            </p>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border bg-card p-4 text-card-foreground shadow-sm">
          <p className="inline-flex items-center rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
            Tổng doanh thu
          </p>
          <p className="mt-3 text-3xl font-semibold tabular-nums text-foreground">
            {totalRevenue.toLocaleString("vi-VN")} ₫
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Tổng giá trị đã ghi nhận trong kỳ lọc.
          </p>
        </div>
        <div className="rounded-lg border bg-card p-4 text-card-foreground shadow-sm">
          <p className="inline-flex items-center rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
            Số đơn hàng
          </p>
          <p className="mt-3 text-3xl font-semibold tabular-nums text-foreground">
            {totalOrders.toLocaleString("vi-VN")}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Khối lượng đơn đã hoàn tất trong giai đoạn chọn.
          </p>
        </div>
        <div className="rounded-lg border bg-card p-4 text-card-foreground shadow-sm">
          <p className="inline-flex items-center rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
            Thuế VAT
          </p>
          <p className="mt-3 text-3xl font-semibold tabular-nums text-foreground">
            {totalTax.toLocaleString("vi-VN")} ₫
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Phần thuế phát sinh để đối soát hóa đơn và dòng tiền.
          </p>
        </div>
        <div className="rounded-lg border bg-card p-4 text-card-foreground shadow-sm">
          <p className="inline-flex items-center rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
            Trung bình mỗi ngày
          </p>
          <p className="mt-3 text-3xl font-semibold tabular-nums text-foreground">
            {rows.length > 0 ? averageRevenue.toLocaleString("vi-VN") : "—"} ₫
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Doanh thu trung bình mỗi ngày trong khoảng đang xem.
          </p>
        </div>
      </div>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Bảng doanh thu chi tiết</CardTitle>
          <p className="text-sm text-muted-foreground">
            So sánh từng ngày theo tổng doanh thu, cơ cấu thanh toán và tiền
            thuế.
          </p>
        </CardHeader>
        <CardContent className="px-4 sm:px-5">
          <div className="mb-4 grid gap-3 rounded-5xl border border-border/60 bg-background/70 p-4 md:grid-cols-3">
            <div className="space-y-1">
              <p className="inline-flex items-center rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                Tiền mặt
              </p>
              <p className="text-lg font-semibold tabular-nums">
                {totalCash.toLocaleString("vi-VN")} ₫
              </p>
            </div>
            <div className="space-y-1">
              <p className="inline-flex items-center rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                VietQR
              </p>
              <p className="text-lg font-semibold tabular-nums">
                {totalVietqr.toLocaleString("vi-VN")} ₫
              </p>
            </div>
            <div className="space-y-1">
              <p className="inline-flex items-center rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                MoMo
              </p>
              <p className="text-lg font-semibold tabular-nums">
                {totalMomo.toLocaleString("vi-VN")} ₫
              </p>
            </div>
          </div>
          {rows.length === 0 ? (
            <div className="px-4 py-10 text-center text-muted-foreground">
              Không có dữ liệu trong khoảng thời gian này.
            </div>
          ) : null}

          <div className="space-y-3 md:hidden">
            {rows.map((r) => (
              <div
                key={r.date}
                className="rounded-lg border bg-muted/30 text-card-foreground p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium tabular-nums">{r.date}</p>
                  <p className="text-sm text-muted-foreground">
                    {r.order_count.toLocaleString("vi-VN")} đơn
                  </p>
                </div>
                <p className="mt-3 text-lg font-semibold tabular-nums">
                  {(r.total_revenue ?? 0).toLocaleString("vi-VN")} ₫
                </p>
                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-muted-foreground">Tiền mặt</p>
                    <p className="mt-1 tabular-nums">
                      {(r.cash_revenue ?? 0).toLocaleString("vi-VN")} ₫
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">VietQR</p>
                    <p className="mt-1 tabular-nums">
                      {(r.vietqr_revenue ?? 0).toLocaleString("vi-VN")} ₫
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">MoMo</p>
                    <p className="mt-1 tabular-nums">
                      {(r.momo_revenue ?? 0).toLocaleString("vi-VN")} ₫
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Thuế</p>
                    <p className="mt-1 tabular-nums">
                      {(r.total_tax ?? 0).toLocaleString("vi-VN")} ₫
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-28">Ngày</TableHead>
                  <TableHead className="w-20 text-right">Đơn</TableHead>
                  <TableHead className="w-36 text-right">
                    Doanh thu (₫)
                  </TableHead>
                  <TableHead className="w-28 text-right">
                    Tiền mặt (₫)
                  </TableHead>
                  <TableHead className="w-28 text-right">VietQR (₫)</TableHead>
                  <TableHead className="w-28 text-right">MoMo (₫)</TableHead>
                  <TableHead className="w-28 text-right">Thuế (₫)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="py-10 text-center text-muted-foreground"
                    >
                      Không có dữ liệu trong khoảng thời gian này.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((r) => (
                    <TableRow key={r.date}>
                      <TableCell className="tabular-nums">{r.date}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.order_count.toLocaleString("vi-VN")}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        {(r.total_revenue ?? 0).toLocaleString("vi-VN")}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {(r.cash_revenue ?? 0).toLocaleString("vi-VN")}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {(r.vietqr_revenue ?? 0).toLocaleString("vi-VN")}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {(r.momo_revenue ?? 0).toLocaleString("vi-VN")}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {(r.total_tax ?? 0).toLocaleString("vi-VN")}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
              {rows.length > 0 && (
                <TableFooter>
                  <TableRow className="hover:bg-transparent">
                    <TableCell className="font-medium">Tổng cộng</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {totalOrders.toLocaleString("vi-VN")}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-bold">
                      {totalRevenue.toLocaleString("vi-VN")}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {totalCash.toLocaleString("vi-VN")}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {totalVietqr.toLocaleString("vi-VN")}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {totalMomo.toLocaleString("vi-VN")}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {totalTax.toLocaleString("vi-VN")}
                    </TableCell>
                  </TableRow>
                </TableFooter>
              )}
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
