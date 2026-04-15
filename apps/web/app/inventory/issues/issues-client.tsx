"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SectionCard } from "@/components/foundation/ui-patterns";
import {
  AlertTriangle,
  ChefHat,
  ClipboardList,
  Clock,
  FileDown,
  FilterX,
  MoreVertical,
  Plus,
} from "lucide-react";
import { cn, getSurfacePanelClassName } from "@comtammatu/ui";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@comtammatu/ui/components/dialog";
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
import {
  FilterBar,
  PageHeader,
  SearchableSelect,
  StatusBadge,
} from "../_components/shared";
import { TableEmptyStateRow } from "../_components/table-empty-state-row";
import { tRoute } from "../_lib/dictionary";
import { createStockIssueDraft } from "../issue-actions";

export type IssueRow = {
  id: number;
  code: string;
  type: string;
  branchName: string;
  date: string;
  createdBy: string;
  status: string;
};

export type IssueBranchOption = {
  id: number;
  name: string;
};

const ISSUE_TYPES = [
  { value: "consumption", label: "Tiêu hao" },
  { value: "writeoff", label: "Hủy hỏng / thanh lý" },
  { value: "kitchen_use", label: "Cấp phát bếp chi nhánh" },
  { value: "other", label: "Khác" },
] as const;

type IssueTypeValue = (typeof ISSUE_TYPES)[number]["value"];

