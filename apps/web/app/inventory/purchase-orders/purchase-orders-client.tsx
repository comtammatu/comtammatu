"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, PlusCircle, Search } from "lucide-react";
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
import { StatusBadge } from "../_components/shared";
import type { SupplierRow } from "../suppliers/suppliers-client";
import { TableEmptyStateRow } from "../../admin/components/table-empty-state-row";
import { EmptyStatePanel } from "../../admin/components/empty-state-panel";

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
}: {
  initial: PurchaseOrderRow[];
  suppliers: SupplierRow[];
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
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1
            className="text-2xl font-bold tracking-tight"
            style={{ color: "var(--md-on-surface)" }}
          >
            Đơn đặt hàng (PO)
          </h1>
          <p
            className="mt-1 text-sm"
            style={{ color: "var(--md-on-surface-variant)", opacity: 0.7 }}
          >
            PO chỉ tạo cho kho Trụ sở. Dùng khi cần tham chiếu trước khi lập
            GRN.
          </p>
        </div>
        {suppliers.length > 0 && (
          <Link
            href="/inventory/purchase-orders/new"
            className="flex items-center gap-2 rounded-full px-8 py-3 font-bold text-white shadow-lg transition-transform hover:scale-[1.02]"
            style={{
              background:
                "linear-gradient(135deg, var(--md-primary), var(--md-primary-container))",
              boxShadow: "0 4px 14px rgba(211,84,0,0.2)",
            }}
          >
            <PlusCircle className="size-4" />
            Tạo PO Mới
          </Link>
        )}
      </div>

      {/* Segmented Tab Control */}
      {rows.length > 0 && (
        <div
          className="flex gap-1 rounded-2xl p-1"
          style={{ backgroundColor: "var(--md-surface-low)" }}
        >
          {(["_all", ...STATUS_KEYS] as const).map((key) => {
            const count =
              key === "_all" ? rows.length : (statusCounts[key] ?? 0);
            const isActive = statusFilter === key;
            const label =
              key === "_all" ? "Tất cả" : (STATUS_META[key]?.label ?? key);
            return (
              <button
                key={key}
                type="button"
                onClick={() => setStatusFilter(key === "_all" ? "_all" : key)}
                className="flex-1 rounded-full py-2 text-sm font-medium transition-colors"
                style={
                  isActive
                    ? {
                        backgroundColor: "white",
                        color: "var(--md-primary)",
                        fontWeight: 700,
                        boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
                      }
                    : { color: "var(--md-on-surface-variant)" }
                }
              >
                {label}
                {isActive && count > 0 ? ` (${count})` : ""}
              </button>
            );
          })}
        </div>
      )}

      {suppliers.length === 0 && (
        <EmptyStatePanel
          className="border-warning/40 bg-warning/10 py-6"
          title="Chưa có nhà cung cấp"
          description="Cần tạo nhà cung cấp trước khi lập đơn đặt hàng."
        >
          <Link
            href="/inventory/suppliers"
            className="text-sm font-medium text-warning underline hover:opacity-80"
          >
            Đi đến trang Nhà cung cấp
          </Link>
        </EmptyStatePanel>
      )}

      {/* Table card */}
      <div
        className="overflow-hidden rounded-3xl ambient-shadow"
        style={{
          backgroundColor: "var(--md-surface-lowest)",
          border:
            "1px solid color-mix(in srgb, var(--md-outline-variant) 5%, transparent)",
        }}
      >
        {/* Search + filters bar */}
        <div
          className="flex flex-wrap items-center gap-3 border-b px-4 py-3"
          style={{
            borderColor:
              "color-mix(in srgb, var(--md-outline-variant) 10%, transparent)",
          }}
        >
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
            {filtered.map((r) => (
              <Link
                key={r.id}
                href={`/inventory/purchase-orders/${r.id}`}
                className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-muted/30"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-medium">
                      {r.po_number}
                    </span>
                    <StatusBadge status={r.status} />
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
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
            ))}
          </div>
        ) : (
          /* Desktop: table layout */
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead
                  className="px-6 py-5 text-xs font-bold uppercase tracking-widest"
                  style={{ color: "var(--md-outline)" }}
                >
                  Số PO
                </TableHead>
                <TableHead
                  className="px-6 py-5 text-xs font-bold uppercase tracking-widest"
                  style={{ color: "var(--md-outline)" }}
                >
                  Nhà cung cấp
                </TableHead>
                <TableHead
                  className="px-6 py-5 text-xs font-bold uppercase tracking-widest"
                  style={{ color: "var(--md-outline)" }}
                >
                  Trạng thái
                </TableHead>
                <TableHead
                  className="px-6 py-5 text-xs font-bold uppercase tracking-widest"
                  style={{ color: "var(--md-outline)" }}
                >
                  Ngày đặt
                </TableHead>
                <TableHead className="px-6 py-5" />
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
              {filtered.map((r) => (
                <TableRow
                  key={r.id}
                  className="group transition-colors"
                  style={{
                    borderColor:
                      "color-mix(in srgb, var(--md-outline-variant) 10%, transparent)",
                  }}
                >
                  <TableCell className="px-6 py-5">
                    <Link
                      href={`/inventory/purchase-orders/${r.id}`}
                      className="font-bold hover:underline"
                      style={{ color: "var(--md-primary)" }}
                    >
                      {r.po_number}
                    </Link>
                  </TableCell>
                  <TableCell className="px-6 py-5">
                    <div className="flex items-center gap-3">
                      <div
                        className="flex size-8 items-center justify-center rounded text-xs font-bold"
                        style={{
                          backgroundColor: "var(--md-surface-container)",
                          color: "var(--md-outline)",
                        }}
                      >
                        {(r.suppliers?.name ?? "?")
                          .split(" ")
                          .map((w) => w[0])
                          .join("")
                          .slice(0, 2)
                          .toUpperCase()}
                      </div>
                      <span className="text-sm font-medium">
                        {r.suppliers?.name ?? "—"}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="px-6 py-5">
                    <StatusBadge status={r.status} />
                  </TableCell>
                  <TableCell
                    className="px-6 py-5 text-sm tabular-nums"
                    style={{ color: "var(--md-on-surface-variant)" }}
                  >
                    {new Date(r.ordered_at).toLocaleDateString("vi-VN", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                    })}
                  </TableCell>
                  <TableCell className="px-6 py-5 text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 opacity-0 transition-opacity group-hover:opacity-100"
                      asChild
                      aria-label="Chi tiết"
                    >
                      <Link href={`/inventory/purchase-orders/${r.id}`}>
                        <ArrowRight className="size-4" />
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {/* Pagination footer */}
        <div
          className="flex items-center justify-between border-t px-6 py-4"
          style={{
            borderColor:
              "color-mix(in srgb, var(--md-outline-variant) 10%, transparent)",
          }}
        >
          <span
            className="text-xs font-medium"
            style={{ color: "var(--md-outline)" }}
          >
            Hiển thị {filtered.length} / {rows.length} đơn hàng
          </span>
        </div>
      </div>
    </>
  );
}
