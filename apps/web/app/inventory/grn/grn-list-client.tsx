"use client";

import Link from "next/link";
import {
  Clock,
  Download,
  Filter,
  MoreVertical,
  Plus,
  Receipt,
  TrendingUp,
} from "lucide-react";
import { cn } from "@comtammatu/ui";
import { Badge } from "@comtammatu/ui/components/badge";
import {
  Card,
  CardContent,
  CardDescription,
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
import { formatVND } from "../_lib/format";
import {
  getInventoryStatusBadgeVariant,
  getInventoryStatusLabel,
} from "../_lib/ui";

export type GrnRow = {
  id: number;
  code: string;
  supplierName: string;
  poCode: string;
  date: string;
  total: number;
  status: string;
};

export function GrnListClient({ grns }: { grns: GrnRow[] }) {
  const totalValue = grns.reduce((s, g) => s + g.total, 0);
  const pendingCount = grns.filter((g) => g.status === "pending").length;
  const panelClassName = "rounded-lg border bg-card shadow-sm";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <Card className="flex-1 border-border/70">
          <CardHeader>
            <CardTitle className="text-2xl">Phiếu nhập kho</CardTitle>
            <CardDescription>Phiếu nhập từ nhà cung cấp.</CardDescription>
          </CardHeader>
        </Card>
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background flex min-h-11 items-center gap-2 rounded-full bg-muted px-5 py-2.5 font-semibold text-foreground transition-colors hover:bg-muted/80"
          >
            <Filter className="size-4" />
            Lọc dữ liệu
          </button>
          <button
            type="button"
            className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background flex min-h-11 items-center gap-2 rounded-full bg-primary px-6 py-2.5 font-bold text-primary-foreground shadow-lg transition-transform hover:scale-[1.02]"
          >
            <Plus className="size-4" />
            Tạo GRN
          </button>
        </div>
      </div>

      {/* Asymmetric Dashboard Highlights */}
      <div className="grid grid-cols-12 gap-6">
        {/* Pending Count */}
        <Card
          className={cn(
            panelClassName,
            "col-span-12 rounded-xl bg-card md:col-span-4",
          )}
        >
          <CardContent className="p-6">
            <div className="mb-4 flex items-center gap-4">
              <div className="flex size-12 items-center justify-center rounded-lg bg-info/12">
                <Clock className="size-5 text-info" />
              </div>
              <span className="text-sm font-semibold text-muted-foreground">
                Đang chờ xử lý
              </span>
            </div>
            <div className="mb-1 text-4xl font-black tracking-tight">
              {String(pendingCount).padStart(2, "0")}
            </div>
            <div className="text-xs font-semibold text-info">+3 từ hôm qua</div>
          </CardContent>
        </Card>

        {/* Total Value Hero */}
        <div
          className={cn(
            panelClassName,
            "relative col-span-12 flex items-center justify-between overflow-hidden rounded-xl border-primary/15 bg-primary/5 p-6 md:col-span-8",
          )}
        >
          <div className="z-10">
            <div className="mb-2 text-sm font-semibold text-muted-foreground">
              Giá trị nhập kho tháng này
            </div>
            <div className="mb-2 text-4xl font-black tracking-tight">
              {formatVND(totalValue)}
              <span className="ml-1 text-xl font-medium opacity-50">₫</span>
            </div>
            <div className="flex items-center gap-2 text-sm font-semibold text-success">
              <TrendingUp className="size-4" />
              14.2% so với tháng trước
            </div>
          </div>
          <div className="absolute right-6 top-1/2 -translate-y-1/2 opacity-10">
            <Receipt className="size-24 text-success" />
          </div>
        </div>
      </div>

      {/* Table Section */}
      <div className={cn(panelClassName, "overflow-hidden rounded-xl bg-card")}>
        {/* Table Toolbar */}
        <div className="flex items-center justify-between border-b border-border bg-muted/30 p-6">
          <div className="flex gap-4">
            <span className="rounded-full bg-muted px-3 py-1 text-sm font-bold text-muted-foreground">
              Tất cả ({grns.length})
            </span>
            <span className="cursor-pointer px-3 py-1 text-sm font-medium text-muted-foreground opacity-60 hover:opacity-100">
              Mới nhất
            </span>
            <span className="cursor-pointer px-3 py-1 text-sm font-medium text-muted-foreground opacity-60 hover:opacity-100">
              Giá trị cao
            </span>
          </div>
          <button
            type="button"
            className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background flex min-h-10 items-center gap-1 rounded-full px-2 text-sm font-bold text-primary hover:underline"
          >
            Xuất báo cáo Excel
            <Download className="size-4" />
          </button>
        </div>

        <Table>
          <TableHeader>
            <TableRow className="border-border">
              <TableHead className="px-8 py-5 whitespace-nowrap text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Mã GRN
              </TableHead>
              <TableHead className="px-6 py-5 whitespace-nowrap text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Nhà cung cấp
              </TableHead>
              <TableHead className="px-6 py-5 whitespace-nowrap text-xs font-bold uppercase tracking-wider text-muted-foreground">
                PO liên kết
              </TableHead>
              <TableHead className="px-6 py-5 whitespace-nowrap text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Ngày nhận
              </TableHead>
              <TableHead className="px-6 py-5 whitespace-nowrap text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Tổng tiền
              </TableHead>
              <TableHead className="px-6 py-5 whitespace-nowrap text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Trạng thái
              </TableHead>
              <TableHead className="px-8 py-5 text-right whitespace-nowrap text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Thao tác
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {grns.map((g) => (
              <TableRow
                key={g.id}
                className={cn(
                  "group transition-colors",
                  g.status === "cancelled" && "opacity-60",
                )}
              >
                <TableCell className="px-8 py-6">
                  <Link
                    href={`/inventory/grn/${g.id}`}
                    className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-sm font-bold hover:underline"
                  >
                    {g.code}
                  </Link>
                </TableCell>
                <TableCell className="px-6 py-6 text-sm font-medium">
                  {g.supplierName}
                </TableCell>
                <TableCell className="px-6 py-6 font-mono text-sm text-muted-foreground">
                  {g.poCode}
                </TableCell>
                <TableCell className="px-6 py-6 text-sm text-muted-foreground">
                  {g.date}
                </TableCell>
                <TableCell className="px-6 py-6 text-sm font-bold">
                  {formatVND(g.total)}{" "}
                  <span className="text-xs opacity-40">₫</span>
                </TableCell>
                <TableCell className="px-6 py-6">
                  <Badge variant={getInventoryStatusBadgeVariant(g.status)}>
                    {getInventoryStatusLabel(g.status)}
                  </Badge>
                </TableCell>
                <TableCell className="px-8 py-6 text-right">
                  <button
                    type="button"
                    className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-lg p-2 text-muted-foreground opacity-0 transition-all group-hover:opacity-100"
                  >
                    <MoreVertical className="size-5" />
                  </button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
