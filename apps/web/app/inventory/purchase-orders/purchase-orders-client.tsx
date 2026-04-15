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
import { cn } from "@comtammatu/ui";
import { useIsMobile } from "@comtammatu/ui/hooks/use-mobile";
import type { SupplierRow } from "../suppliers/suppliers-client";
import { SectionCard } from "@comtammatu/ui/components/inventory-patterns";
import { PageHeader } from "../_components/shared";
import { EmptyStatePanel } from "../_components/empty-state-panel";
import { TableEmptyStateRow } from "../_components/table-empty-state-row";

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

const STATUS_META: Record<string, { label: string; className: string }> = {
  draft: {
    label: "Nháp",
    className: "bg-muted text-muted-foreground",
  },
  sent: {
    label: "Đã gửi",
    className: "bg-info/10 text-info border-info/30",
  },
  partially_received: {
    label: "Nhận một phần",
    className: "bg-warning/10 text-warning border-warning/30",
  },
  received: {
    label: "Đã nhận đủ",
    className: "bg-success/10 text-success border-success/30",
  },
  cancelled: {
    label: "Đã hủy",
    className: "bg-destructive/10 text-destructive border-destructive/30",
  },
};

const STATUS_KEYS = [
  "draft",
  "sent",
  "partially_received",
  "received",
  "cancelled",
] as const;

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
  const [statusFilter, setStatusFilter] = useState("_all");
  const [supplierFilter, setSupplierFilter] = useState("_all");
  const isMobile = useIsMobile();

  // Status counts for badges
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of rows) {
      counts[r.status] = (counts[r.status] ?? 0) + 1;
    }
    return counts;
  }, [rows]);

  const filtered = useMemo(() => {
    let result = rows;
    if (statusFilter !== "_all") {
      result = result.filter((r) => r.status === statusFilter);
    }
    if (supplierFilter !== "_all") {
      result = result.filter((r) => String(r.supplier_id) === supplierFilter);
    }
    const q = search.trim().toLowerCase();
    if (q) {
      result = result.filter(
        (r) =>
          r.po_number.toLowerCase().includes(q) ||
          (r.suppliers?.name ?? "").toLowerCase().includes(q),
      );
    }
    return result;
  }, [rows, search, statusFilter, supplierFilter]);

  return (
    <>
      <PageHeader
        title="Đơn đặt hàng (PO)"
        description="PO cho kho Trụ sở."
        actions={
          <Button asChild disabled={suppliers.length === 0}>
            <Link href={`${purchaseOrdersBasePath}/new`}>
              <Plus className="mr-2 size-4" />
              Tạo PO
            </Link>
          </Button>
        }
      />

      {rows.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {STATUS_KEYS.map((key) => {
            const count = statusCounts[key];
            if (!count) return null;
            const meta = STATUS_META[key];
            return (
              <button
                key={key}
                type="button"
                onClick={() =>
                  setStatusFilter((prev) => (prev === key ? "_all" : key))
                }
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium transition-colors",
                  statusFilter === key
                    ? meta?.className
                    : "bg-muted/50 text-muted-foreground hover:bg-muted",
                )}
              >
                {count} {meta?.label ?? key}
              </button>
            );
          })}
        </div>
      )}

      {suppliers.length === 0 && (
        <EmptyStatePanel
          className="border-warning/40 bg-warning/10 py-6"
          title="Chưa có nhà cung cấp"
          description="Tạo nhà cung cấp trước."
        >
          <Button asChild variant="outline" className="border-warning/30 text-warning hover:bg-warning/10 hover:text-warning">
            <Link href={suppliersPath}>Đi đến trang Nhà cung cấp</Link>
          </Button>
        </EmptyStatePanel>
      )}

      {/* Table card */}
      <SectionCard className="overflow-hidden rounded-lg" density="compact">
        {/* Search + filters bar */}
        <div className="-m-4 flex flex-wrap items-center gap-3 border-b bg-muted/20 px-4 py-3 md:-m-5 md:px-5">
          <div className="flex flex-1 items-center gap-3 min-w-0">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <Input
              placeholder="Tìm số PO hoặc nhà cung cấp…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0"
            />
          </div>
          <div className="flex items-center gap-2">
            <Select value={supplierFilter} onValueChange={setSupplierFilter}>
              <SelectTrigger className="h-8 w-36 text-xs">
                <SelectValue placeholder="NCC" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">Tất cả NCC</SelectItem>
                {suppliers.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="shrink-0 text-xs text-muted-foreground">
              {filtered.length} / {rows.length}
            </span>
          </div>
        </div>

        {/* Mobile: card layout */}
        {isMobile ? (
          <div className="divide-y">
            {filtered.length === 0 && (
              <div className="py-16 text-center">
                <p className="text-sm font-medium text-muted-foreground">
                  {search || statusFilter !== "_all"
                    ? "Không tìm thấy PO nào"
                    : "Chưa có đơn đặt hàng"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground/70">
                  {search || statusFilter !== "_all"
                    ? "Thử bộ lọc khác"
                    : 'Nhấn "Tạo PO" để tạo đơn đặt hàng đầu tiên'}
                </p>
              </div>
            )}
            {filtered.map((r) => {
              const meta = STATUS_META[r.status] ?? {
                label: r.status,
                className: "bg-muted text-muted-foreground",
              };
              return (
                <Link
                  key={r.id}
                  href={`${purchaseOrdersBasePath}/${r.id}`}
                  className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/30 transition-colors"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-medium">
                        {r.po_number}
                      </span>
                      <Badge className={cn("text-xs", meta.className)}>
                        {meta.label}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {r.suppliers?.name ?? "—"} ·{" "}
                      {new Date(r.ordered_at).toLocaleDateString("vi-VN", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                      })}
                    </p>
                  </div>
                  <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
                </Link>
              );
            })}
          </div>
        ) : (
          /* Desktop: table layout */
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/20 hover:bg-muted/20">
                <TableHead className="text-xs font-semibold uppercase tracking-wider">
                  Số PO
                </TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider">
                  Nhà cung cấp
                </TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider">
                  Trạng thái
                </TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider">
                  Ngày đặt
                </TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableEmptyStateRow
                  colSpan={5}
                  paddingClassName="py-16"
                  title={
                    search || statusFilter !== "_all"
                      ? "Không tìm thấy PO nào"
                      : "Chưa có đơn đặt hàng"
                  }
                  description={
                    search || statusFilter !== "_all"
                      ? "Thử bộ lọc khác"
                      : 'Nhấn "Tạo PO" để tạo đơn đặt hàng đầu tiên'
                  }
                />
              )}
              {filtered.map((r) => {
                const meta = STATUS_META[r.status] ?? {
                  label: r.status,
                  className: "bg-muted text-muted-foreground",
                };
                return (
                  <TableRow
                    key={r.id}
                    className="group hover:bg-muted/30 transition-colors"
                  >
                    <TableCell className="font-mono text-sm font-medium">
                      {r.po_number}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {r.suppliers?.name ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge className={cn("text-xs", meta.className)}>
                        {meta.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground tabular-nums">
                      {new Date(r.ordered_at).toLocaleDateString("vi-VN", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                      })}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        asChild
                        aria-label="Chi tiết"
                      >
                        <Link href={`${purchaseOrdersBasePath}/${r.id}`}>
                          <ArrowRight className="size-4" />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </SectionCard>
    </>
  );
}
