"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight as IconArrowRight, FileDown as IconFileDownload, FilterX as IconFilterX, EllipsisVertical as IconDotsVertical, Plus as IconPlus, Search as IconSearch } from "lucide-react";
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
import { downloadCsv } from "@/_lib/download-file";
import { matchesSearch } from "@lib/search";
import { InventoryHeader } from "../_components/inventory-header";
import {
  InventoryFilterBar,
  InventoryPageContent,
} from "../_components/inventory-page-layout";
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
  branchKind: string | null;
  date: string;
  createdBy: string;
  status: string;
};

export type IssueBranchOption = {
  id: number;
  name: string;
  branchKind: string | null;
};

// Label for `consumption` issue_type flips by branch_kind:
// - central_warehouse / central_kitchen → "Hao hụt kho" (storage loss)
// - branch                              → "Tiêu hao" (sale consumption)
// `writeoff` and `other` keep a single label at all kinds.
// kitchen_use retired 2026-04-25 (replaced by intra-branch stock_transfer).
const ISSUE_TYPES = [
  { value: "consumption", label: "Tiêu hao" },
  { value: "writeoff", label: "Hủy hỏng / thanh lý" },
  { value: "other", label: "Khác" },
] as const;

type IssueTypeValue = (typeof ISSUE_TYPES)[number]["value"];

function isStorageBranchKind(kind: string | null | undefined): boolean {
  return kind === "central_warehouse" || kind === "central_kitchen";
}

function issueTypeLabel(type: string, branchKind: string | null): string {
  if (type === "consumption") {
    return isStorageBranchKind(branchKind) ? "Hao hụt kho" : "Tiêu hao";
  }
  return ISSUE_TYPES.find((o) => o.value === type)?.label ?? type;
}

const STATUS_FILTER_OPTIONS = [
  { value: "all", label: "Tất cả trạng thái" },
  { value: "draft", label: "Nháp" },
  { value: "confirmed", label: "Đã xác nhận" },
  { value: "cancelled", label: "Đã hủy" },
];

// Filter options show generic labels (no branch context at the filter level).
const TYPE_FILTER_OPTIONS = [
  { value: "all", label: "Tất cả loại xuất" },
  { value: "consumption", label: "Tiêu hao / Hao hụt kho" },
  { value: "writeoff", label: "Hủy hỏng / thanh lý" },
  { value: "other", label: "Khác" },
];

function csvCell(value: string | number): string {
  const raw = String(value);
  // Prevent spreadsheet formula injection on cells starting with =, +, -, @, tab, CR.
  const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replaceAll('"', '""')}"`;
}

function toUtf8Base64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
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
    const q = search.trim();
    if (q) {
      result = result.filter((i) => matchesSearch([i.code, i.branchName], q));
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

  const hasActiveFilters =
    activeStatus !== "all" || activeType !== "all" || search.trim().length > 0;

  function handleExportIssuesCsv() {
    if (filtered.length === 0) {
      toast.error("Không có dữ liệu để xuất báo cáo.");
      return;
    }

    const header = [
      "Mã phiếu",
      "Loại xuất",
      "Chi nhánh",
      "Ngày tạo",
      "Trạng thái",
    ];
    const rows = filtered.map((row) => [
      row.code,
      issueTypeLabel(row.type, row.branchKind),
      row.branchName,
      row.date,
      row.status,
    ]);

    const body = [header, ...rows]
      .map((line) => line.map((cell) => csvCell(cell)).join(","))
      .join("\n");
    // BOM so Excel renders Vietnamese characters correctly on Windows.
    const csv = `\uFEFF${body}`;
    const stamp = new Date()
      .toISOString()
      .slice(0, 19)
      .replaceAll(":", "-")
      .replace("T", "-");

    downloadCsv(toUtf8Base64(csv), `phieu-xuat-kho-${stamp}.csv`);
    toast.success(`Đã xuất ${String(filtered.length)} phiếu xuất.`);
  }

  const filterBar = (
    <InventoryFilterBar>
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
            <IconSearch />
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
            <IconFilterX className="mr-1 size-4" />
            Xóa lọc
          </Button>
        )}
      </div>
    </InventoryFilterBar>
  );

  return (
    <>
      <InventoryHeader
        title={tNav("issues", "navigation")}
        actions={
          <>
            {!isMobile && (
              <Button
                type="button"
                variant="outline"
                onClick={handleExportIssuesCsv}
              >
                <IconFileDownload className="size-4" />
                Xuất báo cáo
              </Button>
            )}
            <Button type="button" onClick={() => setCreateOpen(true)}>
              <IconPlus className="size-4" />
              Tạo phiếu xuất kho
            </Button>
          </>
        }
      />
      <InventoryPageContent width={isMobile ? "narrow" : "wide"}>
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
                        {issueTypeLabel(item.type, item.branchKind)} &middot;{" "}
                        {item.date}
                      </p>
                    </div>
                    <IconArrowRight className="size-4 shrink-0 text-muted-foreground" />
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
                          {issueTypeLabel(item.type, item.branchKind)}
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
                            <IconDotsVertical className="size-4" />
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
      </InventoryPageContent>

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
            <DialogTitle>
              {isStorageBranchKind(
                branches.find((b) => b.id === Number(branchId))?.branchKind ??
                  null,
              )
                ? "Tạo phiếu hao hụt kho"
                : "Tạo phiếu xuất kho"}
            </DialogTitle>
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
                  {ISSUE_TYPES.map((option) => {
                    const selectedKind =
                      branches.find((b) => b.id === Number(branchId))
                        ?.branchKind ?? null;
                    const label =
                      option.value === "consumption"
                        ? issueTypeLabel("consumption", selectedKind)
                        : option.label;
                    return (
                      <SelectItem key={option.value} value={option.value}>
                        {label}
                      </SelectItem>
                    );
                  })}
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
