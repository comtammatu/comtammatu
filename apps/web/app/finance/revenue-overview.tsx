"use client";

import { BarChart3, Receipt, TrendingUp } from "lucide-react";
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
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
import { formatVND } from "@comtammatu/shared/format";
import type { DailyRevenueRow, TopItemRow } from "./page";

interface RevenueOverviewProps {
  dailyRevenue: DailyRevenueRow[];
  topItems: TopItemRow[];
}

function formatDay(isoDate: string): string {
  const [_year, month, day] = isoDate.split("-");
  return `${day}/${month}`;
}

export function RevenueOverview({
  dailyRevenue,
  topItems,
}: RevenueOverviewProps) {
  // Aggregate 30-day totals
  const totalRevenue = dailyRevenue.reduce(
    (sum, row) => sum + (row.total_revenue ?? 0),
    0,
  );
  const totalOrders = dailyRevenue.reduce(
    (sum, row) => sum + row.order_count,
    0,
  );
  const avgPerOrder = totalOrders > 0 ? totalRevenue / totalOrders : 0;

  // Last 7 days for daily table
  const last7 = dailyRevenue.slice(-7);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Tổng doanh thu 30 ngày
            </CardTitle>
            <TrendingUp className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums">
              {formatVND(totalRevenue)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Số đơn hàng
            </CardTitle>
            <Receipt className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums">
              {totalOrders.toLocaleString("vi-VN")}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Trung bình / đơn
            </CardTitle>
            <BarChart3 className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums">
              {formatVND(avgPerOrder)}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top 5 món bán chạy</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 p-4 sm:p-6">
            {topItems.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                Chưa có dữ liệu
              </div>
            ) : null}

            <div className="space-y-3 md:hidden">
              {topItems.slice(0, 5).map((item) => (
                <div
                  key={item.menu_item_id}
                  className="rounded-lg border border-border/70 bg-muted/25 p-4"
                >
                  <p className="font-medium">{item.item_name}</p>
                  <div className="mt-3 flex items-center justify-between gap-3 text-sm">
                    <div>
                      <p className="text-muted-foreground">Số lượng</p>
                      <p className="font-semibold tabular-nums">
                        {item.quantity_sold.toLocaleString("vi-VN")}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-muted-foreground">Doanh thu</p>
                      <p className="font-semibold tabular-nums">
                        {formatVND(item.revenue)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="hidden rounded-md border-0 md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tên món</TableHead>
                    <TableHead className="text-right">Số lượng</TableHead>
                    <TableHead className="text-right">Doanh thu</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topItems.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={3}
                        className="py-8 text-center text-sm text-muted-foreground"
                      >
                        Chưa có dữ liệu
                      </TableCell>
                    </TableRow>
                  )}
                  {topItems.slice(0, 5).map((item) => (
                    <TableRow key={item.menu_item_id}>
                      <TableCell className="font-medium">
                        {item.item_name}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {item.quantity_sold.toLocaleString("vi-VN")}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatVND(item.revenue)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Doanh thu 7 ngày gần nhất
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 p-4 sm:p-6">
            {last7.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                Chưa có dữ liệu
              </div>
            ) : null}

            <div className="space-y-3 md:hidden">
              {last7.map((row) => (
                <div
                  key={row.date}
                  className="rounded-lg border border-border/70 bg-muted/25 p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium">{formatDay(row.date)}</p>
                    <p className="text-sm text-muted-foreground">
                      {row.order_count.toLocaleString("vi-VN")} đơn
                    </p>
                  </div>
                  <p className="mt-3 text-lg font-semibold tabular-nums">
                    {formatVND(row.total_revenue ?? 0)}
                  </p>
                </div>
              ))}
            </div>

            <div className="hidden rounded-md border-0 md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ngày</TableHead>
                    <TableHead className="text-right">Đơn hàng</TableHead>
                    <TableHead className="text-right">Doanh thu</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {last7.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={3}
                        className="py-8 text-center text-sm text-muted-foreground"
                      >
                        Chưa có dữ liệu
                      </TableCell>
                    </TableRow>
                  )}
                  {last7.map((row) => (
                    <TableRow key={row.date}>
                      <TableCell className="font-medium">
                        {formatDay(row.date)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.order_count.toLocaleString("vi-VN")}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatVND(row.total_revenue ?? 0)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
