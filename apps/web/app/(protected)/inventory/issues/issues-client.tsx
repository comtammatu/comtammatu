"use client";

/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: existing inventory issue surface keeps localized JSX copy until message-catalog extraction */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { z } from "zod";
import {
  ArrowRight as IconArrowRight,
  FileDown as IconFileDownload,
  FilterX as IconFilterX,
  EllipsisVertical as IconDotsVertical,
  Plus as IconPlus,
  Search as IconSearch,
} from "lucide-react";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Input } from "@comtammatu/ui/components/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@comtammatu/ui/components/input-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { toast } from "@comtammatu/ui/components/sonner";
import { downloadCsv } from "@/_lib/download-file";
import { matchesSearch } from "@lib/search";
import { FormDialog, SelectField, TextareaField } from "@/components/form";
import {
  AppPage,
  AppPageHeader,
  AppSection,
  AppToolbar,
} from "@/components/surface";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import { InteractiveCard } from "../_components/interactive-card";
import { StatusBadge } from "../_components/status-badge";
import { formatVND } from "../_lib/format";
import { getInventoryStatusLabel } from "../_lib/ui";
import { tNav } from "../_lib/dictionary";
import { createStockIssueDraft } from "../issue-actions";

import { ACTIONS_VI, BRANCH_VI, FORM_VI } from "@comtammatu/shared/messages";
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

export type RecordedConsumptionRow = {
  id: number;
  branchId: number;
  recordedAt: string;
  branchName: string;
  locationName: string;
  ingredientName: string;
  quantity: string;
  sourceLabel: string;
  unitCost: string;
  totalCost: string;
  totalCostValue: number;
};

const ISSUE_TYPES = [
  { value: "consumption", label: "Tiêu hao" },
  { value: "writeoff", label: "Hủy hỏng / thanh lý" },
  { value: "other", label: "Khác" },
] as const;

function issueTypeLabel(type: string, branchKind: string | null): string {
  void branchKind;
  return ISSUE_TYPES.find((o) => o.value === type)?.label ?? type;
}

const STATE_FILTER_OPTIONS = ["draft", "confirmed", "cancelled"].map(
  (value) => ({
    value,
    label: getInventoryStatusLabel(value),
  }),
);

// Filter options show generic labels (no branch context at the filter level).
const TYPE_FILTER_OPTIONS = [
  { value: "all", label: "Tất cả loại xuất" },
  { value: "consumption", label: "Tiêu hao" },
  { value: "writeoff", label: "Hủy hỏng / thanh lý" },
  { value: "other", label: "Khác" },
];

const CREATE_ISSUE_DIALOG_DESCRIPTION =
  "Chọn điểm vận hành, loại xuất và ghi chú trước khi tạo phiếu nháp.";
const CONSUMPTION_PATH = "/inventory/consumption";

const createIssueSchema = z.object({
  branchId: z.string().min(1, { error: "Chọn chi nhánh để tạo phiếu xuất." }),
  issueType: z.enum(["consumption", "writeoff", "other"]),
  notes: z.string().trim().optional(),
});

type CreateIssueValues = z.infer<typeof createIssueSchema>;

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

function buildConsumptionHref(params: URLSearchParams): string {
  const query = params.toString();
  return query ? `${CONSUMPTION_PATH}?${query}` : CONSUMPTION_PATH;
}