export function IssuesClient({
  issues,
  branches,
  defaultBranchId,
}: {
  issues: IssueRow[];
  branches: IssueBranchOption[];
  defaultBranchId: number | null;
}) {
  const router = useRouter();
  const [activeStatus, setActiveStatus] = useState("all");
  const [activeType, setActiveType] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [branchId, setBranchId] = useState(
    defaultBranchId ? String(defaultBranchId) : "",
  );
  const [issueType, setIssueType] = useState<IssueTypeValue>("consumption");
  const [notes, setNotes] = useState("");
  const [isPending, startTransition] = useTransition();
  const panelClassName = getSurfacePanelClassName(
    "inventory",
    "ambient-shadow",
  );

  const filtered = useMemo(
    () =>
      issues
        .filter(
          (issue) => activeStatus === "all" || issue.status === activeStatus,
        )
        .filter((issue) => activeType === "all" || issue.type === activeType),
    [activeStatus, activeType, issues],
  );

  const draftCount = issues.filter((issue) => issue.status === "draft").length;
  const kitchenUseCount = issues.filter(
    (issue) => issue.type === "kitchen_use",
  ).length;
  const writeOffCount = issues.filter(
    (issue) => issue.type === "writeoff",
  ).length;

  function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const parsedBranchId = Number(branchId);
    if (!parsedBranchId) {
      toast.error("Chọn chi nhánh để tạo phiếu xuất.");
      return;
    }

    startTransition(async () => {
      const res = await createStockIssueDraft({
        branchId: parsedBranchId,
        issueType,
        notes: notes.trim() || undefined,
      });

      if (!res.success || !res.data) {
        toast.error(res.error ?? "Không thể tạo phiếu xuất.");
        return;
      }

      const newId = (res.data as { id: number }).id;
      toast.success(`Đã tạo phiếu PXK-${newId}.`);
      setCreateOpen(false);
      setNotes("");
      router.push(`/inventory/issues/${newId}`);
    });
  }

  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <PageHeader
            title={tRoute("/inventory/issues")}
            description="Tiêu hao, hư hỏng, cấp phát nội bộ."
          />
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="focus-ring-standard flex min-h-11 items-center gap-2 rounded-full border border-border/40 bg-card px-5 py-2.5 font-semibold shadow-sm transition-all"
            >
              <FileDown className="size-4" />
              <span>Xuất báo cáo</span>
            </button>
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="focus-ring-standard flex min-h-11 items-center gap-2 rounded-full bg-primary px-6 py-2.5 font-bold text-primary-foreground shadow-xl shadow-primary/15 transition-transform active:scale-[0.98]"
            >
              <Plus className="size-4" />
              <span>Tạo phiếu mới</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-4">
          <SectionCard
            className={cn(panelClassName, "rounded-2xl bg-card")}
            density="comfortable"
          >
            <div className="mb-4 flex items-start justify-between">
              <div className="flex size-10 items-center justify-center rounded-xl bg-warning/12">
                <ClipboardList className="size-5 text-warning" />
              </div>
              <span className="whitespace-nowrap text-label font-semibold uppercase tracking-wide text-muted-foreground">
                Tháng này
              </span>
            </div>
            <h3 className="text-3xl font-black tracking-tight">
              {issues.length}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Tổng phiếu đã xuất
            </p>
          </SectionCard>

          <SectionCard
            className={cn(panelClassName, "rounded-2xl bg-card")}
            density="comfortable"
          >
            <div className="mb-4 flex items-start justify-between">
              <div className="flex size-10 items-center justify-center rounded-xl bg-success/12">
                <ChefHat className="size-5 text-success" />
              </div>
              <span className="whitespace-nowrap text-label font-semibold uppercase tracking-wide text-muted-foreground">
                Cấp phát bếp
              </span>
            </div>
            <h3 className="text-3xl font-black tracking-tight text-success">
              {kitchenUseCount}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {issues.length > 0
                ? `Chiếm ${Math.round((kitchenUseCount / issues.length) * 100)}% tỉ lệ xuất`
                : "Chưa có dữ liệu"}
            </p>
          </SectionCard>

          <SectionCard
            className={cn(panelClassName, "rounded-2xl bg-card")}
            density="comfortable"
          >
            <div className="mb-4 flex items-start justify-between">
              <div className="flex size-10 items-center justify-center rounded-xl bg-destructive/12">
                <AlertTriangle className="size-5 text-destructive" />
              </div>
              <span className="whitespace-nowrap text-label font-semibold uppercase tracking-wide text-muted-foreground">
                Hư hỏng
              </span>
            </div>
            <h3 className="text-3xl font-black tracking-tight text-destructive">
              {writeOffCount}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Cần tối ưu quy trình
            </p>
          </SectionCard>

          <SectionCard
            className={cn(panelClassName, "rounded-2xl bg-card")}
            density="comfortable"
          >
            <div className="mb-4 flex items-start justify-between">
              <div className="flex size-10 items-center justify-center rounded-xl bg-muted">
                <Clock className="size-5 text-muted-foreground" />
              </div>
              <span className="whitespace-nowrap text-label font-semibold uppercase tracking-wide text-muted-foreground">
                Chờ duyệt
              </span>
            </div>
            <h3 className="text-3xl font-black tracking-tight">
              {String(draftCount).padStart(2, "0")}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Phiếu nháp hiện có
            </p>
          </SectionCard>
        </div>

        <FilterBar
          className={cn(
            panelClassName,
            "items-center justify-between bg-muted px-6 py-4",
          )}
          surface="inventory"
        >
          <div className="flex items-center gap-6">
            <div className="flex flex-col gap-1">
              <label className="whitespace-nowrap text-label font-semibold uppercase tracking-wide text-muted-foreground">
                Trạng thái
              </label>
              <SearchableSelect
                options={[
                  { value: "all", label: "Tất cả trạng thái" },
                  { value: "draft", label: "Nháp" },
                  { value: "confirmed", label: "Đã xác nhận" },
                  { value: "cancelled", label: "Đã huỷ" },
                ]}
                value={activeStatus}
                onValueChange={setActiveStatus}
                placeholder="Tất cả trạng thái"
                searchPlaceholder="Tìm trạng thái..."
                variant="ghost"
                className="text-foreground"
              />
            </div>
            <div className="h-8 w-px bg-border/40" />
            <div className="flex flex-col gap-1">
              <label className="whitespace-nowrap text-label font-semibold uppercase tracking-wide text-muted-foreground">
                Loại xuất
              </label>
              <SearchableSelect
                options={[
                  { value: "all", label: "Tất cả loại xuất" },
                  ...ISSUE_TYPES.map((option) => ({
                    value: option.value,
                    label: option.label,
                  })),
                ]}
                value={activeType}
                onValueChange={setActiveType}
                placeholder="Tất cả loại xuất"
                searchPlaceholder="Tìm loại xuất..."
                variant="ghost"
                className="text-foreground"
              />
            </div>
          </div>
          <button
            type="button"
            className="focus-ring-standard flex items-center gap-1 rounded-full px-2 text-sm font-medium text-primary hover:underline"
            onClick={() => {
              setActiveStatus("all");
              setActiveType("all");
            }}
          >
            <FilterX className="size-4" />
            Xoá bộ lọc
          </button>
        </FilterBar>

        <div
          className={cn(panelClassName, "overflow-hidden rounded-3xl bg-card")}
        >
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="px-6 py-5 whitespace-nowrap text-label font-bold uppercase tracking-wider text-muted-foreground">
                  Mã phiếu
                </TableHead>
                <TableHead className="px-6 py-5 whitespace-nowrap text-label font-bold uppercase tracking-wider text-muted-foreground">
                  Loại xuất
                </TableHead>
                <TableHead className="px-6 py-5 whitespace-nowrap text-label font-bold uppercase tracking-wider text-muted-foreground">
                  Chi nhánh
                </TableHead>
                <TableHead className="px-6 py-5 whitespace-nowrap text-label font-bold uppercase tracking-wider text-muted-foreground">
                  Ngày tạo
                </TableHead>
                <TableHead className="px-6 py-5 whitespace-nowrap text-label font-bold uppercase tracking-wider text-muted-foreground">
                  Người tạo
                </TableHead>
                <TableHead className="px-6 py-5 whitespace-nowrap text-label font-bold uppercase tracking-wider text-muted-foreground">
                  Trạng thái
                </TableHead>
                <TableHead className="px-6 py-5 text-right whitespace-nowrap text-label font-bold uppercase tracking-wider text-muted-foreground">
                  Thao tác
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableEmptyStateRow
                  colSpan={7}
                  title="Chưa có phiếu xuất phù hợp"
                  description="Điều chỉnh bộ lọc hoặc tạo phiếu xuất mới để bắt đầu."
                />
              )}
              {filtered.map((item) => (
                <TableRow
                  key={item.id}
                  className="group border-border/60 transition-colors"
                >
                  <TableCell className="px-6 py-5">
                    <Link
                      href={`/inventory/issues/${item.id}`}
                      className="focus-ring-standard rounded-sm text-sm font-bold hover:underline"
                    >
                      {item.code}
                    </Link>
                  </TableCell>
                  <TableCell className="px-6 py-5">
                    <span className="text-sm font-medium">
                      {ISSUE_TYPES.find((option) => option.value === item.type)
                        ?.label ?? item.type}
                    </span>
                  </TableCell>
                  <TableCell className="px-6 py-5 text-sm font-medium text-muted-foreground">
                    {item.branchName}
                  </TableCell>
                  <TableCell className="px-6 py-5 text-sm text-muted-foreground">
                    {item.date}
                  </TableCell>
                  <TableCell className="px-6 py-5">
                    <div className="flex items-center gap-2">
                      <div className="flex size-6 items-center justify-center rounded-full bg-muted text-label font-bold">
                        {item.createdBy
                          .split(" ")
                          .map((word) => word[0])
                          .join("")
                          .slice(0, 2)}
                      </div>
                      <span className="text-sm text-muted-foreground">
                        {item.createdBy}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="px-6 py-5">
                    <StatusBadge status={item.status} />
                  </TableCell>
                  <TableCell className="px-6 py-5 text-right">
                    <Link
                      href={`/inventory/issues/${item.id}`}
                      className="focus-ring-standard inline-flex rounded-lg p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <MoreVertical className="size-5" />
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="flex items-center justify-between border-t border-border/40 px-6 py-4">
            <span className="text-xs font-medium text-muted-foreground">
              Hiển thị {filtered.length} / {issues.length} phiếu
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="focus-ring-standard rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground"
              >
                ← Trước
              </button>
              <span className="flex size-8 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                1
              </span>
              <button
                type="button"
                className="focus-ring-standard rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground"
              >
                Sau →
              </button>
            </div>
          </div>
        </div>
      </div>

      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (open && defaultBranchId && !branchId) {
            setBranchId(String(defaultBranchId));
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tạo phiếu xuất kho</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Chi nhánh *</Label>
              <Select value={branchId} onValueChange={setBranchId}>
                <SelectTrigger>
                  <SelectValue placeholder="Chọn chi nhánh" />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((branch) => (
                    <SelectItem key={branch.id} value={String(branch.id)}>
                      {branch.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Loại xuất *</Label>
              <Select
                value={issueType}
                onValueChange={(value) => setIssueType(value as IssueTypeValue)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ISSUE_TYPES.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="issue-notes">Ghi chú</Label>
              <textarea
                id="issue-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="focus-ring-standard w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none"
                placeholder="Nhập ghi chú cho phiếu xuất"
              />
            </div>

            <DialogFooter>
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="focus-ring-standard rounded-full border border-border px-4 py-2 text-sm font-medium text-muted-foreground"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={isPending}
                className="focus-ring-standard rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
              >
                {isPending ? "Đang tạo..." : "Tạo phiếu"}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
