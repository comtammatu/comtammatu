"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, LogOut, Plus, Search } from "lucide-react";
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
import { createStockIssueDraft } from "../issue-actions";
import { TableEmptyStateRow } from "../../components/table-empty-state-row";
import { normalizeSearch } from "@lib/search";

export interface StockIssueRow {
  id: number;
  issue_number: string;
  issue_type: string;
  status: string;
  notes: string | null;
  issued_at: string;
  branch_id: number;
  branches: { id: number; name: string } | null;
}

const STATUS_META: Record<string, { label: string; className: string }> = {
  draft: {
    label: "Nháp",
    className: "bg-muted text-muted-foreground",
  },
  confirmed: {
    label: "Đã xuất kho",
    className: "bg-success/10 text-success border-success/30",
  },
  cancelled: {
    label: "Đã hủy",
    className: "bg-destructive/10 text-destructive border-destructive/30",
  },
};

const TYPE_LABEL: Record<string, string> = {
  consumption: "Tiêu hao",
  writeoff: "Thanh lý",
  kitchen_use: "Bếp",
  other: "Khác",
};

interface BranchOption {
  id: number;
  name: string;
}

export function IssuesListClient({
  initial,
  branches,
  defaultBranchId,
}: {
  initial: StockIssueRow[];
  branches: BranchOption[];
  defaultBranchId: number | null;
}) {
  const router = useRouter();
  const isMobile = useIsMobile();
  const [rows] = useState(initial);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [branchId, setBranchId] = useState(
    defaultBranchId ? String(defaultBranchId) : "",
  );
  const [issueType, setIssueType] = useState("consumption");
  const [notes, setNotes] = useState("");
  const [isPending, startTransition] = useTransition();

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
    if (typeFilter) {
      list = list.filter((r) => r.issue_type === typeFilter);
    }
    const q = normalizeSearch(search);
    if (q) {
      list = list.filter(
        (r) =>
          normalizeSearch(r.issue_number).includes(q) ||
          normalizeSearch(r.branches?.name ?? "").includes(q) ||
          normalizeSearch(TYPE_LABEL[r.issue_type] ?? r.issue_type).includes(q),
      );
    }
    return list;
  }, [rows, search, statusFilter, typeFilter]);

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const bId = Number(branchId);
    if (!bId) {
      toast.error("Chọn chi nhánh");
      return;
    }
    startTransition(async () => {
      const res = await createStockIssueDraft({
        branchId: bId,
        issueType: issueType as
          | "consumption"
          | "writeoff"
          | "kitchen_use"
          | "other",
        notes: notes.trim() || undefined,
      });
      if (!res.success) {
        toast.error(res.error ?? "Không tạo được phiếu xuất");
        return;
      }
      const newId = (res.data as { id: number }).id;
      toast.success(`Đã tạo phiếu PX-${newId}`);
      setDialogOpen(false);
      setNotes("");
      router.push(`/admin/inventory/issues/${newId}`);
    });
  }

  return (
    <>
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Phiếu xuất kho</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Ghi nhận hàng hóa xuất khỏi kho (tiêu hao, thanh lý, bếp dùng)
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="mr-2 size-4" />
          Tạo phiếu xuất
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
                  isActive
                    ? meta.className
                    : "bg-muted/60 text-muted-foreground",
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
      <div className="rounded-lg border shadow-sm overflow-hidden">
        {/* Search + type filter */}
        <div className="flex items-center gap-3 border-b bg-muted/20 px-4 py-3">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <Input
            placeholder="Tìm phiếu xuất…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0"
          />
          <Select
            value={typeFilter ?? "all"}
            onValueChange={(v) => setTypeFilter(v === "all" ? null : v)}
          >
            <SelectTrigger className="h-8 w-28 shrink-0 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả</SelectItem>
              <SelectItem value="consumption">Tiêu hao</SelectItem>
              <SelectItem value="kitchen_use">Bếp</SelectItem>
              <SelectItem value="writeoff">Thanh lý</SelectItem>
              <SelectItem value="other">Khác</SelectItem>
            </SelectContent>
          </Select>
          <span className="shrink-0 text-xs text-muted-foreground">
            {filtered.length} / {rows.length}
          </span>
        </div>

        {/* Mobile card layout */}
        {isMobile ? (
          <div className="divide-y">
            {filtered.length === 0 && (
              <div className="px-4 py-16 text-center">
                <LogOut className="mx-auto mb-3 size-10 opacity-20" />
                <p className="text-sm font-medium text-muted-foreground">
                  {search || statusFilter || typeFilter
                    ? "Không tìm thấy kết quả"
                    : "Chưa có phiếu xuất kho"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {search || statusFilter || typeFilter
                    ? "Thử tìm kiếm với từ khóa khác"
                    : 'Nhấn "Tạo phiếu xuất" để bắt đầu'}
                </p>
              </div>
            )}
            {filtered.map((r) => {
              const statusMeta = STATUS_META[r.status] ?? {
                label: r.status,
                className: "bg-muted text-muted-foreground",
              };
              return (
                <Link
                  key={r.id}
                  href={`/admin/inventory/issues/${r.id}`}
                  className="block px-4 py-3 hover:bg-muted/20 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-sm font-medium">
                      {r.issue_number}
                    </span>
                    <Badge
                      className={cn("text-xs shrink-0", statusMeta.className)}
                    >
                      {statusMeta.label}
                    </Badge>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      {r.branches?.name ?? "—"} ·{" "}
                      {TYPE_LABEL[r.issue_type] ?? r.issue_type}
                    </span>
                    <span className="tabular-nums">
                      {new Date(r.issued_at).toLocaleDateString("vi-VN", {
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
          /* Desktop table */
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/20 hover:bg-muted/20">
                <TableHead className="text-xs font-semibold uppercase tracking-wider">
                  Số phiếu
                </TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider">
                  Chi nhánh
                </TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider">
                  Loại xuất
                </TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider">
                  Ngày xuất
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
                  colSpan={6}
                  paddingClassName="py-16"
                  title={
                    search || statusFilter || typeFilter
                      ? "Không tìm thấy kết quả"
                      : "Chưa có phiếu xuất kho"
                  }
                  description={
                    search || statusFilter || typeFilter
                      ? "Thử tìm kiếm với từ khóa khác"
                      : 'Nhấn "Tạo phiếu xuất" để bắt đầu'
                  }
                  icon={<LogOut className="mx-auto mb-3 size-10 opacity-20" />}
                />
              )}
              {filtered.map((r) => {
                const statusMeta = STATUS_META[r.status] ?? {
                  label: r.status,
                  className: "bg-muted text-muted-foreground",
                };
                return (
                  <TableRow
                    key={r.id}
                    className="hover:bg-muted/30 transition-colors"
                  >
                    <TableCell className="font-mono font-medium">
                      {r.issue_number}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {r.branches?.name ?? "—"}
                    </TableCell>
                    <TableCell>
                      {TYPE_LABEL[r.issue_type] ?? r.issue_type}
                    </TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">
                      {new Date(r.issued_at).toLocaleDateString("vi-VN")}
                    </TableCell>
                    <TableCell>
                      <Badge className={cn("text-xs", statusMeta.className)}>
                        {statusMeta.label}
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
                        <Link href={`/admin/inventory/issues/${r.id}`}>
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

      {/* Create dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tạo phiếu xuất kho</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Chi nhánh *</Label>
              <Select value={branchId} onValueChange={setBranchId} required>
                <SelectTrigger>
                  <SelectValue placeholder="Chọn chi nhánh…" />
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

            <div className="space-y-1.5">
              <Label>Loại xuất *</Label>
              <Select value={issueType} onValueChange={setIssueType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="consumption">Tiêu hao (COGS)</SelectItem>
                  <SelectItem value="kitchen_use">Bếp dùng nội bộ</SelectItem>
                  <SelectItem value="writeoff">Thanh lý / hỏng</SelectItem>
                  <SelectItem value="other">Khác</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="notes">Ghi chú</Label>
              <Input
                id="notes"
                placeholder="Ghi chú tùy chọn…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
              >
                Hủy
              </Button>
              <Button type="submit" disabled={isPending || !branchId}>
                {isPending ? "Đang tạo…" : "Tạo phiếu"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