export function IssuesClient({
  issues,
  recordedConsumptions,
  branches,
  defaultBranchId,
  recordedBranchId: initialRecordedBranchId,
  recordedEndDate: initialRecordedEndDate,
  recordedIsLimited,
  recordedStartDate: initialRecordedStartDate,
}: {
  issues: IssueRow[];
  recordedConsumptions: RecordedConsumptionRow[];
  branches: IssueBranchOption[];
  defaultBranchId: number | null;
  recordedBranchId: number | null;
  recordedEndDate: string;
  recordedIsLimited: boolean;
  recordedStartDate: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeStatus, setActiveStatus] = useState("all");
  const [activeType, setActiveType] = useState("all");
  const [search, setSearch] = useState("");
  const [recordedStartDate, setRecordedStartDate] = useState(
    initialRecordedStartDate,
  );
  const [recordedEndDate, setRecordedEndDate] = useState(
    initialRecordedEndDate,
  );
  const [recordedBranchId, setRecordedBranchId] = useState(
    initialRecordedBranchId ? String(initialRecordedBranchId) : "all",
  );
  const [recordedSearch, setRecordedSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const createIssueDefaultValues = useMemo<CreateIssueValues>(
    () => ({
      branchId: defaultBranchId ? String(defaultBranchId) : "",
      issueType: "consumption",
      notes: "",
    }),
    [defaultBranchId],
  );
  // Capability-gated only — the CSV builds client-side and downloads fine
  // on phones; hiding it by breakpoint forced warehouse staff back to a
  // desktop just to press one button.
  const showExportAction = true;
  const hasRecordedDateFilter =
    initialRecordedStartDate !== "" || initialRecordedEndDate !== "";
  const hasRecordedServerFilter =
    hasRecordedDateFilter || initialRecordedBranchId !== null;
  const recordedConsumptionHeaderHint = recordedIsLimited
    ? `${recordedConsumptions.length} dòng gần nhất`
    : `${recordedConsumptions.length} dòng`;
  const recordedBranchOptions = branches.filter(
    (branch) => branch.branchKind === "branch",
  );
  const visibleRecordedBranchOptions =
    recordedBranchOptions.length > 0 ? recordedBranchOptions : branches;
  const canSelectAllRecordedBranches = visibleRecordedBranchOptions.length > 1;
  const selectedRecordedBranchId =
    recordedBranchId === "all" && !canSelectAllRecordedBranches
      ? String(visibleRecordedBranchOptions[0]?.id ?? "")
      : recordedBranchId;

  useEffect(() => {
    setRecordedStartDate(initialRecordedStartDate);
    setRecordedEndDate(initialRecordedEndDate);
    setRecordedBranchId(
      initialRecordedBranchId ? String(initialRecordedBranchId) : "all",
    );
  }, [
    initialRecordedBranchId,
    initialRecordedEndDate,
    initialRecordedStartDate,
  ]);

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

  async function handleCreate(values: CreateIssueValues) {
    const res = await createStockIssueDraft({
      branchId: Number(values.branchId),
      issueType: values.issueType,
      notes: values.notes?.trim() || undefined,
    });

    if (res.success && res.data) {
      const newId = (res.data as { id: number }).id;
      router.push(`/inventory/consumption/${newId}`);
    }

    return res;
  }

  const hasActiveFilters =
    activeStatus !== "all" || activeType !== "all" || search.trim().length > 0;
  const visibleRecordedConsumptions = useMemo(() => {
    const q = recordedSearch.trim();
    if (!q) return recordedConsumptions;
    return recordedConsumptions.filter((row) =>
      matchesSearch(
        [
          row.ingredientName,
          row.branchName,
          row.locationName,
          row.sourceLabel,
        ],
        q,
      ),
    );
  }, [recordedConsumptions, recordedSearch]);
  const visibleRecordedConsumptionTotal = visibleRecordedConsumptions.reduce(
    (sum, row) => sum + row.totalCostValue,
    0,
  );
  const visibleRecordedConsumptionHint = recordedIsLimited
    ? `${visibleRecordedConsumptions.length}/${recordedConsumptions.length} dòng gần nhất`
    : `${visibleRecordedConsumptions.length}/${recordedConsumptions.length} dòng`;

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

  function handleExportRecordedCsv() {
    if (visibleRecordedConsumptions.length === 0) {
      toast.error("Không có dữ liệu tiêu hao để xuất CSV.");
      return;
    }

    const header = [
      "Thời điểm",
      "Nguyên liệu",
      BRANCH_VI.long,
      "Kho trừ",
      FORM_VI.quantity,
      "Giá vốn",
      "Thành tiền",
      "Nguồn",
    ];
    const rows = visibleRecordedConsumptions.map((row) => [
      row.recordedAt,
      row.ingredientName,
      row.branchName,
      row.locationName,
      row.quantity,
      row.unitCost,
      row.totalCost,
      row.sourceLabel,
    ]);
    const body = [header, ...rows]
      .map((line) => line.map((cell) => csvCell(cell)).join(","))
      .join("\n");
    const csv = `\uFEFF${body}`;
    const stamp = new Date()
      .toISOString()
      .slice(0, 19)
      .replaceAll(":", "-")
      .replace("T", "-");

    downloadCsv(toUtf8Base64(csv), `tieu-hao-da-ghi-nhan-${stamp}.csv`);
    toast.success(
      `Đã xuất ${String(visibleRecordedConsumptions.length)} dòng tiêu hao.`,
    );
  }

  function applyRecordedDateFilter() {
    const next = new URLSearchParams(searchParams.toString());
    if (recordedStartDate) {
      next.set("startDate", recordedStartDate);
    } else {
      next.delete("startDate");
    }
    if (recordedEndDate) {
      next.set("endDate", recordedEndDate);
    } else {
      next.delete("endDate");
    }
    if (selectedRecordedBranchId && selectedRecordedBranchId !== "all") {
      next.set("branchId", selectedRecordedBranchId);
    } else {
      next.delete("branchId");
    }

    router.push(buildConsumptionHref(next));
  }

  function clearRecordedDateFilter() {
    const next = new URLSearchParams(searchParams.toString());
    next.delete("startDate");
    next.delete("endDate");
    next.delete("branchId");
    setRecordedStartDate("");
    setRecordedEndDate("");
    setRecordedBranchId("all");
    router.push(buildConsumptionHref(next));
  }

  const filterBar = (
    <AppToolbar variant="inline">
      <div className="flex flex-1 flex-wrap items-end gap-3">
        <Select value={activeStatus} onValueChange={setActiveStatus}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Tất cả trạng thái" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả trạng thái</SelectItem>
            {STATE_FILTER_OPTIONS.map((opt) => (
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

        <InputGroup className="h-12 flex-1 basis-full sm:h-10 sm:basis-auto">
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
    </AppToolbar>
  );

  const recordedConsumptionFilterBar = (
    <AppToolbar variant="inline">
      <div className="flex flex-1 flex-wrap items-end gap-3">
        <Select
          value={selectedRecordedBranchId}
          onValueChange={setRecordedBranchId}
        >
          <SelectTrigger className="w-48">
            <SelectValue placeholder={BRANCH_VI.select} />
          </SelectTrigger>
          <SelectContent>
            {canSelectAllRecordedBranches ? (
              <SelectItem value="all">Tất cả chi nhánh</SelectItem>
            ) : null}
            {visibleRecordedBranchOptions.map((branch) => (
              <SelectItem key={branch.id} value={String(branch.id)}>
                {branch.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="flex min-w-40 flex-col gap-1 text-xs font-medium text-muted-foreground">
          Từ ngày
          <Input
            type="date"
            value={recordedStartDate}
            onChange={(event) => setRecordedStartDate(event.target.value)}
            className="h-10 w-40 bg-background"
          />
        </label>
        <label className="flex min-w-40 flex-col gap-1 text-xs font-medium text-muted-foreground">
          Đến ngày
          <Input
            type="date"
            value={recordedEndDate}
            onChange={(event) => setRecordedEndDate(event.target.value)}
            className="h-10 w-40 bg-background"
          />
        </label>
        <Button
          type="button"
          variant="outline"
          onClick={applyRecordedDateFilter}
        >
          Lọc
        </Button>
        <InputGroup className="h-10 min-w-56 flex-1">
          <InputGroupAddon>
            <IconSearch />
          </InputGroupAddon>
          <InputGroupInput
            value={recordedSearch}
            onChange={(event) => setRecordedSearch(event.target.value)}
            placeholder="Tìm nguyên liệu, nguồn..."
            inputMode="search"
          />
        </InputGroup>
      </div>

      {hasRecordedServerFilter ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={clearRecordedDateFilter}
        >
          <IconFilterX className="mr-1 size-4" />
          Xóa lọc
        </Button>
      ) : null}
    </AppToolbar>
  );

  const issueColumns: DataTableColumn<IssueRow>[] = [
    {
      key: "code",
      header: "Mã phiếu",
      render: (item) => (
        <Link
          href={`/inventory/consumption/${item.id}`}
          className="text-sm font-semibold text-primary hover:underline"
        >
          {item.code}
        </Link>
      ),
    },
    {
      key: "type",
      header: "Loại xuất",
      render: (item) => (
        <span className="text-sm font-medium">
          {issueTypeLabel(item.type, item.branchKind)}
        </span>
      ),
    },
    {
      key: "branchName",
      header: BRANCH_VI.long,
      render: (item) => (
        <span className="text-sm text-muted-foreground">{item.branchName}</span>
      ),
    },
    {
      key: "date",
      header: "Ngày tạo",
      render: (item) => (
        <span className="text-sm text-muted-foreground">{item.date}</span>
      ),
    },
    {
      key: "status",
      header: FORM_VI.status,
      render: (item) => <StatusBadge status={item.status} size="sm" />,
    },
    {
      key: "actions",
      header: "",
      className: "w-10",
      render: (item) => (
        <Button variant="ghost" size="icon-sm" asChild>
          <Link href={`/inventory/consumption/${item.id}`}>
            <IconDotsVertical className="size-4" />
          </Link>
        </Button>
      ),
    },
  ];

  const recordedConsumptionColumns: DataTableColumn<RecordedConsumptionRow>[] =
    [
      {
        key: "recordedAt",
        header: "Thời điểm",
        render: (item) => (
          <span className="text-sm text-muted-foreground">
            {item.recordedAt}
          </span>
        ),
      },
      {
        key: "ingredientName",
        header: "Nguyên liệu",
        render: (item) => (
          <span className="text-sm font-medium">{item.ingredientName}</span>
        ),
      },
      {
        key: "branchName",
        header: BRANCH_VI.long,
        render: (item) => (
          <span className="text-sm text-muted-foreground">
            {item.branchName}
          </span>
        ),
      },
      {
        key: "locationName",
        header: "Kho trừ",
        render: (item) => (
          <span className="text-sm text-muted-foreground">
            {item.locationName}
          </span>
        ),
      },
      {
        key: "quantity",
        header: FORM_VI.quantity,
        render: (item) => (
          <span className="font-mono text-sm">{item.quantity}</span>
        ),
      },
      {
        key: "unitCost",
        header: "Giá vốn",
        render: (item) => (
          <span className="font-mono text-sm">{item.unitCost}</span>
        ),
      },
      {
        key: "totalCost",
        header: "Thành tiền",
        className: "text-right",
        render: (item) => (
          <span className="font-mono text-sm font-medium">
            {item.totalCost}
          </span>
        ),
      },
      {
        key: "sourceLabel",
        header: "Nguồn",
        className: "min-w-44",
        render: (item) => (
          <span className="text-sm text-muted-foreground">
            {item.sourceLabel}
          </span>
        ),
      },
    ];

  const renderIssueCard = (item: IssueRow) => (
    <InteractiveCard asChild minHeight="mobile" padding="default">
      <Link href={`/inventory/consumption/${item.id}`} className="block">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-semibold">{item.code}</span>
            <StatusBadge status={item.status} size="sm" />
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {item.branchName}
          </p>
          <p className="text-xs text-muted-foreground">
            {issueTypeLabel(item.type, item.branchKind)} &middot; {item.date}
          </p>
        </div>
        <IconArrowRight className="size-4 shrink-0 text-muted-foreground" />
      </Link>
    </InteractiveCard>
  );

  const renderRecordedConsumptionCard = (item: RecordedConsumptionRow) => (
    <InteractiveCard minHeight="tap" padding="compact">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex min-w-0 items-center justify-between gap-2">
          <span className="truncate text-sm font-medium">
            {item.ingredientName}
          </span>
          <span className="shrink-0 font-mono text-sm font-semibold">
            {item.totalCost}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          {item.branchName} · {item.locationName}
        </p>
        <p className="text-xs text-muted-foreground">
          {item.quantity} · {item.recordedAt}
        </p>
        <p className="text-xs text-muted-foreground">{item.sourceLabel}</p>
      </div>
    </InteractiveCard>
  );

  return (
    <AppPage width="wide">
      <AppPageHeader
        eyebrow="Kho hàng"
        title={tNav("consumption", "navigation")}
        actions={
          <>
            {showExportAction && (
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
              Tạo phiếu
            </Button>
          </>
        }
      />

      <AppSection
        title="Tiêu hao đã ghi nhận"
        headerHint={visibleRecordedConsumptionHint}
        action={
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleExportRecordedCsv}
          >
            <IconFileDownload className="size-4" />
            Xuất CSV
          </Button>
        }
        contentFlush
      >
        {recordedConsumptionFilterBar}
        <div className="grid gap-3 border-b p-3 sm:grid-cols-3">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Dòng hiển thị</span>
            <span className="font-mono text-sm font-semibold">
              {visibleRecordedConsumptions.length}/{recordedConsumptions.length}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Tổng thành tiền</span>
            <span className="font-mono text-sm font-semibold">
              {formatVND(visibleRecordedConsumptionTotal)}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Phạm vi</span>
            <span className="text-sm font-medium">
              {recordedConsumptionHeaderHint}
            </span>
          </div>
        </div>
        <DataTable
          columns={recordedConsumptionColumns}
          data={visibleRecordedConsumptions}
          getRowKey={(item) => item.id}
          emptyTitle="Chưa có tiêu hao đã ghi nhận"
          emptyDescription="Các báo cáo tiêu hao đã duyệt sẽ xuất hiện ở đây sau khi trừ kho."
          emptyMode="no-data"
          mobileCardRender={renderRecordedConsumptionCard}
        />
      </AppSection>

      <AppSection title="Phiếu tiêu hao" contentFlush>
        {filterBar}
        <DataTable
          columns={issueColumns}
          data={filtered}
          getRowKey={(item) => item.id}
          emptyTitle={
            hasActiveFilters
              ? "Không tìm thấy phiếu xuất phù hợp"
              : "Chưa có phiếu xuất kho nào"
          }
          emptyDescription="Điều chỉnh bộ lọc hoặc tạo phiếu xuất mới để bắt đầu."
          emptyMode={hasActiveFilters ? "no-results" : "no-data"}
          mobileCardRender={renderIssueCard}
        />
      </AppSection>

      <FormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Tạo phiếu"
        description={CREATE_ISSUE_DIALOG_DESCRIPTION}
        schema={createIssueSchema}
        defaultValues={createIssueDefaultValues}
        entityKey={defaultBranchId ?? "new-issue"}
        onSubmit={handleCreate}
        successMessage="Đã tạo phiếu xuất."
        submitLabel="Tạo phiếu"
        cancelLabel={ACTIONS_VI.cancel}
      >
        {(form) => {
          const selectedBranchId = form.watch("branchId");
          const selectedKind =
            branches.find((branch) => branch.id === Number(selectedBranchId))
              ?.branchKind ?? null;
          return (
            <>
              <SelectField
                control={form.control}
                name="branchId"
                label={BRANCH_VI.long}
                placeholder={BRANCH_VI.select}
                options={branches.map((branch) => ({
                  value: String(branch.id),
                  label: branch.name,
                }))}
                required
              />
              <SelectField
                control={form.control}
                name="issueType"
                label="Loại xuất"
                options={ISSUE_TYPES.map((option) => ({
                  value: option.value,
                  label:
                    option.value === "consumption"
                      ? issueTypeLabel("consumption", selectedKind)
                      : option.label,
                }))}
                required
              />
              <TextareaField
                control={form.control}
                name="notes"
                label={FORM_VI.notes}
                rows={3}
                placeholder="Nhập ghi chú cho phiếu xuất"
              />
            </>
          );
        }}
      </FormDialog>
    </AppPage>
  );
}
