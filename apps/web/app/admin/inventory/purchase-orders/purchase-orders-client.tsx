"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Plus, Search } from "lucide-react";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Input } from "@comtammatu/ui/components/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
import { cn } from "@comtammatu/ui";
import type { SupplierRow } from "../suppliers/suppliers-client";
import { TableEmptyStateRow } from "../../components/table-empty-state-row";
import { EmptyStatePanel } from "../../components/empty-state-panel";

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

export function PurchaseOrdersClient({
  initial,
  suppliers,
}: {
  initial: PurchaseOrderRow[];
  suppliers: SupplierRow[];
}) {
  const [rows] = useState(initial);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.po_number.toLowerCase().includes(q) ||
        (r.suppliers?.name ?? "").toLowerCase().includes(q),
    );
  }, [rows, search]);

  return (
    <>
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Đơn đặt hàng (PO)
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            PO chỉ tạo cho kho Trụ sở. Dùng khi cần tham chiếu trước khi lập
            GRN.
          </p>
        </div>
        <Button asChild disabled={suppliers.length === 0}>
          <Link href="/admin/inventory/purchase-orders/new">
            <Plus className="mr-2 size-4" />
            Tạo PO
          </Link>
        </Button>
      </div>

      {suppliers.length === 0 && (
        <EmptyStatePanel
          className="border-warning/40 bg-warning/10 py-6"
          title="Chưa có nhà cung cấp"
          description="Cần tạo nhà cung cấp trước khi lập đơn đặt hàng."
        >
          <Link
            href="/admin/inventory/suppliers"
            className="text-sm font-medium text-warning underline hover:opacity-80"
          >
            Đi đến trang Nhà cung cấp
          </Link>
        </EmptyStatePanel>
      )}

      {/* Table card */}
      <div className="rounded-lg border shadow-sm overflow-hidden">
        {/* Search bar */}
        <div className="flex items-center gap-3 border-b bg-muted/20 px-4 py-3">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <Input
            placeholder="Tìm số PO hoặc nhà cung cấp…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0"
          />
          <span className="shrink-0 text-xs text-muted-foreground">
            {filtered.length} / {rows.length}
          </span>
        </div>

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
                  search ? "Không tìm thấy PO nào" : "Chưa có đơn đặt hàng"
                }
                description={
                  search
                    ? "Thử từ khóa khác"
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
                      className="size-8 opacity-0 group-hover:opacity-100 transition-opacity"
                      asChild
                    >
                      <Link href={`/admin/inventory/purchase-orders/${r.id}`}>
                        <ArrowRight className="size-4" />
                        <span className="sr-only">Chi tiết</span>
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
