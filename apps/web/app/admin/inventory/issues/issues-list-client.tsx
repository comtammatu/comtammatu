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
  const [rows, _setRows] = useState(initial);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [branchId, setBranchId] = useState(
    defaultBranchId ? String(defaultBranchId) : "",
  );
  const [issueType, setIssueType] = useState("consumption");
  const [notes, setNotes] = useState("");
  const [isPending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = normalizeSearch(search);
    if (!q) return rows;
    return rows.filter(
      (r) =>
        normalizeSearch(r.issue_number).includes(q) ||
        normalizeSearch(r.branches?.name ?? "").includes(q) ||
        normalizeSearch(TYPE_LABEL[r.issue_type] ?? r.issue_type).includes(q),
    );
  }, [rows, search]);

  function openDialog() {
    setDialogOpen(true);
  }

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
      toast.success("Đã tạo phiếu xuất (nháp)");
      setDialogOpen(false);
      setNotes("");

      // Navigate directly to the new issue
      const newId = (res.data as { id: number }).id;
      router.push(`/admin/inventory/issues/${newId}`);
    });
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Phiếu xuất kho
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Ghi nhận hàng hóa xuất khỏi kho (tiêu hao, thanh lý, bếp dùng)
          </p>
        </div>
        <Button size="sm" onClick={openDialog}>
          <Plus className="mr-1.5 size-4" />
          Tạo phiếu xuất
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-xs">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Tìm phiếu xuất…"
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Table */}
      <div className="rounded-lg border shadow-sm overflow-hidden">
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
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableEmptyStateRow
                colSpan={6}
                paddingClassName="py-16"
                title={
                  search ? "Không tìm thấy kết quả" : "Chưa có phiếu xuất kho"
                }
                description={
                  search
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
                  <TableCell className="text-muted-foreground">
                    {new Date(r.issued_at).toLocaleDateString("vi-VN")}
                  </TableCell>
                  <TableCell>
                    <Badge className={cn("text-xs", statusMeta.className)}>
                      {statusMeta.label}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" asChild>
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
    </div>
  );
}
