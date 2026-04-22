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
import { StatusBadge } from "../_components/status-badge";
import { InteractiveCard } from "../_components/interactive-card";
import { TableEmptyStateRow } from "../_components/table-empty-state-row";
import { createStocktakeSession, fetchStocktakeSessions } from "../actions";

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

function formatDateShort(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

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
  const [statusFilter, setStatusFilter] = useState<string>("all");
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
    if (statusFilter !== "all") {
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
            Mở phiên kiểm kê
          </Button>
        }
      />
      <div className="flex-1 overflow-auto p-4">
        <div className={cn("mx-auto space-y-4", isMobile ? "max-w-xl" : "max-w-7xl")}>

          {/* Filters */}
          <Card className="py-0">
            <CardContent className="flex flex-wrap items-center gap-3 p-3">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Trạng thái" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả trạng thái</SelectItem>
                  <SelectItem value="in_progress">
                    Đang thực hiện ({statusCounts["in_progress"] ?? 0})
                  </SelectItem>
                  <SelectItem value="completed">
                    Hoàn tất ({statusCounts["completed"] ?? 0})
                  </SelectItem>
                  <SelectItem value="cancelled">
                    Đã hủy ({statusCounts["cancelled"] ?? 0})
                  </SelectItem>
                </SelectContent>
              </Select>

              <InputGroup className={cn("flex-1", isMobile && "h-12 basis-full")}>
                <InputGroupAddon>
                  <Search />
                </InputGroupAddon>
                <InputGroupInput
                  placeholder="Tìm mã phiên hoặc tên chi nhánh..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  inputMode="search"
                />
              </InputGroup>

              <Badge variant="outline" className="rounded-full">
                {filtered.length}/{rows.length}
              </Badge>
            </CardContent>
          </Card>

          {/* Content */}
          {isMobile ? (
            <div className="flex flex-col gap-2">
              {filtered.length === 0 ? (
                <div className="px-4 py-16 text-center">
                  <ClipboardCheck className="mx-auto size-10 text-muted-foreground/40" />
                  <p className="mt-2 text-sm font-medium text-muted-foreground">
                    {search || statusFilter !== "all"
                      ? "Không tìm thấy phiên nào"
                      : "Chưa có phiên kiểm kê nào"}
                  </p>
                </div>
              ) : (
                filtered.map((r) => (
                  <InteractiveCard
                    key={r.id}
                    minHeight="mobile"
                    padding="default"
                    asChild
                  >
                    <Link href={`${routeBase}/${r.id}`} className="flex-col items-stretch gap-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-sm font-medium">KK-{r.id}</span>
                        <StatusBadge status={r.status} />
                      </div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{r.branches?.name ?? "—"}</span>
                        <span className="tabular-nums">{formatDateShort(r.started_at ?? r.created_at)}</span>
                      </div>
                    </Link>
                  </InteractiveCard>
                ))
              )}
            </div>
          ) : (
            <Card>
              <CardContent className="p-0">
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
                    {filtered.length === 0 ? (
                      <TableEmptyStateRow
                        colSpan={5}
                        paddingClassName="py-16"
                        icon={
                          <ClipboardCheck className="mx-auto size-10 text-muted-foreground/40" />
                        }
                        title={
                          search || statusFilter !== "all"
                            ? "Không tìm thấy phiên nào"
                            : "Chưa có phiên kiểm kê nào"
                        }
                      />
                    ) : null}
                    {filtered.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-mono text-sm font-medium">
                          KK-{r.id}
                        </TableCell>
                        <TableCell className="text-sm">
                          {r.branches?.name ?? "—"}
                        </TableCell>
                        <TableCell className="text-sm tabular-nums text-muted-foreground">
                          {formatDateShort(r.started_at ?? r.created_at)}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={r.status} />
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
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
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
