"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  FileDown,
  FilterX,
  MoreVertical,
  Plus,
  Search,
} from "lucide-react";
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
import { Textarea } from "@comtammatu/ui/components/textarea";
import { cn } from "@comtammatu/ui";
import { useIsMobile } from "@comtammatu/ui/hooks/use-mobile";
import { InventoryHeader } from "../_components/inventory-header";
import { InteractiveCard } from "../_components/interactive-card";
import { StatusBadge } from "../_components/status-badge";
import { TableEmptyStateRow } from "../_components/table-empty-state-row";
import { tNav } from "../_lib/dictionary";
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

const STATUS_FILTER_OPTIONS = [
  { value: "all", label: "Tất cả trạng thái" },
  { value: "draft", label: "Nháp" },
  { value: "confirmed", label: "Đã xác nhận" },
  { value: "cancelled", label: "Đã hủy" },
];

const TYPE_FILTER_OPTIONS = [
  { value: "all", label: "Tất cả loại xuất" },
  ...ISSUE_TYPES.map((opt) => ({ value: opt.value, label: opt.label })),
];

function issueTypeLabel(type: string): string {
  return ISSUE_TYPES.find((o) => o.value === type)?.label ?? type;
}

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
  const isMobile = useIsMobile();
  const [activeStatus, setActiveStatus] = useState("all");
  const [activeType, setActiveType] = useState("all");
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [branchId, setBranchId] = useState(
    defaultBranchId ? String(defaultBranchId) : "",
  );
  const [issueType, setIssueType] = useState<IssueTypeValue>("consumption");
  const [notes, setNotes] = useState("");
  const [isPending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    let result = issues;
    if (activeStatus !== "all") {
      result = result.filter((i) => i.status === activeStatus);
    }
    if (activeType !== "all") {
      result = result.filter((i) => i.type === activeType);
    }
    const q = search.trim().toLowerCase();
    if (q) {
      result = result.filter(
        (i) =>
          i.code.toLowerCase().includes(q) ||
          i.branchName.toLowerCase().includes(q),
      );
    }
    return result;
  }, [activeStatus, activeType, search, issues]);

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

  const hasActiveFilters = activeStatus !== "all" || activeType !== "all" || search.trim().length > 0;

  const filterBar = (
    <Card className="py-0">
      <CardContent className="flex flex-wrap items-center gap-3 p-3">
        <div className="flex flex-1 flex-wrap items-end gap-3">
          <Select value={activeStatus} onValueChange={setActiveStatus}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Tất cả trạng thái" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_FILTER_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={activeType} onValueChange={setActiveType}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Tất cả loại xuất" />
            </SelectTrigger>
            <SelectContent>
              {TYPE_FILTER_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <InputGroup className={cn("flex-1", isMobile && "h-12 basis-full")}>
            <InputGroupAddon>
              <Search />
            </InputGroupAddon>
            <InputGroupInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm mã phiếu, chi nhánh..."
              inputMode="search"
            />
          </InputGroup>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="outline" className="rounded-full">
            {filtered.length}/{issues.length}
          </Badge>
          {hasActiveFilters && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setActiveStatus("all");
                setActiveType("all");
                setSearch("");
              }}
            >
              <FilterX className="mr-1 size-4" />
              Xóa lọc
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );

  return (
    <>
      <InventoryHeader
        title={tNav("issues", "navigation")}
        actions={
          <>
            {!isMobile && (
              <Button type="button" variant="outline" disabled>
                <FileDown className="size-4" />
                Xuất báo cáo (sắp mở)
              </Button>
            )}
            <Button type="button" onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" />
              Tạo phiếu cấp bếp
            </Button>
          </>
        }
      />
      <div className="flex-1 overflow-auto p-4">
        <div className={cn("mx-auto space-y-4", isMobile ? "max-w-xl" : "max-w-7xl")}>
          {filterBar}

          {/* Desktop: Table / Mobile: Cards */}
          {isMobile ? (
            <div className="flex flex-col gap-2">
              {filtered.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  {hasActiveFilters
                    ? "Không tìm thấy phiếu xuất phù hợp"
                    : "Chưa có phiếu xuất kho nào"}
                </div>
              ) : (
                filtered.map((item) => (
                  <InteractiveCard
                    key={item.id}
                    asChild
                    minHeight="mobile"
                    padding="default"
                  >
                    <Link href={`/inventory/issues/${item.id}`} className="block">
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-semibold">
                            {item.code}
                          </span>
                          <StatusBadge status={item.status} size="sm" />
                        </div>
                        <p className="truncate text-xs text-muted-foreground">
                          {item.branchName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {issueTypeLabel(item.type)} &middot; {item.date}
                        </p>
                      </div>
                      <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
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
                      <TableHead>Mã phiếu</TableHead>
                      <TableHead>Loại xuất</TableHead>
                      <TableHead>Chi nhánh</TableHead>
                      <TableHead>Ngày tạo</TableHead>
                      <TableHead>Trạng thái</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.length === 0 && (
                      <TableEmptyStateRow
                        colSpan={6}
                        title={
                          hasActiveFilters
                            ? "Không tìm thấy phiếu xuất phù hợp"
                            : "Chưa có phiếu xuất kho nào"
                        }
                        description="Điều chỉnh bộ lọc hoặc tạo phiếu xuất mới để bắt đầu."
                      />
                    )}
                    {filtered.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <Link
                            href={`/inventory/issues/${item.id}`}
                            className="text-sm font-semibold text-primary hover:underline"
                          >
                            {item.code}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm font-medium">
                            {issueTypeLabel(item.type)}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {item.branchName}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {item.date}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={item.status} size="sm" />
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon-sm" asChild>
                            <Link href={`/inventory/issues/${item.id}`}>
                              <MoreVertical className="size-4" />
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

      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (open) {
            setBranchId(defaultBranchId ? String(defaultBranchId) : "");
            setIssueType("consumption");
            setNotes("");
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
              <Textarea
                id="issue-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
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
