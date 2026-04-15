"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Plus, Search } from "lucide-react";
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
import { useIsMobile } from "@comtammatu/ui/hooks/use-mobile";
import { cn } from "@comtammatu/ui";
import type { SupplierRow } from "../suppliers/suppliers-client";
import { EmptyStatePanel } from "../_components/empty-state-panel";
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
      if (
        statusFilter !== ALL_FILTER_VALUE &&
        row.status !== statusFilter
      ) {
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
      <Card className="border-border/70">
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Procurement
            </p>
            <div className="space-y-1">
              <CardTitle className="text-3xl">
                {tRoute("/inventory/purchase-orders", "heading")}
              </CardTitle>
              <CardDescription className="max-w-3xl leading-6">
                Theo dõi đơn mua theo nhà cung cấp, trạng thái xử lý và ngày đặt hàng.
              </CardDescription>
            </div>
          </div>
          <Button asChild disabled={suppliers.length === 0}>
            <Link href={`${purchaseOrdersBasePath}/new`}>
              <Plus className="size-4" />
              Tạo PO
            </Link>
          </Button>
        </CardHeader>
      </Card>

      {suppliers.length === 0 ? (
        <EmptyStatePanel
          className="border-warning/40 bg-warning/10"
          title="Chưa có nhà cung cấp"
          description="Tạo nhà cung cấp trước khi lập đơn đặt hàng mới."
        >
          <Button asChild variant="outline">
            <Link href={suppliersPath}>Đi tới danh sách nhà cung cấp</Link>
          </Button>
        </EmptyStatePanel>
      ) : null}

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

      <Card className="border-border/70">
        <CardContent className="space-y-4 p-4 md:p-6">
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_220px_220px_auto]">
            <div className="flex h-11 items-center gap-3 rounded-lg border border-input bg-background px-3">
              <Search className="size-4 shrink-0 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Tìm theo số PO, nhà cung cấp hoặc ghi chú"
                className="h-auto border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
              />
            </div>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-11">
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
              <SelectTrigger className="h-11">
                <SelectValue placeholder="Nhà cung cấp" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_FILTER_VALUE}>
                  Tất cả nhà cung cấp
                </SelectItem>
                {suppliers.map((supplier) => (
                  <SelectItem key={supplier.id} value={String(supplier.id)}>
                    {supplier.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex h-11 items-center justify-end text-sm text-muted-foreground">
              {filteredRows.length} / {rows.length} PO
            </div>
          </div>

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
                <Card key={row.id} className="border-border/70">
                  <CardContent className="space-y-4 p-4">
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

                    <div className="grid gap-3 text-sm text-muted-foreground">
                      <div className="flex items-center justify-between gap-3">
                        <span>Ngày đặt</span>
                        <span className="font-medium text-foreground">
                          {formatDate(row.ordered_at)}
                        </span>
                      </div>
                      {row.notes ? (
                        <div className="rounded-md border border-border/70 bg-muted/30 px-3 py-2 text-sm text-foreground">
                          {row.notes}
                        </div>
                      ) : null}
                    </div>

                    <Button asChild variant="outline" className="w-full">
                      <Link href={`${purchaseOrdersBasePath}/${row.id}`}>
                        Xem chi tiết
                        <ArrowRight className="size-4" />
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border/70">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/20 hover:bg-muted/20">
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
                    <TableRow
                      key={row.id}
                      className="hover:bg-muted/20"
                    >
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
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
