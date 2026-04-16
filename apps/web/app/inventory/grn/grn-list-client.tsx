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
import { Button } from "@comtammatu/ui/components/button";
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
          <Button
            type="button"
            variant="secondary"
            className="min-h-11 rounded-full px-5 py-2.5 font-semibold"
          >
            <Filter className="size-4" />
            Lọc dữ liệu
          </Button>
          <Button
            type="button"
            className="min-h-11 rounded-full px-6 py-2.5 font-bold shadow-lg transition-transform hover:scale-[1.02]"
          >
            <Plus className="size-4" />
            Tạo GRN
          </Button>
        </div>
      </div>

      {/* Asymmetric Dashboard Highlights */}
      <div className="grid grid-cols-12 gap-6">
        {/* Pending Count */}
        <Card className="col-span-12 md:col-span-4">
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
        <Card className="relative col-span-12 border-primary/15 bg-primary/5 md:col-span-8">
          <CardContent className="flex items-center justify-between p-6">
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
          </CardContent>
        </Card>
      </div>

      {/* Table Section */}
      <Card className="overflow-hidden">
        {/* Table Toolbar */}
        <div className="flex items-center justify-between border-b border-border bg-muted/30 p-6">
          <div className="flex gap-4">
            <Badge variant="secondary" className="px-3 py-1 font-bold">
              Tất cả ({grns.length})
            </Badge>
            <span className="cursor-pointer px-3 py-1 text-sm font-medium text-muted-foreground opacity-60 hover:opacity-100">
              Mới nhất
            </span>
            <span className="cursor-pointer px-3 py-1 text-sm font-medium text-muted-foreground opacity-60 hover:opacity-100">
              Giá trị cao
            </span>
          </div>
          <Button
            type="button"
            variant="link"
            className="min-h-10 font-bold"
          >
            Xuất báo cáo Excel
            <Download className="size-4" />
          </Button>
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
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="opacity-0 transition-all group-hover:opacity-100"
                  >
                    <MoreVertical className="size-5" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
