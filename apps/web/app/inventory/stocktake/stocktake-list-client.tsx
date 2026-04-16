"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, ClipboardCheck, Plus, Search } from "lucide-react";
import type { StaffRole } from "@comtammatu/shared/auth";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@comtammatu/ui/components/card";
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
import { tRoute } from "../_lib/dictionary";
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
      <div className="space-y-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">
              Kiem soat cuoi ca
            </p>
            <div className="space-y-1">
              <h1 className="text-3xl font-semibold tracking-tight">
                {tRoute("/inventory/stocktake")}
              </h1>
              <p className="text-sm text-muted-foreground">
                Mo phien kiem ke, ghi so luong thuc te va chot chenh lech nhu
                lop kiem soat cuoi ngay thay vi mot module tach roi khoi van
                hanh.
              </p>
            </div>
          </div>
          <Button type="button" onClick={handleCreate} disabled={isPending}>
            <Plus className="size-4" />
            Mo phien kiem ke
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {Object.entries(STATUS_META).map(([key, meta]) => {
            const count = statusCounts[key] ?? 0;
            const isActive = statusFilter === key;

            return (
              <button
                key={key}
                type="button"
                onClick={() => setStatusFilter(isActive ? null : key)}
                className={cn(
                  "rounded-lg border bg-card p-4 text-card-foreground shadow-sm text-left transition",
                  isActive && "ring-2 ring-primary/25",
                )}
              >
                <Badge className={cn("w-fit", meta.className)}>
                  {meta.label}
                </Badge>
                <p className="mt-4 text-3xl font-semibold tabular-nums">
                  {String(count).padStart(2, "0")}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {key === "in_progress"
                    ? "Phiên đang mở để nhập số lượng thực đếm."
                    : key === "completed"
                      ? "Phiên đã chốt và sẵn sàng đối chiếu kết quả."
                      : "Phiên đã dừng và không còn hiệu lực chỉnh sửa."}
                </p>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3">
          <div className="relative min-w-[16rem] flex-1">
            <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Tìm mã phiên hoặc tên chi nhánh…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          <Badge variant="outline" className="rounded-full">
            {filtered.length} / {rows.length} phiên
          </Badge>
          {statusFilter && (
            <Button
              type="button"
              variant="link"
              onClick={() => setStatusFilter(null)}
              className="text-muted-foreground hover:text-foreground"
            >
              Xóa bộ lọc
            </Button>
          )}
        </div>

        <Card className="overflow-hidden">
          <CardHeader className="gap-1">
            <CardTitle>Danh sách phiên kiểm kê</CardTitle>
            <p className="text-sm text-muted-foreground">
              Theo doi cac phien dang mo, da chot hoac da huy theo tung chi
              nhanh.
            </p>
          </CardHeader>
          <CardContent className="p-6 pt-0">
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
