"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, MoveRight, Plus, Search } from "lucide-react";
import type { StaffRole } from "@comtammatu/shared/auth";
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
import { useIsMobile } from "@comtammatu/ui/hooks/use-mobile";
import { fetchStockTransfers } from "../transfer-actions";
import { CreateTransferDialog } from "./create-transfer-dialog";
import type { BranchForTransfer } from "./create-transfer-dialog";
import type { IngredientRow } from "../page";
import { TableEmptyStateRow } from "../../admin/components/table-empty-state-row";
import { StatusBadge } from "../_components/shared";

export type { BranchForTransfer };

export interface TransferListRow {
  id: number;
  transfer_number: string;
  status: string;
  notes: string | null;
  vehicle_info: string | null;
  shipped_at: string | null;
  received_at: string | null;
  receive_started_at: string | null;
  from_branch_id: number;
  to_branch_id: number;
  created_at: string;
  from_branch_name: string;
  to_branch_name: string;
}

const STATUS_META: Record<string, { label: string; className: string }> = {
  draft: {
    label: "Nháp",
    className: "bg-muted text-muted-foreground",
  },
  confirmed_ship: {
    label: "Đã xuất kho",
    className: "bg-info/10 text-info border-info/30",
  },
  in_transit: {
    label: "Đang vận chuyển",
    className: "bg-info/10 text-info border-info/30",
  },
  confirmed_receive: {
    label: "Đang kiểm nhận",
    className: "bg-warning/10 text-warning border-warning/30",
  },
  received: {
    label: "Đã nhận",
    className: "bg-success/10 text-success border-success/30",
  },
  cancelled: {
    label: "Đã hủy",
    className: "bg-destructive/10 text-destructive border-destructive/30",
  },
};

