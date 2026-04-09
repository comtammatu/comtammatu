"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, ClipboardCheck, Plus, Search } from "lucide-react";
import type { StaffRole } from "@comtammatu/shared/auth";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@comtammatu/ui/components/dialog";
import { Input } from "@comtammatu/ui/components/input";
import { Label } from "@comtammatu/ui/components/label";
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
import { toast } from "@comtammatu/ui/components/sonner";
import { cn } from "@comtammatu/ui";
import { useIsMobile } from "@comtammatu/ui/hooks/use-mobile";
import { createStocktakeSession, fetchStocktakeSessions } from "../actions";
import { TableEmptyStateRow } from "../../components/table-empty-state-row";

export interface StocktakeSessionRow {
  id: number;
  branch_id: number;
  started_at: string | null;
  completed_at: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  created_by: string;
  branches: { id: number; name: string } | null;
}

export interface BranchOption {
  id: number;
  name: string;
  is_active: boolean;
}

const STATUS_META: Record<string, { label: string; className: string }> = {
  in_progress: {
    label: "Đang thực hiện",
    className: "bg-warning/10 text-warning border-warning/30",
  },
  completed: {
    label: "Hoàn tất",
    className: "bg-success/10 text-success border-success/30",
  },
  cancelled: {
    label: "Đã hủy",
    className: "bg-muted text-muted-foreground",
  },
};

