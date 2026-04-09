"use client";

import React, { useState, useTransition } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
import { Button } from "@comtammatu/ui/components/button";
import { Input } from "@comtammatu/ui/components/input";
import { Label } from "@comtammatu/ui/components/label";
import { fetchDailyRevenue } from "../../finance/actions";
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

  return (
    <div className="space-y-4">
      {/* Filter */}
      <div className="flex flex-wrap items-end gap-4">
        <div className="grid gap-1.5">
          <Label className="text-xs">Từ ngày</Label>
          <Input
            type="date"
            className="w-40"
            value={startDate}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setStartDate(e.target.value)
            }
          />
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs">Đến ngày</Label>
          <Input
            type="date"
            className="w-40"
            value={endDate}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setEndDate(e.target.value)
            }
          />
        </div>
        <Button onClick={handleFilter} disabled={isPending} size="sm">
          {isPending ? "Đang tải..." : "Lọc"}
        </Button>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      {/* Summary cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground">Tổng doanh thu</p>
          <p className="mt-1 text-xl font-bold tabular-nums">
            {totalRevenue.toLocaleString("vi-VN")} ₫
          </p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground">Số đơn hàng</p>
          <p className="mt-1 text-xl font-bold tabular-nums">
            {totalOrders.toLocaleString("vi-VN")}
          </p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground">Thuế VAT</p>
          <p className="mt-1 text-xl font-bold tabular-nums">
            {totalTax.toLocaleString("vi-VN")} ₫
          </p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground">DT trung bình / ngày</p>
          <p className="mt-1 text-xl font-bold tabular-nums">
            {rows.length > 0
              ? Math.round(totalRevenue / rows.length).toLocaleString("vi-VN")
              : "—"}{" "}
            ₫
          </p>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-28">Ngày</TableHead>
              <TableHead className="w-20 text-right">Đơn</TableHead>
              <TableHead className="w-36 text-right">Doanh thu (₫)</TableHead>
              <TableHead className="w-28 text-right">Tiền mặt (₫)</TableHead>
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
            <tfoot className="border-t bg-muted/40">
              <tr>
                <td className="px-4 py-2 font-medium text-sm">Tổng cộng</td>
                <td className="px-4 py-2 text-right tabular-nums text-sm font-medium">
                  {totalOrders.toLocaleString("vi-VN")}
                </td>
                <td className="px-4 py-2 text-right tabular-nums text-sm font-bold">
                  {totalRevenue.toLocaleString("vi-VN")}
                </td>
                <td className="px-4 py-2 text-right tabular-nums text-sm">
                  {totalCash.toLocaleString("vi-VN")}
                </td>
                <td className="px-4 py-2 text-right tabular-nums text-sm">
                  {totalVietqr.toLocaleString("vi-VN")}
                </td>
                <td className="px-4 py-2 text-right tabular-nums text-sm">
                  {totalMomo.toLocaleString("vi-VN")}
                </td>
                <td className="px-4 py-2 text-right tabular-nums text-sm">
                  {totalTax.toLocaleString("vi-VN")}
                </td>
              </tr>
            </tfoot>
          )}
        </Table>
      </div>
    </div>
  );
}
