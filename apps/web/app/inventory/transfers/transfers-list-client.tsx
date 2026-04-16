"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, MoveRight, Plus, Search } from "lucide-react";
import type { StaffRole } from "@comtammatu/shared/auth";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
import { cn } from "@comtammatu/ui";
import { useIsMobile } from "@comtammatu/ui/hooks/use-mobile";
import { formatBranchSiteLabel } from "../_lib/branch-site-labels";
import { fetchStockTransfers } from "../transfer-actions";
import { CreateTransferDialog } from "./create-transfer-dialog";
import type { BranchForTransfer } from "./create-transfer-dialog";
import type { IngredientRow } from "../page";
import { TableEmptyStateRow } from "../_components/table-empty-state-row";

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
  basePath = "/inventory/transfers",
}: {
  initial: TransferListRow[];
  branches: BranchForTransfer[];
  ingredients: IngredientRow[];
  hqBranchId: number | null;
  userBranchId: number | null;
  userRole: StaffRole;
  basePath?: string;
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
  const branchLabelById = useMemo(
    () =>
      new Map(
        branches.map((branch) => [branch.id, formatBranchSiteLabel(branch)]),
      ),
    [branches],
  );

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
    router.push(`${basePath}/${id}`);
  }

  return (
    <>
      <Card className="border-border/70">
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="text-2xl">Luân chuyển nội bộ</CardTitle>
            <CardDescription>
              Trụ sở ↔ kho vận hành hoặc giữa các kho vận hành. Hàng từ NCC chỉ
              nhập tại Trụ sở (PO/GRN).
            </CardDescription>
          </div>
          <Button
            type="button"
            onClick={() => setOpen(true)}
            disabled={!canCreate}
          >
            <Plus className="mr-2 size-4" />
            Tạo phiếu
          </Button>
        </CardHeader>
      </Card>

      {!canCreate && (
        <p className="text-sm text-warning">
          Cần cấu hình Trụ sở và ít nhất một kho vận hành hoạt động.
        </p>
      )}

      {/* Status count badges */}
      <div className="flex flex-wrap gap-1.5">
        {Object.entries(STATUS_META).map(([key, meta]) => {
          const count = statusCounts[key] ?? 0;
          if (count === 0) return null;
          const isActive = statusFilter === key;
          return (
            <Button
              key={key}
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => setStatusFilter(isActive ? null : key)}
              className="h-auto rounded-full p-0 transition-opacity hover:bg-transparent"
            >
              <Badge
                className={cn(
                  "text-xs cursor-pointer",
                  isActive
                    ? meta.className
                    : "bg-muted/60 text-muted-foreground",
                )}
              >
                {meta.label} {count}
              </Badge>
            </Button>
          );
        })}
        {statusFilter && (
          <Button
            type="button"
            variant="link"
            size="xs"
            onClick={() => setStatusFilter(null)}
            className="h-auto px-0 text-muted-foreground hover:text-foreground"
          >
            Xóa bộ lọc
          </Button>
        )}
      </div>

      {/* Table card */}
      <Card className="overflow-hidden rounded-lg">
        <CardContent className="p-4 md:p-5">
          {/* Search bar */}
          <div className="-m-4 flex items-center gap-3 border-b bg-muted/20 px-4 py-3 md:-m-5 md:px-5">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <Input
              placeholder="Tìm số phiếu hoặc tên kho…"
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
                const meta = STATUS_META[r.status] ?? {
                  label: r.status,
                  className: "bg-muted text-muted-foreground",
                };
                return (
                  <Link
                    key={r.id}
                    href={`${basePath}/${r.id}`}
                    className="block px-4 py-3 hover:bg-muted/20 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-sm font-medium">
                        {r.transfer_number}
                      </span>
                      <Badge className={cn("text-xs shrink-0", meta.className)}>
                        {meta.label}
                      </Badge>
                    </div>
                    <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span>
                        {branchLabelById.get(r.from_branch_id) ??
                          r.from_branch_name}
                      </span>
                      <MoveRight className="size-3 shrink-0" />
                      <span>
                        {branchLabelById.get(r.to_branch_id) ??
                          r.to_branch_name}
                      </span>
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
                <TableRow className="bg-muted/20 hover:bg-muted/20">
                  <TableHead className="text-xs font-semibold uppercase tracking-wider">
                    Số phiếu
                  </TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider">
                    Lộ trình
                  </TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider">
                    Trạng thái
                  </TableHead>
                  <TableHead className="hidden md:table-cell text-xs font-semibold uppercase tracking-wider">
                    Ngày tạo
                  </TableHead>
                  <TableHead className="hidden lg:table-cell text-xs font-semibold uppercase tracking-wider">
                    Ngày xuất / nhận
                  </TableHead>
                  <TableHead className="w-10" />
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
                  const meta = STATUS_META[r.status] ?? {
                    label: r.status,
                    className: "bg-muted text-muted-foreground",
                  };
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
                      className="group hover:bg-muted/30 transition-colors"
                    >
                      <TableCell className="font-mono text-sm font-medium">
                        {r.transfer_number}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5 text-sm">
                          <span className="font-medium">
                            {branchLabelById.get(r.from_branch_id) ??
                              r.from_branch_name}
                          </span>
                          <MoveRight className="size-3.5 shrink-0 text-muted-foreground" />
                          <span className="font-medium">
                            {branchLabelById.get(r.to_branch_id) ??
                              r.to_branch_name}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={cn("text-xs", meta.className)}>
                          {meta.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-muted-foreground tabular-nums">
                        {new Date(r.created_at).toLocaleDateString("vi-VN", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                        })}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        {dateLabel ? (
                          <span className="text-sm text-muted-foreground tabular-nums">
                            <span className="mr-1 text-xs text-muted-foreground/70">
                              {dateLabel}:
                            </span>
                            {dateDisplay}
                          </span>
                        ) : (
                          <span className="text-sm text-muted-foreground">
                            —
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon-lg"
                          asChild
                          aria-label="Chi tiết"
                        >
                          <Link href={`${basePath}/${r.id}`}>
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
        </CardContent>
      </Card>

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
