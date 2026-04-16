"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Plus, Search } from "lucide-react";
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
import { useIsMobile } from "@comtammatu/ui/hooks/use-mobile";
import { cn } from "@comtammatu/ui";
import type { SupplierRow } from "../suppliers/suppliers-client";
import {
  EmptyStatePanel,
  FilterBar,
  PageHeader,
  SectionCard,
} from "@/components/patterns";
import { TableEmptyStateRow } from "../_components/table-empty-state-row";
import { tRoute, tStatus } from "../_lib/dictionary";
import {
  getInventoryStatusBadgeVariant,
  getInventoryStatusLabel,
} from "../_lib/ui";

export interface PurchaseOrderRow {
  id: number;
  po_number: string;
  status: string;
  ordered_at: string;
  notes: string | null;
  supplier_id: number;
  branch_id: number;
  suppliers: { id: number; name: string } | null;
}

const ALL_FILTER_VALUE = "_all";
const STATUS_KEYS = [
  "draft",
  "sent",
  "partially_received",
  "received",
  "cancelled",
] as const;

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function PurchaseOrdersClient({
  initial,
  suppliers,
  purchaseOrdersBasePath = "/inventory/purchase-orders",
  suppliersPath = "/inventory/suppliers",
}: {
  initial: PurchaseOrderRow[];
  suppliers: SupplierRow[];
  purchaseOrdersBasePath?: string;
  suppliersPath?: string;
}) {
  const [rows] = useState(initial);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState(ALL_FILTER_VALUE);
  const [supplierFilter, setSupplierFilter] = useState(ALL_FILTER_VALUE);
  const isMobile = useIsMobile();

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const row of rows) {
      counts[row.status] = (counts[row.status] ?? 0) + 1;
    }
    return counts;
  }, [rows]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();

    return rows.filter((row) => {
      if (statusFilter !== ALL_FILTER_VALUE && row.status !== statusFilter) {
        return false;
      }

      if (
        supplierFilter !== ALL_FILTER_VALUE &&
        String(row.supplier_id) !== supplierFilter
      ) {
        return false;
      }

      if (!query) {
        return true;
      }

      return (
        row.po_number.toLowerCase().includes(query) ||
        (row.suppliers?.name ?? "").toLowerCase().includes(query) ||
        (row.notes ?? "").toLowerCase().includes(query)
      );
    });
  }, [rows, search, statusFilter, supplierFilter]);

  const showEmptyResults =
    filteredRows.length === 0 &&
    (search.trim().length > 0 ||
      statusFilter !== ALL_FILTER_VALUE ||
      supplierFilter !== ALL_FILTER_VALUE);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Procurement Desk"
        title={tRoute("/inventory/purchase-orders", "heading")}
        description="Theo dõi đơn mua theo nhà cung cấp, trạng thái xử lý và nhịp đặt hàng bằng cùng một ngôn ngữ vận hành mới."
        actions={
          <Button asChild disabled={suppliers.length === 0}>
            <Link href={`${purchaseOrdersBasePath}/new`}>
              <Plus className="size-4" />
              Tạo PO
            </Link>
          </Button>
        }
      />

      {suppliers.length === 0 ? (
        <EmptyStatePanel
          className="border-warning/40 bg-warning/10"
          title="Chưa có nhà cung cấp"
          description="Tạo nhà cung cấp trước khi lập đơn đặt hàng mới."
          action={
            <Button asChild variant="outline">
              <Link href={suppliersPath}>Đi tới danh sách nhà cung cấp</Link>
            </Button>
          }
        />
      ) : null}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="app-stat">
          <p className="app-kicker">Tổng PO</p>
          <p className="mt-3 text-3xl font-semibold">{rows.length}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Tất cả đơn mua đang được theo dõi.
          </p>
        </div>
        <div className="app-stat">
          <p className="app-kicker">Chờ gửi NCC</p>
          <p className="mt-3 text-3xl font-semibold">
            {statusCounts.draft ?? 0}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Đơn nháp cần rà lại trước khi phát hành.
          </p>
        </div>
        <div className="app-stat">
          <p className="app-kicker">Đang nhận hàng</p>
          <p className="mt-3 text-3xl font-semibold">
            {statusCounts.partially_received ?? 0}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            PO đã đi vào giai đoạn nhập kho thực tế.
          </p>
        </div>
        <div className="app-stat">
          <p className="app-kicker">Hoàn tất</p>
          <p className="mt-3 text-3xl font-semibold">
            {statusCounts.received ?? 0}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Đơn đã nhận đủ và sẵn sàng đối soát.
          </p>
        </div>
      </div>

      <FilterBar className="gap-3">
        <div className="relative min-w-[16rem] flex-1">
          <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Tìm theo số PO, nhà cung cấp hoặc ghi chú"
            className="pl-10"
          />
        </div>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="min-w-[13rem]">
            <SelectValue placeholder="Trạng thái" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_FILTER_VALUE}>Tất cả trạng thái</SelectItem>
            {STATUS_KEYS.map((statusKey) => (
              <SelectItem key={statusKey} value={statusKey}>
                {tStatus(statusKey, "table")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={supplierFilter} onValueChange={setSupplierFilter}>
          <SelectTrigger className="min-w-[13rem]">
            <SelectValue placeholder="Nhà cung cấp" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_FILTER_VALUE}>Tất cả nhà cung cấp</SelectItem>
            {suppliers.map((supplier) => (
              <SelectItem key={supplier.id} value={String(supplier.id)}>
                {supplier.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Badge variant="outline" className="rounded-full">
          {filteredRows.length} / {rows.length} PO
        </Badge>
      </FilterBar>

      <div className="flex flex-wrap gap-2">
        {STATUS_KEYS.map((statusKey) => (
          <Button
            key={statusKey}
            type="button"
            size="sm"
            variant={statusFilter === statusKey ? "default" : "outline"}
            onClick={() =>
              setStatusFilter((current) =>
                current === statusKey ? ALL_FILTER_VALUE : statusKey,
              )
            }
            aria-pressed={statusFilter === statusKey}
          >
            {tStatus(statusKey, "table")}
            <span className="text-xs opacity-80">
              {statusCounts[statusKey] ?? 0}
            </span>
          </Button>
        ))}
      </div>

      <SectionCard
        title="Danh sách đơn đặt hàng"
        description="Toàn bộ PO theo nhà cung cấp, trạng thái và ghi chú xử lý."
        className="overflow-hidden"
        density="compact"
      >
        {isMobile ? (
          <div className="space-y-3">
            {filteredRows.length === 0 ? (
              <EmptyStatePanel
                title={
                  showEmptyResults
                    ? "Không tìm thấy đơn đặt hàng phù hợp"
                    : "Chưa có đơn đặt hàng"
                }
                description={
                  showEmptyResults
                    ? "Thử đổi bộ lọc hoặc từ khóa để xem thêm kết quả."
                    : 'Nhấn "Tạo PO" để bắt đầu lập đơn mua đầu tiên.'
                }
              />
            ) : null}

            {filteredRows.map((row) => (
              <div key={row.id} className="app-subpanel p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <p className="font-mono text-base font-semibold">
                      {row.po_number}
                    </p>
                    <p className="truncate text-sm text-muted-foreground">
                      {row.suppliers?.name ?? "Chưa gắn nhà cung cấp"}
                    </p>
                  </div>
                  <Badge variant={getInventoryStatusBadgeVariant(row.status)}>
                    {getInventoryStatusLabel(row.status)}
                  </Badge>
                </div>

                <div className="mt-4 grid gap-3 text-sm text-muted-foreground">
                  <div className="flex items-center justify-between gap-3">
                    <span>Ngày đặt</span>
                    <span className="font-medium text-foreground">
                      {formatDate(row.ordered_at)}
                    </span>
                  </div>
                  {row.notes ? (
                    <div className="rounded-[1.25rem] border border-border/60 bg-background/75 px-3 py-2 text-sm text-foreground">
                      {row.notes}
                    </div>
                  ) : null}
                </div>

                <Button asChild variant="outline" className="mt-4 w-full">
                  <Link href={`${purchaseOrdersBasePath}/${row.id}`}>
                    Xem chi tiết
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-40">Số PO</TableHead>
                <TableHead className="min-w-52">Nhà cung cấp</TableHead>
                <TableHead className="min-w-36">Trạng thái</TableHead>
                <TableHead className="min-w-32">Ngày đặt</TableHead>
                <TableHead>Ghi chú</TableHead>
                <TableHead className="w-28 text-right">Thao tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRows.length === 0 ? (
                <TableEmptyStateRow
                  colSpan={6}
                  title={
                    showEmptyResults
                      ? "Không tìm thấy đơn đặt hàng phù hợp"
                      : "Chưa có đơn đặt hàng"
                  }
                  description={
                    showEmptyResults
                      ? "Thử đổi bộ lọc hoặc từ khóa để xem thêm kết quả."
                      : 'Nhấn "Tạo PO" để bắt đầu lập đơn mua đầu tiên.'
                  }
                />
              ) : null}

              {filteredRows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-mono font-medium">
                    {row.po_number}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {row.suppliers?.name ?? "Chưa gắn nhà cung cấp"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={getInventoryStatusBadgeVariant(row.status)}>
                      {getInventoryStatusLabel(row.status)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(row.ordered_at)}
                  </TableCell>
                  <TableCell>
                    <p
                      className={cn(
                        "max-w-md truncate text-sm text-muted-foreground",
                        !row.notes && "text-muted-foreground/60",
                      )}
                    >
                      {row.notes ?? "Không có ghi chú"}
                    </p>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button asChild size="sm" variant="outline">
                      <Link href={`${purchaseOrdersBasePath}/${row.id}`}>
                        Xem
                        <ArrowRight className="size-4" />
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </SectionCard>
    </div>
  );
}
