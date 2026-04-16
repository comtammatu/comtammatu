"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  CheckCircle,
  Clock,
  Eye,
  Filter,
  Lightbulb,
  PlusCircle,
  Printer,
  Search,
  Truck,
} from "lucide-react";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@comtammatu/ui/components/card";
import { Input } from "@comtammatu/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
import { cn } from "@comtammatu/ui";
import { TableEmptyStateRow } from "../_components/table-empty-state-row";
import {
  getInventoryStatusBadgeVariant,
  getInventoryStatusLabel,
} from "../_lib/ui";

export type TransferRow = {
  id: number;
  code: string;
  fromBranch: string;
  toBranch: string;
  status: string;
  date: string;
};

export function TransfersClient({ transfers }: { transfers: TransferRow[] }) {
  const [statusFilter, setStatusFilter] = useState("all");
  const [branchFilter, setBranchFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const inTransit = transfers.filter((t) => t.status === "in_transit").length;
  const awaiting = transfers.filter((t) => t.status === "confirmed").length;
  const receivedCount = transfers.filter((t) => t.status === "received").length;

  const branchOptions = useMemo(() => {
    return [...new Set(transfers.map((t) => t.toBranch).filter(Boolean))].sort(
      (a, b) => a.localeCompare(b, "vi"),
    );
  }, [transfers]);

  const filteredTransfers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return transfers.filter((t) => {
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      if (branchFilter !== "all" && t.toBranch !== branchFilter) return false;
      if (!q) return true;
      return (
        t.code.toLowerCase().includes(q) ||
        t.fromBranch.toLowerCase().includes(q) ||
        t.toBranch.toLowerCase().includes(q)
      );
    });
  }, [transfers, statusFilter, branchFilter, searchQuery]);

  return (
    <div className="space-y-6">
      <Card className="border-border/70">
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Điều chuyển
            </p>
            <div className="space-y-1">
              <CardTitle className="text-3xl">Luân chuyển nội bộ</CardTitle>
              <CardDescription className="max-w-3xl leading-6">
                Theo dõi các phiếu chuyển kho giữa trụ sở, bếp trung tâm và chi
                nhánh.
              </CardDescription>
            </div>
          </div>
          <Button type="button" className="min-h-11 px-6 font-bold">
            <PlusCircle className="size-4" />
            Tạo phiếu mới
          </Button>
        </CardHeader>
      </Card>

      {/* Bento Summary Cards */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {[
          {
            icon: <Truck className="size-7" />,
            iconBg: "bg-info/12",
            iconColor: "text-info",
            label: "Đang vận chuyển",
            value: String(inTransit).padStart(2, "0"),
          },
          {
            icon: <Clock className="size-7" />,
            iconBg: "bg-warning/12",
            iconColor: "text-warning",
            label: "Chờ nhận",
            value: String(awaiting).padStart(2, "0"),
          },
          {
            icon: <CheckCircle className="size-7" />,
            iconBg: "bg-success/12",
            iconColor: "text-success",
            label: "Đã nhận",
            value: String(receivedCount).padStart(2, "0"),
          },
        ].map((card) => (
          <Card key={card.label} className="flex items-center gap-5 shadow-sm">
            <CardContent className="flex items-center gap-5 p-6">
              <div
                className={cn(
                  "flex size-14 items-center justify-center rounded-full",
                  card.iconBg,
                  card.iconColor,
                )}
              >
                {card.icon}
              </div>
              <div>
                <p className="whitespace-nowrap text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  {card.label}
                </p>
                <p className="text-3xl font-black">{card.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-border/70">
        <CardContent className="p-4">
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_220px_220px_auto] xl:items-center">
            <div className="relative min-w-0">
              <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Tìm mã phiếu, kho gửi..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-11 w-full pl-10 pr-4 text-sm"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-11">
                <SelectValue placeholder="Trạng thái" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Trạng thái</SelectItem>
                <SelectItem value="in_transit">Đang vận chuyển</SelectItem>
                <SelectItem value="confirmed">Chờ nhận</SelectItem>
                <SelectItem value="received">Hoàn thành</SelectItem>
              </SelectContent>
            </Select>
            <Select value={branchFilter} onValueChange={setBranchFilter}>
              <SelectTrigger className="h-11">
                <SelectValue placeholder="Chi nhánh đến" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Chi nhánh đến</SelectItem>
                {branchOptions.map((branch) => (
                  <SelectItem key={branch} value={branch}>
                    {branch}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center justify-end gap-2">
              <Button type="button" variant="outline" size="sm">
                <Filter className="size-4" />
                Lọc thêm
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Data Table */}
      <Card className="shadow-sm">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                {[
                  "Mã phiếu",
                  "Kho gửi",
                  "Kho nhận",
                  "Trạng thái",
                  "Ngày tạo",
                  "Thao tác",
                ].map((h) => (
                  <TableHead
                    key={h}
                    className="px-6 py-4 whitespace-nowrap text-xs font-bold uppercase tracking-wider text-muted-foreground"
                  >
                    {h}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTransfers.length === 0 && (
                <TableEmptyStateRow
                  colSpan={6}
                  title="Không có phiếu luân chuyển phù hợp"
                  description="Thử điều chỉnh trạng thái, chi nhánh đến hoặc từ khóa tìm kiếm."
                />
              )}
              {filteredTransfers.map((t) => (
                <TableRow
                  key={t.id}
                  className="group border-border transition-colors"
                >
                  <TableCell className="px-6 py-5">
                    <Link
                      href={`/inventory/transfers/${t.id}`}
                      className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-sm font-bold tracking-tight text-primary hover:underline"
                    >
                      {t.code}
                    </Link>
                  </TableCell>
                  <TableCell className="px-6 py-5 text-sm font-medium">
                    {t.fromBranch}
                  </TableCell>
                  <TableCell className="px-6 py-5 text-sm font-medium">
                    {t.toBranch}
                  </TableCell>
                  <TableCell className="px-6 py-5">
                    <Badge variant={getInventoryStatusBadgeVariant(t.status)}>
                      {getInventoryStatusLabel(t.status)}
                    </Badge>
                  </TableCell>
                  <TableCell className="px-6 py-5 text-sm text-muted-foreground">
                    {t.date}
                  </TableCell>
                  <TableCell className="px-6 py-5">
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        aria-label="Xem phiếu"
                      >
                        <Eye className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        aria-label="In phiếu"
                      >
                        <Printer className="size-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Operational insight */}
      <Card className="border-info/20 bg-info/8">
        <CardContent className="p-5">
          <div className="flex items-start gap-3">
            <Lightbulb className="mt-0.5 size-5 shrink-0 text-info" />
            <div>
              <p className="text-sm font-semibold">Gợi ý vận hành</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {transfers.length > 0
                  ? inTransit > 0
                    ? `Có ${inTransit} phiếu đang vận chuyển và ${awaiting} phiếu chờ nhận. Ưu tiên xác nhận hàng đến để giảm ùn tắc luân chuyển.`
                    : `Đã ghi nhận ${receivedCount} phiếu luân chuyển hoàn tất. Dữ liệu đang bám theo chứng từ thực tế của kho.`
                  : "Chưa có phiếu luân chuyển nào. Khi phát sinh chứng từ thực, hệ thống sẽ tự hiển thị trạng thái ưu tiên."}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