export function TransfersListClient({
  initial,
  branches,
  ingredients,
  hqBranchId,
  userBranchId,
  userRole,
}: {
  initial: TransferListRow[];
  branches: BranchForTransfer[];
  ingredients: IngredientRow[];
  hqBranchId: number | null;
  userBranchId: number | null;
  userRole: StaffRole;
}) {
  const router = useRouter();
  const isMobile = useIsMobile();
  const [rows, setRows] = useState(initial);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  const hq = branches.find((b) => b.is_headquarters);
  const operational = branches.filter((b) => !b.is_headquarters);
  const canCreate = Boolean(hq && operational.length >= 1);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of rows) {
      counts[r.status] = (counts[r.status] ?? 0) + 1;
    }
    return counts;
  }, [rows]);

  const filtered = useMemo(() => {
    let list = rows;
    if (statusFilter) {
      list = list.filter((r) => r.status === statusFilter);
    }
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          r.transfer_number.toLowerCase().includes(q) ||
          r.from_branch_name.toLowerCase().includes(q) ||
          r.to_branch_name.toLowerCase().includes(q),
      );
    }
    return list;
  }, [rows, search, statusFilter]);

  function handleCreated(id: number) {
    fetchStockTransfers().then((res) => {
      if (res.success) setRows((res.data ?? []) as TransferListRow[]);
    });
    router.push(`/inventory/transfers/${id}`);
  }

  return (
    <>
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1
            className="text-2xl font-bold tracking-tight"
            style={{ color: "var(--md-on-surface)" }}
          >
            Luân chuyển nội bộ
          </h1>
          <p
            className="mt-1 text-sm text-muted-foreground"
            style={{ color: "var(--md-on-surface-variant)", opacity: 0.7 }}
          >
            Trụ sở ↔ chi nhánh hoặc chi nhánh ↔ chi nhánh. Hàng từ NCC chỉ nhập
            tại Trụ sở (PO/GRN).
          </p>
        </div>
        <Button
          type="button"
          onClick={() => setOpen(true)}
          disabled={!canCreate}
        >
          <Plus className="mr-2 size-4" />
          Tạo phiếu
        </Button>
      </div>

      {!canCreate && (
        <p className="text-sm text-warning">
          Cần cấu hình Trụ sở và ít nhất một chi nhánh vận hành hoạt động.
        </p>
      )}

      {/* Status segmented control */}
      <div
        className="flex gap-1 rounded-2xl p-1"
        style={{ backgroundColor: "var(--md-surface-low)" }}
      >
        {Object.entries(STATUS_META).map(([key, meta]) => {
          const count = statusCounts[key] ?? 0;
          if (count === 0) return null;
          const isActive = statusFilter === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setStatusFilter(isActive ? null : key)}
              className="rounded-xl px-3 py-1.5 text-xs font-medium transition-colors"
              style={
                isActive
                  ? { backgroundColor: "white", color: "var(--md-primary)" }
                  : { color: "var(--md-on-surface-variant)" }
              }
            >
              {meta.label} {count}
            </button>
          );
        })}
        {statusFilter && (
          <button
            type="button"
            onClick={() => setStatusFilter(null)}
            className="rounded-xl px-3 py-1.5 text-xs font-medium transition-colors"
            style={{ color: "var(--md-on-surface-variant)" }}
          >
            Xóa bộ lọc
          </button>
        )}
      </div>

      {/* Table card */}
      <div
        className="overflow-hidden rounded-3xl ambient-shadow"
        style={{
          backgroundColor: "var(--md-surface-lowest)",
          border:
            "1px solid color-mix(in srgb, var(--md-outline-variant) 5%, transparent)",
        }}
      >
        {/* Search bar */}
        <div
          className="flex items-center gap-3 border-b px-4 py-3"
          style={{
            borderColor:
              "color-mix(in srgb, var(--md-outline-variant) 10%, transparent)",
          }}
        >
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <Input
            placeholder="Tìm số phiếu hoặc tên chi nhánh…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0"
          />
          <span className="shrink-0 text-xs text-muted-foreground">
            {filtered.length} / {rows.length}
          </span>
        </div>

        {/* Mobile card layout */}
        {isMobile ? (
          <div className="divide-y">
            {filtered.length === 0 && (
              <div className="px-4 py-16 text-center">
                <p className="text-sm font-medium text-muted-foreground">
                  {search || statusFilter
                    ? "Không tìm thấy phiếu nào"
                    : "Chưa có phiếu luân chuyển"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {search || statusFilter
                    ? "Thử từ khóa khác"
                    : 'Nhấn "Tạo phiếu" để tạo phiếu luân chuyển đầu tiên'}
                </p>
              </div>
            )}
            {filtered.map((r) => {
              return (
                <Link
                  key={r.id}
                  href={`/inventory/transfers/${r.id}`}
                  className="block px-4 py-3 hover:bg-muted/20 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-sm font-medium">
                      {r.transfer_number}
                    </span>
                    <StatusBadge status={r.status} />
                  </div>
                  <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span>{r.from_branch_name}</span>
                    <MoveRight className="size-3 shrink-0" />
                    <span>{r.to_branch_name}</span>
                    <span className="ml-auto tabular-nums">
                      {new Date(r.created_at).toLocaleDateString("vi-VN", {
                        day: "2-digit",
                        month: "2-digit",
                      })}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          /* Desktop table layout */
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead
                  className="px-6 py-5 text-xs font-bold uppercase tracking-widest"
                  style={{ color: "var(--md-outline)" }}
                >
                  Số phiếu
                </TableHead>
                <TableHead
                  className="px-6 py-5 text-xs font-bold uppercase tracking-widest"
                  style={{ color: "var(--md-outline)" }}
                >
                  Lộ trình
                </TableHead>
                <TableHead
                  className="px-6 py-5 text-xs font-bold uppercase tracking-widest"
                  style={{ color: "var(--md-outline)" }}
                >
                  Trạng thái
                </TableHead>
                <TableHead
                  className="hidden md:table-cell px-6 py-5 text-xs font-bold uppercase tracking-widest"
                  style={{ color: "var(--md-outline)" }}
                >
                  Ngày tạo
                </TableHead>
                <TableHead
                  className="hidden lg:table-cell px-6 py-5 text-xs font-bold uppercase tracking-widest"
                  style={{ color: "var(--md-outline)" }}
                >
                  Ngày xuất / nhận
                </TableHead>
                <TableHead className="w-10 px-6 py-5" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableEmptyStateRow
                  colSpan={6}
                  paddingClassName="py-16"
                  title={
                    search || statusFilter
                      ? "Không tìm thấy phiếu nào"
                      : "Chưa có phiếu luân chuyển"
                  }
                  description={
                    search || statusFilter
                      ? "Thử từ khóa khác"
                      : 'Nhấn "Tạo phiếu" để tạo phiếu luân chuyển đầu tiên'
                  }
                />
              )}
              {filtered.map((r) => {
                const dateDisplay = r.shipped_at
                  ? new Date(r.shipped_at).toLocaleDateString("vi-VN", {
                      day: "2-digit",
                      month: "2-digit",
                    })
                  : r.received_at
                    ? new Date(r.received_at).toLocaleDateString("vi-VN", {
                        day: "2-digit",
                        month: "2-digit",
                      })
                    : "—";
                const dateLabel = r.shipped_at
                  ? "Xuất"
                  : r.received_at
                    ? "Nhận"
                    : null;

                return (
                  <TableRow
                    key={r.id}
                    className="group transition-colors"
                    style={{
                      borderColor:
                        "color-mix(in srgb, var(--md-outline-variant) 10%, transparent)",
                    }}
                  >
                    <TableCell className="px-6 py-5 font-mono text-sm font-medium">
                      <Link
                        href={`/inventory/transfers/${r.id}`}
                        className="hover:underline"
                        style={{ color: "var(--md-primary)" }}
                      >
                        {r.transfer_number}
                      </Link>
                    </TableCell>
                    <TableCell className="px-6 py-5">
                      <div className="flex items-center gap-1.5 text-sm">
                        <span className="font-medium">
                          {r.from_branch_name}
                        </span>
                        <MoveRight className="size-3.5 shrink-0 text-muted-foreground" />
                        <span className="font-medium">{r.to_branch_name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="px-6 py-5">
                      <StatusBadge status={r.status} />
                    </TableCell>
                    <TableCell className="hidden md:table-cell px-6 py-5 text-sm text-muted-foreground tabular-nums">
                      {new Date(r.created_at).toLocaleDateString("vi-VN", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                      })}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell px-6 py-5">
                      {dateLabel ? (
                        <span className="text-sm text-muted-foreground tabular-nums">
                          <span className="mr-1 text-xs text-muted-foreground/70">
                            {dateLabel}:
                          </span>
                          {dateDisplay}
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="px-6 py-5">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 opacity-0 transition-opacity group-hover:opacity-100"
                        asChild
                        aria-label="Chi tiết"
                      >
                        <Link href={`/inventory/transfers/${r.id}`}>
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
            Hiển thị {filtered.length} / {rows.length} phiếu
          </span>
        </div>
      </div>

      <CreateTransferDialog
        open={open}
        onOpenChange={setOpen}
        branches={branches}
        ingredients={ingredients}
        hqBranchId={hqBranchId}
        userBranchId={userBranchId}
        userRole={userRole}
        onCreated={handleCreated}
      />
    </>
  );
}
