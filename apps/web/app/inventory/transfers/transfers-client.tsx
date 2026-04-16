"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  CheckCircle,
  Eye,
  Lightbulb,
  PlusCircle,
  Printer,
  Search,
  Truck,
  Waypoints,
} from "lucide-react";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
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
import { FilterBar, PageHeader, SectionCard } from "@/components/patterns";
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
      <PageHeader
        eyebrow="Internal Logistics"
        title="Luân chuyển nội bộ"
        description="Theo dõi nhịp điều chuyển giữa trụ sở, bếp trung tâm và chi nhánh bằng một khung danh sách rõ ràng, tập trung vào trạng thái luồng hàng."
        actions={
          <Button type="button" className="min-h-11 px-6 font-semibold">
            <PlusCircle className="size-4" />
            Tạo phiếu mới
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="app-stat">
          <div className="flex size-11 items-center justify-center rounded-full bg-info/12 text-info">
            <Truck className="size-5" />
          </div>
          <p className="mt-4 text-3xl font-semibold">{String(inTransit).padStart(2, "0")}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Phiếu đang trên đường, cần ưu tiên theo dõi nhận hàng.
          </p>
        </div>
        <div className="app-stat">
          <div className="flex size-11 items-center justify-center rounded-full bg-warning/12 text-warning">
            <Waypoints className="size-5" />
          </div>
          <p className="mt-4 text-3xl font-semibold">{String(awaiting).padStart(2, "0")}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Phiếu đã xác nhận nhưng chưa chốt ở kho nhận.
          </p>
        </div>
        <div className="app-stat">
          <div className="flex size-11 items-center justify-center rounded-full bg-success/12 text-success">
            <CheckCircle className="size-5" />
          </div>
          <p className="mt-4 text-3xl font-semibold">{String(receivedCount).padStart(2, "0")}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Chứng từ đã hoàn tất và bám theo nghiệp vụ kho thực tế.
          </p>
        </div>
      </div>

      <FilterBar className="gap-3">
        <div className="relative min-w-[16rem] flex-1">
          <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Tìm mã phiếu, kho gửi, kho nhận..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="min-w-[13rem]">
            <SelectValue placeholder="Trạng thái" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả trạng thái</SelectItem>
            <SelectItem value="in_transit">Đang vận chuyển</SelectItem>
            <SelectItem value="confirmed">Chờ nhận</SelectItem>
            <SelectItem value="received">Hoàn thành</SelectItem>
          </SelectContent>
        </Select>
        <Select value={branchFilter} onValueChange={setBranchFilter}>
          <SelectTrigger className="min-w-[13rem]">
            <SelectValue placeholder="Chi nhánh đến" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả chi nhánh đến</SelectItem>
            {branchOptions.map((branch) => (
              <SelectItem key={branch} value={branch}>
                {branch}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Badge variant="outline" className="rounded-full">
          {filteredTransfers.length} / {transfers.length} phiếu
        </Badge>
      </FilterBar>

      <SectionCard
        title="Danh sách luân chuyển"
        description="Toàn bộ phiếu điều chuyển hiện có giữa các kho và chi nhánh."
        className="overflow-hidden"
        density="compact"
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Mã phiếu</TableHead>
              <TableHead>Kho gửi</TableHead>
              <TableHead>Kho nhận</TableHead>
              <TableHead>Trạng thái</TableHead>
              <TableHead>Ngày tạo</TableHead>
              <TableHead className="text-right">Thao tác</TableHead>
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
              <TableRow key={t.id}>
                <TableCell>
                  <Link
                    href={`/inventory/transfers/${t.id}`}
                    className="rounded-sm font-semibold tracking-tight text-primary transition hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  >
                    {t.code}
                  </Link>
                </TableCell>
                <TableCell className="text-sm">{t.fromBranch}</TableCell>
                <TableCell className="text-sm">{t.toBranch}</TableCell>
                <TableCell>
                  <Badge variant={getInventoryStatusBadgeVariant(t.status)}>
                    {getInventoryStatusLabel(t.status)}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {t.date}
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-2">
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
      </SectionCard>

      <div className="app-panel border-info/20 bg-info/8">
        <div className="flex items-start gap-3">
          <Lightbulb className="mt-0.5 size-5 shrink-0 text-info" />
          <div>
            <p className="app-kicker">Gợi ý vận hành</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {transfers.length > 0
                ? inTransit > 0
                  ? `Có ${inTransit} phiếu đang vận chuyển và ${awaiting} phiếu chờ nhận. Ưu tiên xác nhận hàng đến để giảm ùn tắc luân chuyển.`
                  : `Đã ghi nhận ${receivedCount} phiếu luân chuyển hoàn tất. Dữ liệu đang bám theo chứng từ thực tế của kho.`
                : "Chưa có phiếu luân chuyển nào. Khi phát sinh chứng từ thực, hệ thống sẽ tự hiển thị trạng thái ưu tiên."}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
