"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, ClipboardCheck, Plus, Search } from "lucide-react";
import type { StaffRole } from "@comtammatu/shared/auth";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Card, CardContent } from "@comtammatu/ui/components/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@comtammatu/ui/components/dialog";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@comtammatu/ui/components/input-group";
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
import { InventoryHeader } from "../_components/inventory-header";


import { createStocktakeSession, fetchStocktakeSessions } from "../actions";
import { TableEmptyStateRow } from "../_components/table-empty-state-row";

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
  routeBase = "/inventory/stocktake",
}: {
  initial: StocktakeSessionRow[];
  branches: BranchOption[];
  userRole: StaffRole;
  userBranchId: number | null;
  routeBase?: string;
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
    setSelectedBranchId(userBranchId != null ? String(userBranchId) : "");
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
      router.push(`${routeBase}/${id}`);
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
      <InventoryHeader
        title="Kiểm kê"
        actions={
          <Button type="button" onClick={handleCreate} disabled={isPending}>
            <Plus className="size-4" />
            Mo phien kiem ke
          </Button>
        }
      />
      <div className="flex-1 overflow-auto p-4">
      <div className="mx-auto max-w-7xl space-y-4">

        {/* Status filter buttons */}
        <div className="flex flex-wrap gap-2">
          {Object.entries(STATUS_META).map(([key, meta]) => {
            const count = statusCounts[key] ?? 0;
            const isActive = statusFilter === key;

            return (
              <Button
                key={key}
                type="button"
                size="sm"
                variant={isActive ? "default" : "outline"}
                onClick={() => setStatusFilter(isActive ? null : key)}
                aria-pressed={isActive}
              >
                {meta.label}
                <span className="text-xs opacity-80">{count}</span>
              </Button>
            );
          })}
          {statusFilter && (
            <Button
              type="button"
              size="sm"
              variant="link"
              onClick={() => setStatusFilter(null)}
              className="text-muted-foreground hover:text-foreground"
            >
              Xóa bộ lọc
            </Button>
          )}
        </div>

        {/* Search */}
        <Card className="py-0"><CardContent className="flex flex-wrap items-center gap-3 p-3">
          <InputGroup className="h-10 flex-1">
            <InputGroupAddon>
              <Search />
            </InputGroupAddon>
            <InputGroupInput
              placeholder="Tìm mã phiên hoặc tên chi nhánh..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </InputGroup>
          <Badge variant="outline" className="rounded-full">
            {filtered.length} / {rows.length} phiên
          </Badge>
        </CardContent></Card>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            {isMobile ? (
              <div className="space-y-3">
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
                      href={`${routeBase}/${r.id}`}
                      className="rounded-lg border bg-muted/30 text-card-foreground block p-4 transition hover:border-primary/25"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-sm font-medium">
                          KK-{r.id}
                        </span>
                        <Badge
                          className={cn("shrink-0 text-xs", meta.className)}
                        >
                          {meta.label}
                        </Badge>
                      </div>
                      <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                        <span>{r.branches?.name ?? "—"}</span>
                        <span className="tabular-nums">
                          {r.started_at
                            ? new Date(r.started_at).toLocaleDateString(
                                "vi-VN",
                                {
                                  day: "2-digit",
                                  month: "2-digit",
                                },
                              )
                            : r.created_at
                              ? new Date(r.created_at).toLocaleDateString(
                                  "vi-VN",
                                  {
                                    day: "2-digit",
                                    month: "2-digit",
                                  },
                                )
                              : "—"}
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mã phiên</TableHead>
                    <TableHead>Chi nhánh</TableHead>
                    <TableHead>Ngày bắt đầu</TableHead>
                    <TableHead>Trạng thái</TableHead>
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
                      <TableRow key={r.id}>
                        <TableCell className="font-mono text-sm font-medium">
                          KK-{r.id}
                        </TableCell>
                        <TableCell className="text-sm">
                          {r.branches?.name ?? "—"}
                        </TableCell>
                        <TableCell className="text-sm tabular-nums text-muted-foreground">
                          {r.started_at
                            ? new Date(r.started_at).toLocaleDateString(
                                "vi-VN",
                                {
                                  day: "2-digit",
                                  month: "2-digit",
                                  year: "numeric",
                                },
                              )
                            : r.created_at
                              ? new Date(r.created_at).toLocaleDateString(
                                  "vi-VN",
                                  {
                                    day: "2-digit",
                                    month: "2-digit",
                                    year: "numeric",
                                  },
                                )
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
                            size="icon-lg"
                            asChild
                            aria-label="Chi tiết"
                          >
                            <Link href={`${routeBase}/${r.id}`}>
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
      </div>
      </div>

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