export function StocktakeListClient({
  initial,
  branches,
  userRole: _userRole,
  userBranchId,
}: {
  initial: StocktakeSessionRow[];
  branches: BranchOption[];
  userRole: StaffRole;
  userBranchId: number | null;
}) {
  const router = useRouter();
  const isMobile = useIsMobile();
  const [rows, setRows] = useState(initial);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedBranchId, setSelectedBranchId] = useState("");

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
          `KK-${r.id}`.toLowerCase().includes(q) ||
          (r.branches?.name ?? "").toLowerCase().includes(q),
      );
    }
    return list;
  }, [rows, search, statusFilter]);

  function handleCreate() {
    // Always show dialog to select branch (unified flow)
    setSelectedBranchId(
      userBranchId != null ? String(userBranchId) : "",
    );
    setDialogOpen(true);
  }

  function doCreate(branchId: number) {
    startTransition(async () => {
      const res = await createStocktakeSession(branchId);
      if (!res.success) {
        toast.error(res.error ?? "Không thể tạo phiên kiểm kê.");
        return;
      }
      toast.success("Đã tạo phiên kiểm kê");
      setDialogOpen(false);
      const again = await fetchStocktakeSessions();
      if (again.success) setRows((again.data ?? []) as StocktakeSessionRow[]);
      const id = (res.data as { id: number }).id;
      router.push(`/admin/inventory/stocktake/${id}`);
    });
  }

  function handleDialogConfirm() {
    const bid = Number(selectedBranchId);
    if (!bid) {
      toast.error("Chọn chi nhánh");
      return;
    }
    doCreate(bid);
  }

  return (
    <>
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Kiểm kê kho</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Tạo phiên kiểm kê, đếm thực tế và đối chinh xéch kho.
          </p>
        </div>
        <Button type="button" onClick={handleCreate} disabled={isPending}>
          <Plus className="mr-2 size-4" />
          Tạo kiểm kê
        </Button>
      </div>

      {/* Status count badges */}
      <div className="flex flex-wrap gap-1.5">
        {Object.entries(STATUS_META).map(([key, meta]) => {
          const count = statusCounts[key] ?? 0;
          if (count === 0) return null;
          const isActive = statusFilter === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setStatusFilter(isActive ? null : key)}
              className="transition-opacity"
            >
              <Badge
                className={cn(
                  "text-xs cursor-pointer",
                  isActive ? meta.className : "bg-muted/60 text-muted-foreground",
                )}
              >
                {meta.label} {count}
              </Badge>
            </button>
          );
        })}
        {statusFilter && (
          <button
            type="button"
            onClick={() => setStatusFilter(null)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Xóa bộ lọc
          </button>
        )}
      </div>

      {/* Table card */}
      <div className="overflow-hidden rounded-lg border shadow-sm">
        {/* Search bar */}
        <div className="flex items-center gap-3 border-b bg-muted/20 px-4 py-3">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <Input
            placeholder="Tìm mã phiên hoặc tên chi nhánh…"
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
                <ClipboardCheck className="mx-auto size-10 text-muted-foreground/40" />
                <p className="mt-2 text-sm font-medium text-muted-foreground">
                  {search || statusFilter
                    ? "Không tìm thấy phiên nào"
                    : "Chưa có phiên kiểm kê nào"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {search || statusFilter
                    ? "Thử từ khóa khác"
                    : 'Nhấn "Tạo kiểm kê" để bắt đầu'}
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
                  href={`/admin/inventory/stocktake/${r.id}`}
                  className="block px-4 py-3 hover:bg-muted/20 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-sm font-medium">
                      KK-{r.id}
                    </span>
                    <Badge className={cn("text-xs shrink-0", meta.className)}>
                      {meta.label}
                    </Badge>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                    <span>{r.branches?.name ?? "—"}</span>
                    <span className="tabular-nums">
                      {r.started_at
                        ? new Date(r.started_at).toLocaleDateString("vi-VN", {
                            day: "2-digit",
                            month: "2-digit",
                          })
                        : r.created_at
                          ? new Date(r.created_at).toLocaleDateString("vi-VN", {
                              day: "2-digit",
                              month: "2-digit",
                            })
                          : "—"}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          /* Desktop table */
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/20 hover:bg-muted/20">
                <TableHead className="text-xs font-semibold uppercase tracking-wider">
                  Mã phiên
                </TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider">
                  Chi nhánh
                </TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider">
                  Ngày bắt đầu
                </TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider">
                  Trạng thái
                </TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableEmptyStateRow
                  colSpan={5}
                  paddingClassName="py-16"
                  icon={
                    <ClipboardCheck className="mx-auto size-10 text-muted-foreground/40" />
                  }
                  title={
                    search || statusFilter
                      ? "Không tìm thấy phiên nào"
                      : "Chưa có phiên kiểm kê nào"
                  }
                  description={
                    search || statusFilter
                      ? "Thử từ khóa khác"
                      : 'Nhấn "Tạo kiểm kê" để bắt đầu'
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
                    className="group transition-colors hover:bg-muted/30"
                  >
                    <TableCell className="font-mono text-sm font-medium">
                      KK-{r.id}
                    </TableCell>
                    <TableCell className="text-sm">
                      {r.branches?.name ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground tabular-nums">
                      {r.started_at
                        ? new Date(r.started_at).toLocaleDateString("vi-VN", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                          })
                        : r.created_at
                          ? new Date(r.created_at).toLocaleDateString("vi-VN", {
                              day: "2-digit",
                              month: "2-digit",
                              year: "numeric",
                            })
                          : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge className={cn("text-xs", meta.className)}>
                        {meta.label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        asChild
                        aria-label="Chi tiết"
                      >
                        <Link href={`/admin/inventory/stocktake/${r.id}`}>
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
      </div>

      {/* Branch select dialog — always shown */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Chọn chi nhánh kiểm kê</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Label htmlFor="branch-select">Chi nhánh</Label>
            <Select
              value={selectedBranchId}
              onValueChange={setSelectedBranchId}
            >
              <SelectTrigger id="branch-select">
                <SelectValue placeholder="Chọn chi nhánh..." />
              </SelectTrigger>
              <SelectContent>
                {branches.map((b) => (
                  <SelectItem key={b.id} value={String(b.id)}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={isPending}
            >
              Hủy
            </Button>
            <Button
              onClick={handleDialogConfirm}
              disabled={isPending || !selectedBranchId}
            >
              {isPending ? "Đang tạo..." : "Tạo phiên"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
