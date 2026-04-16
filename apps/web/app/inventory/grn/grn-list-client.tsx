"use client";

import Link from "next/link";
import {
  Clock,
  Download,
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
      <Card>
        <CardContent className="p-5 sm:p-6">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="space-y-3">
              <span className="inline-flex items-center rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                Nhập hàng HQ
              </span>
              <div className="space-y-2">
                <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                  GRN và kiểm nhận
                </h2>
                <p className="max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
                  Theo dõi bước kiểm nhận thực tế từ nhà cung cấp sau PO, trước
                  khi đi tiếp sang đối soát hóa đơn NCC.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 self-start">
              <Button asChild type="button">
                <Link href="/inventory/purchase-orders">
                  <Plus className="size-4" />
                  Chọn PO để tạo GRN
                </Link>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className="rounded-lg border bg-card p-4 text-card-foreground shadow-sm">
          <div className="flex size-11 items-center justify-center rounded-full bg-info/12 text-info">
            <Clock className="size-5" />
          </div>
          <p className="mt-4 text-3xl font-semibold">
            {String(pendingCount).padStart(2, "0")}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Phiếu cần kiểm nhận hoặc chờ chốt nhập trong ngày.
          </p>
        </div>

        <div className="rounded-lg border bg-card text-card-foreground shadow-sm border-primary/15 bg-primary/5">
          <div className="flex items-center justify-between gap-6">
            <div>
              <p className="inline-flex items-center rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                Giá trị GRN tháng này
              </p>
              <p className="mt-3 text-4xl font-semibold tracking-tight">
                {formatVND(totalValue)}
                <span className="ml-1 text-xl font-medium opacity-50">₫</span>
              </p>
              <div className="mt-3 flex items-center gap-2 text-sm font-semibold text-success">
                <TrendingUp className="size-4" />
                14.2% so với tháng trước
              </div>
            </div>
            <Receipt className="size-20 shrink-0 text-success/15" />
          </div>
        </div>
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <CardTitle>Danh sách GRN</CardTitle>
            <p className="text-sm text-muted-foreground">
              Toàn bộ phiếu kiểm nhận theo nhà cung cấp, PO liên kết và trạng
              thái xử lý tại hub nhập hàng HQ.
            </p>
          </div>
          <Button
            type="button"
            variant="link"
            className="font-semibold"
            disabled
          >
            Xuất báo cáo Excel (sắp mở)
            <Download className="size-4" />
          </Button>
        </CardHeader>
        <CardContent className="px-4 sm:px-5">
          <div className="mb-4 flex items-center gap-3">
            <Badge variant="secondary" className="px-3 py-1 font-semibold">
              Tất cả ({grns.length})
            </Badge>
            <span className="px-3 py-1 text-sm text-muted-foreground">
              Mới nhất
            </span>
            <span className="px-3 py-1 text-sm text-muted-foreground">
              Giá trị cao
            </span>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mã GRN</TableHead>
                <TableHead>Nhà cung cấp</TableHead>
                <TableHead>PO liên kết</TableHead>
                <TableHead>Ngày kiểm nhận</TableHead>
                <TableHead>Tổng tiền</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead className="text-right">Thao tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {grns.map((g) => (
                <TableRow
                  key={g.id}
                  className={cn(g.status === "cancelled" && "opacity-60")}
                >
                  <TableCell>
                    <Link
                      href={`/inventory/grn/${g.id}`}
                      className="rounded-sm font-semibold hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    >
                      {g.code}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm font-medium">
                    {g.supplierName}
                  </TableCell>
                  <TableCell className="font-mono text-sm text-muted-foreground">
                    {g.poCode}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {g.date}
                  </TableCell>
                  <TableCell className="text-sm font-semibold">
                    {formatVND(g.total)}{" "}
                    <span className="text-xs opacity-40">₫</span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={getInventoryStatusBadgeVariant(g.status)}>
                      {getInventoryStatusLabel(g.status)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button asChild type="button" variant="ghost" size="icon">
                      <Link href={`/inventory/grn/${g.id}`}>
                        <MoreVertical className="size-4" />
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
