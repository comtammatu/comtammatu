"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { SearchableSelect } from "../_components/searchable-select";
import { TableEmptyStateRow } from "../_components/table-empty-state-row";
import {
  getInventoryStatusBadgeVariant,
  getInventoryStatusLabel,
} from "../_lib/ui";
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
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">
              Vận hành chi nhánh
            </p>
            <div className="space-y-1">
              <h1 className="text-3xl font-semibold tracking-tight">
                Cấp bếp & xuất kho
              </h1>
              <p className="text-sm text-muted-foreground">
                Ưu tiên cấp phát từ kho chi nhánh xuống bếp, rồi mới theo dõi
                tiêu hao và các phiếu write-off bất thường.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" disabled>
              <FileDown className="size-4" />
              Xuất báo cáo (sắp mở)
            </Button>
            <Button type="button" onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" />
              Tạo phiếu cấp bếp
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Card><CardContent>
            <div className="flex items-start justify-between gap-4">
              <div className="flex size-11 items-center justify-center rounded-full bg-warning/12 text-warning">
                <ClipboardList className="size-5" />
              </div>
              <Badge variant="secondary">Tháng này</Badge>
            </div>
            <p className="mt-4 text-3xl font-semibold tracking-tight text-foreground">
              {issues.length}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Tổng phiếu đã xuất trong hệ thống.
            </p>
          </CardContent></Card>

          <Card><CardContent>
            <div className="flex items-start justify-between gap-4">
              <div className="flex size-11 items-center justify-center rounded-full bg-success/12 text-success">
                <ChefHat className="size-5" />
              </div>
              <Badge variant="secondary">Cấp phát bếp</Badge>
            </div>
            <p className="mt-4 text-3xl font-semibold tracking-tight text-success">
              {kitchenUseCount}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {issues.length > 0
                ? `Chiếm ${Math.round((kitchenUseCount / issues.length) * 100)}% tỉ lệ xuất`
                : "Chưa có dữ liệu để so sánh tỉ trọng."}
            </p>
          </CardContent></Card>

          <Card><CardContent>
            <div className="flex items-start justify-between gap-4">
              <div className="flex size-11 items-center justify-center rounded-full bg-destructive/12 text-destructive">
                <AlertTriangle className="size-5" />
              </div>
              <Badge variant="secondary">Hư hỏng</Badge>
            </div>
            <p className="mt-4 text-3xl font-semibold tracking-tight text-destructive">
              {writeOffCount}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Số phiếu cần được đọc kỹ để tối ưu quy trình hao hụt.
            </p>
          </CardContent></Card>

          <Card><CardContent>
            <div className="flex items-start justify-between gap-4">
              <div className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Clock className="size-5" />
              </div>
              <Badge variant="secondary">Chờ duyệt</Badge>
            </div>
            <p className="mt-4 text-3xl font-semibold tracking-tight text-foreground">
              {String(draftCount).padStart(2, "0")}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Phiếu nháp hiện có sẵn cho bước rà soát và chốt xuất.
            </p>
          </CardContent></Card>
        </div>

        <Card className="py-0"><CardContent className="flex flex-wrap items-center justify-between gap-3 p-3">
          <div className="flex flex-1 flex-wrap items-end gap-3">
            <div className="grid gap-1">
              <label className="whitespace-nowrap text-xs font-semibold uppercase tracking-wide text-muted-foreground">
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
                className="min-w-[13rem] text-foreground"
              />
            </div>
            <div className="grid gap-1">
              <label className="whitespace-nowrap text-xs font-semibold uppercase tracking-wide text-muted-foreground">
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
                className="min-w-[13rem] text-foreground"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="rounded-full">
              {filtered.length} / {issues.length} phiếu
            </Badge>
            <Button
              type="button"
              variant="link"
              onClick={() => {
                setActiveStatus("all");
                setActiveType("all");
              }}
            >
              <FilterX className="size-4" />
              Xoá bộ lọc
            </Button>
          </div>
        </CardContent></Card>

        <Card className="overflow-hidden">
          <CardHeader className="gap-1">
            <CardTitle>Danh sách phiếu xuất</CardTitle>
            <p className="text-sm text-muted-foreground">
              Tất cả chứng từ xuất kho đã tạo, sẵn sàng để rà soát, xác nhận
              hoặc mở chi tiết.
            </p>
          </CardHeader>
          <CardContent className="space-y-4 p-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mã phiếu</TableHead>
                  <TableHead>Loại xuất</TableHead>
                  <TableHead>Chi nhánh</TableHead>
                  <TableHead>Ngày tạo</TableHead>
                  <TableHead>Người tạo</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead className="text-right">Thao tác</TableHead>
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
                  <TableRow key={item.id}>
                    <TableCell>
                      <Link
                        href={`/inventory/issues/${item.id}`}
                        className="rounded-sm text-sm font-semibold text-primary transition hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                      >
                        {item.code}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm font-medium">
                        {ISSUE_TYPES.find(
                          (option) => option.value === item.type,
                        )?.label ?? item.type}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {item.branchName}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {item.date}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="flex size-8 items-center justify-center rounded-full border border-border/60 bg-muted/50 text-xs font-bold">
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
                    <TableCell>
                      <Badge
                        variant={getInventoryStatusBadgeVariant(item.status)}
                      >
                        {getInventoryStatusLabel(item.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Link
                        href={`/inventory/issues/${item.id}`}
                        className="inline-flex rounded-full border border-border/60 bg-background/80 p-2 text-muted-foreground transition hover:border-primary/30 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                      >
                        <MoreVertical className="size-4" />
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <div className="flex flex-col gap-3 border-t border-border/60 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                Hiển thị {filtered.length} / {issues.length} phiếu
              </span>
              <Badge variant="outline">Một trang trong pilot hiện tại</Badge>
            </div>
          </CardContent>
        </Card>
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
                className="w-full rounded-[1.5rem] border border-input bg-background px-4 py-3 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                placeholder="Nhập ghi chú cho phiếu xuất"
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateOpen(false)}
              >
                Hủy
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Đang tạo..." : "Tạo phiếu"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
