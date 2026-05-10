"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight as IconArrowRight,
  Plus as IconPlus,
  Search as IconSearch,
} from "lucide-react";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Card, CardContent } from "@comtammatu/ui/components/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@comtammatu/ui/components/empty";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@comtammatu/ui/components/input-group";
import { Combobox } from "@/components/form";
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
import { matchesSearch } from "@lib/search";
import { AppPage, AppPageHeader, AppToolbar } from "@/components/surface";
import { InteractiveCard } from "../_components/interactive-card";
import { StatusBadge } from "../_components/status-badge";
import { TableEmptyStateRow } from "../_components/table-empty-state-row";
import { tRoute, tStatus } from "../_lib/dictionary";
import type { SupplierRow } from "../suppliers/suppliers-client";

import { FORM_VI } from "@comtammatu/shared/messages";
export interface PurchaseOrderRow {
  id: number;
  po_number: string;
  display_id: string | null;
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

/** Vietnamese relative-time hint (e.g. "3 ngày trước", "Hôm nay") for tooltips. */
function formatRelative(value: string): string {
  const ms = Date.now() - new Date(value).getTime();
  const days = Math.floor(ms / 86400000);
  if (days === 0) return "Hôm nay";
  if (days === 1) return "Hôm qua";
  if (days < 0) return `${Math.abs(days)} ngày tới`;
  if (days < 30) return `${days} ngày trước`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} tháng trước`;
  return `${Math.floor(months / 12)} năm trước`;
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
    const query = search.trim();

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

      return matchesSearch(
        [row.display_id, row.po_number, row.suppliers?.name, row.notes],
        query,
      );
    });
  }, [rows, search, statusFilter, supplierFilter]);

  const showEmptyResults =
    filteredRows.length === 0 &&
    (search.trim().length > 0 ||
      statusFilter !== ALL_FILTER_VALUE ||
      supplierFilter !== ALL_FILTER_VALUE);

  return (
    <AppPage width={isMobile ? "narrow" : "wide"}>
      <AppPageHeader
        density="compact"
        title={tRoute("/inventory/purchase-orders", "heading")}
        actions={
          <Button asChild disabled={suppliers.length === 0}>
            <Link href={`${purchaseOrdersBasePath}/new`}>
              <IconPlus className="size-4" />
              Tạo đơn đặt hàng
            </Link>
          </Button>
        }
      />
      {suppliers.length === 0 ? (
        <Card className="border-warning/40 bg-warning/10">
          <CardContent className="space-y-4 pt-6">
            <div>
              <p className="text-base font-semibold">Chưa có nhà cung cấp</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Tạo nhà cung cấp trước khi lập đơn đặt hàng mới.
              </p>
            </div>
            <Button asChild variant="outline">
              <Link href={suppliersPath}>Đi tới danh sách nhà cung cấp</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {/* Toolbar */}
      <AppToolbar>
        <InputGroup className="flex-1">
          <InputGroupInput
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Tìm theo mã đơn, nhà cung cấp hoặc ghi chú"
          />
          <InputGroupAddon>
            <IconSearch />
          </InputGroupAddon>
        </InputGroup>

        <Select
          value={statusFilter}
          onValueChange={(val) =>
            setStatusFilter((current) =>
              current === val ? ALL_FILTER_VALUE : val,
            )
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="Trạng thái" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_FILTER_VALUE}>Tất cả trạng thái</SelectItem>
            {STATUS_KEYS.map((statusKey) => (
              <SelectItem key={statusKey} value={statusKey}>
                {tStatus(statusKey, "table")} ({statusCounts[statusKey] ?? 0})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Combobox
          value={supplierFilter}
          onValueChange={setSupplierFilter}
          options={[
            { value: ALL_FILTER_VALUE, label: "Tất cả nhà cung cấp" },
            ...suppliers.map((supplier) => ({
              value: String(supplier.id),
              label: supplier.name,
            })),
          ]}
          placeholder="Nhà cung cấp"
          searchPlaceholder="Tìm nhà cung cấp..."
          aria-label="Lọc theo nhà cung cấp"
        />

        <Badge variant="outline" className="rounded-full">
          {filteredRows.length} / {rows.length} đơn
        </Badge>
      </AppToolbar>

      {/* Table / Mobile list */}
      <Card>
        <CardContent className="p-0">
          {isMobile ? (
            <div className="divide-y">
              {filteredRows.length === 0 ? (
                <Empty className="py-8">
                  <EmptyHeader>
                    <EmptyTitle className="text-sm font-semibold">
                      {showEmptyResults
                        ? "Không tìm thấy đơn đặt hàng phù hợp"
                        : "Chưa có đơn đặt hàng"}
                    </EmptyTitle>
                    <EmptyDescription className="text-xs leading-5">
                      {showEmptyResults
                        ? "Thử đổi bộ lọc hoặc từ khóa để xem thêm kết quả."
                        : 'Nhấn "Tạo đơn đặt hàng" để bắt đầu lập đơn mua đầu tiên.'}
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : null}

              {filteredRows.map((row) => (
                <InteractiveCard
                  key={row.id}
                  asChild
                  minHeight="mobile"
                  padding="default"
                >
                  <Link
                    href={`${purchaseOrdersBasePath}/${row.id}`}
                    className="block"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="font-mono text-sm font-semibold">
                        {row.display_id ?? row.po_number}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {row.suppliers?.name ?? "Chưa gắn nhà cung cấp"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Ngày đặt:{" "}
                        <span title={formatRelative(row.ordered_at)}>
                          {formatDate(row.ordered_at)}
                        </span>
                      </p>
                      {row.notes ? (
                        <p className="truncate text-xs text-muted-foreground">
                          {row.notes}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <StatusBadge status={row.status} size="sm" />
                      <IconArrowRight className="size-4 text-muted-foreground" />
                    </div>
                  </Link>
                </InteractiveCard>
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-40">Mã đơn</TableHead>
                  <TableHead className="min-w-52">Nhà cung cấp</TableHead>
                  <TableHead className="min-w-36">{FORM_VI.status}</TableHead>
                  <TableHead className="min-w-32">Ngày đặt</TableHead>
                  <TableHead>{FORM_VI.notes}</TableHead>
                  <TableHead className="w-28 text-right">
                    {FORM_VI.action}
                  </TableHead>
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
                        : 'Nhấn "Tạo đơn đặt hàng" để bắt đầu lập đơn mua đầu tiên.'
                    }
                  />
                ) : null}

                {filteredRows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-mono font-medium">
                      {row.display_id ?? row.po_number}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {row.suppliers?.name ?? "Chưa gắn nhà cung cấp"}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={row.status} size="sm" />
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      <span title={formatRelative(row.ordered_at)}>
                        {formatDate(row.ordered_at)}
                      </span>
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
                          <IconArrowRight className="size-4" />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </AppPage>
  );
}
