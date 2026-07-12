"use client";

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
import { Label } from "@comtammatu/ui/components/label";
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
import { cn } from "@comtammatu/ui";
import { downloadCsv } from "@/_lib/download-file";
import { matchesSearch } from "@lib/search";
import { messages } from "@lib/messages";
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
import { InteractiveCard } from "@/components/data-table/interactive-card";
import { getStatusBadgeMeta, StatusBadge } from "@/components/status-badge";
import { formatVND } from "../_lib/format";
import { tNav } from "../_lib/dictionary";
import { createStockIssueDraft } from "../issue-actions";

import {
  ACTIONS_VI,
  BRANCH_VI,
  FORM_VI,
  INVENTORY_VI,
  PRODUCT_VI,
} from "@comtammatu/shared/messages";
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
  { value: "consumption", label: INVENTORY_VI.issueTypeConsumption },
  { value: "writeoff", label: INVENTORY_VI.issueTypeWriteoff },
  { value: "other", label: INVENTORY_VI.issueTypeOther },
] as const;

function issueTypeLabel(type: string, branchKind: string | null): string {
  void branchKind;
  return ISSUE_TYPES.find((o) => o.value === type)?.label ?? type;
}

const STATE_FILTER_OPTIONS = ["draft", "confirmed", "cancelled"].map(
  (value) => ({
    value,
    label: getStatusBadgeMeta("inventory", value).label,
  }),
);

// Filter options show generic labels (no branch context at the filter level).
const TYPE_FILTER_OPTIONS = [
  { value: "all", label: INVENTORY_VI.issueTypeFilterAll },
  { value: "consumption", label: INVENTORY_VI.issueTypeConsumption },
  { value: "writeoff", label: INVENTORY_VI.issueTypeWriteoff },
  { value: "other", label: INVENTORY_VI.issueTypeOther },
];

const labelBranchExportSuffix = " xuất";
const labelBranchExportPrefix = " xuất: ";

const createIssueSchema = z.object({
  branchId: z
    .string()
    .min(1, { error: INVENTORY_VI.issueCreateBranchRequired }),
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

function buildListHref(
  listBasePath: string,
  params: URLSearchParams,
): string {
  const query = params.toString();
  return query ? `${listBasePath}?${query}` : listBasePath;
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
  listBasePath = "/inventory/consumption",
  allowedIssueTypes = ["consumption", "writeoff", "other"],
  defaultIssueType = "consumption",
  pageTitle,
  embedded = false,
}: {
  issues: IssueRow[];
  recordedConsumptions: RecordedConsumptionRow[];
  branches: IssueBranchOption[];
  defaultBranchId: number | null;
  recordedBranchId: number | null;
  recordedEndDate: string;
  recordedIsLimited: boolean;
  recordedStartDate: string;
  listBasePath?: string;
  allowedIssueTypes?: string[];
  defaultIssueType?: string;
  pageTitle?: string;
  embedded?: boolean;
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
  const isOperator = listBasePath.startsWith("/br/");
  const controlSize = isOperator ? "touch" : "default";
  const compactActionSize = isOperator ? "touch" : "sm";
  const fieldClassName = isOperator ? "h-12 w-full sm:h-10" : "h-10 w-full";
  const createIssueDefaultValues = useMemo<CreateIssueValues>(
    () => ({
      branchId: defaultBranchId ? String(defaultBranchId) : "",
      issueType: defaultIssueType as CreateIssueValues["issueType"],
      notes: "",
    }),
    [defaultBranchId, defaultIssueType],
  );
  const allowedCreateIssueTypes = ISSUE_TYPES.filter((option) =>
    allowedIssueTypes.includes(option.value),
  );
  const allowedTypeFilterOptions = TYPE_FILTER_OPTIONS.filter(
    (option) =>
      option.value === "all" || allowedIssueTypes.includes(option.value),
  );
  const isConsumptionScope =
    allowedIssueTypes.length === 1 && allowedIssueTypes[0] === "consumption";
  const issueListTitle = isConsumptionScope
    ? INVENTORY_VI.manualConsumptionSlipsTitle
    : INVENTORY_VI.issueSlipsTitle;
  const createIssueActionLabel = isConsumptionScope
    ? INVENTORY_VI.manualConsumptionCreateAction
    : INVENTORY_VI.issueCreateAction;
  const createIssueDialogDescription = isConsumptionScope
    ? INVENTORY_VI.manualConsumptionCreateDescription
    : INVENTORY_VI.issueCreateDialogDescription;
  const issueEmptyNoDataTitle = isConsumptionScope
    ? INVENTORY_VI.manualConsumptionEmptyTitle
    : INVENTORY_VI.issueEmptyNoData;
  const issueEmptyDescription = isConsumptionScope
    ? INVENTORY_VI.manualConsumptionEmptyDescription
    : INVENTORY_VI.issueEmptyDescription;
  // Capability-gated only — the CSV builds client-side and downloads fine
  // on phones; hiding it by breakpoint forced warehouse staff back to a
  // desktop just to press one button.
  const showExportAction = true;
  const hasRecordedDateFilter =
    initialRecordedStartDate !== "" || initialRecordedEndDate !== "";
  const hasRecordedServerFilter =
    hasRecordedDateFilter || initialRecordedBranchId !== null;
  const recordedConsumptionHeaderHint = recordedIsLimited
    ? INVENTORY_VI.rowCountRecent(recordedConsumptions.length)
    : INVENTORY_VI.grnDraftLineCount(recordedConsumptions.length);
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
      router.push(`${listBasePath}/${newId}`);
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
        [row.ingredientName, row.branchName, row.locationName, row.sourceLabel],
        q,
      ),
    );
  }, [recordedConsumptions, recordedSearch]);
  const visibleRecordedConsumptionTotal = visibleRecordedConsumptions.reduce(
    (sum, row) => sum + row.totalCostValue,
    0,
  );
  const visibleRecordedConsumptionHint = recordedIsLimited
    ? INVENTORY_VI.rowRatioRecent(
        visibleRecordedConsumptions.length,
        recordedConsumptions.length,
      )
    : INVENTORY_VI.rowRatio(
        visibleRecordedConsumptions.length,
        recordedConsumptions.length,
      );

  function handleExportIssuesCsv() {
    if (filtered.length === 0) {
      toast.error(INVENTORY_VI.issueExportEmpty);
      return;
    }

    const header = [
      INVENTORY_VI.issueCode,
      INVENTORY_VI.issueTypeLabel,
      BRANCH_VI.long,
      INVENTORY_VI.createdDate,
      FORM_VI.status,
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

    const filePrefix = isConsumptionScope
      ? "manual-consumption-slips"
      : "other-writeoffs";

    downloadCsv(toUtf8Base64(csv), `${filePrefix}-${stamp}.csv`);
    toast.success(INVENTORY_VI.issueExportSuccess(filtered.length));
  }

  function handleExportRecordedCsv() {
    if (visibleRecordedConsumptions.length === 0) {
      toast.error(INVENTORY_VI.recordedExportEmpty);
      return;
    }

    const header = [
      INVENTORY_VI.recordedAtLabel,
      PRODUCT_VI.rawIngredient,
      BRANCH_VI.long,
      INVENTORY_VI.deductLocationLabel,
      FORM_VI.quantity,
      INVENTORY_VI.unitCostLabel,
      FORM_VI.amount,
      INVENTORY_VI.sourceLabel,
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

    downloadCsv(toUtf8Base64(csv), `recorded-consumption-${stamp}.csv`);
    toast.success(
      INVENTORY_VI.recordedExportSuccess(visibleRecordedConsumptions.length),
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

    router.push(buildListHref(listBasePath, next));
  }

  function clearRecordedDateFilter() {
    const next = new URLSearchParams(searchParams.toString());
    next.delete("startDate");
    next.delete("endDate");
    next.delete("branchId");
    setRecordedStartDate("");
    setRecordedEndDate("");
    setRecordedBranchId("all");
    router.push(buildListHref(listBasePath, next));
  }

  const issueActions = (
    <>
      <Button
        type="button"
        size={controlSize}
        onClick={() => setCreateOpen(true)}
      >
        <IconPlus className="size-4" />
        {createIssueActionLabel}
      </Button>
      {showExportAction ? (
        <Button
          type="button"
          variant="outline"
          size={controlSize}
          onClick={handleExportIssuesCsv}
        >
          <IconFileDownload className="size-4" />
          {INVENTORY_VI.exportReportAction}
        </Button>
      ) : null}
    </>
  );

  const filterBar = (
    <AppToolbar
      variant="inline"
      className="items-stretch sm:items-center"
      search={
        <InputGroup className={fieldClassName}>
          <InputGroupAddon>
            <IconSearch />
          </InputGroupAddon>
          <InputGroupInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={INVENTORY_VI.issueSearchPlaceholder}
            inputMode="search"
          />
        </InputGroup>
      }
      filters={
        <>
          <Select value={activeStatus} onValueChange={setActiveStatus}>
            <SelectTrigger
              size={controlSize}
              className={isOperator ? "w-full sm:w-48" : "w-48"}
            >
              <SelectValue placeholder={INVENTORY_VI.allStatusesOption} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                {INVENTORY_VI.allStatusesOption}
              </SelectItem>
              {STATE_FILTER_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={activeType} onValueChange={setActiveType}>
            <SelectTrigger
              size={controlSize}
              className={isOperator ? "w-full sm:w-48" : "w-48"}
            >
              <SelectValue placeholder={INVENTORY_VI.issueTypeFilterAll} />
            </SelectTrigger>
            <SelectContent>
              {allowedTypeFilterOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </>
      }
      bulk={
        <Badge variant="outline" className="rounded-full">
          {filtered.length}/{issues.length}
        </Badge>
      }
      actions={embedded ? issueActions : null}
      reset={
        hasActiveFilters ? (
          <Button
            type="button"
            variant="ghost"
            size={compactActionSize}
            onClick={() => {
              setActiveStatus("all");
              setActiveType("all");
              setSearch("");
            }}
          >
            <IconFilterX className="mr-1 size-4" />
            {ACTIONS_VI.clearFilter}
          </Button>
        ) : null
      }
    />
  );

  const recordedConsumptionFilterBar = (
    <AppToolbar
      variant="inline"
      className="items-stretch sm:items-center"
      search={
        <InputGroup
          className={cn(
            "min-w-56 flex-1",
            isOperator ? "h-12 sm:h-10" : "h-10",
          )}
        >
          <InputGroupAddon>
            <IconSearch />
          </InputGroupAddon>
          <InputGroupInput
            value={recordedSearch}
            onChange={(event) => setRecordedSearch(event.target.value)}
            placeholder={INVENTORY_VI.recordedSearchPlaceholder}
            inputMode="search"
          />
        </InputGroup>
      }
      filters={
        <>
          <Select
            value={selectedRecordedBranchId}
            onValueChange={setRecordedBranchId}
          >
            <SelectTrigger
              size={controlSize}
              className={isOperator ? "w-full" : "w-48"}
            >
              <SelectValue placeholder={BRANCH_VI.select} />
            </SelectTrigger>
            <SelectContent>
              {canSelectAllRecordedBranches ? (
                <SelectItem value="all">{BRANCH_VI.selectAll}</SelectItem>
              ) : null}
              {visibleRecordedBranchOptions.map((branch) => (
                <SelectItem key={branch.id} value={String(branch.id)}>
                  {branch.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div
            className={cn(
              "flex flex-col gap-1",
              isOperator ? "w-full sm:w-auto sm:min-w-40" : "min-w-40",
            )}
          >
            <Label
              htmlFor="recorded-start-date"
              className="text-xs font-medium text-muted-foreground font-normal"
            >
              {FORM_VI.fromDate}
            </Label>
            <Input
              id="recorded-start-date"
              type="date"
              value={recordedStartDate}
              onChange={(event) => setRecordedStartDate(event.target.value)}
              className={cn(
                "bg-background",
                isOperator ? "h-12 w-full" : "h-10 w-40",
              )}
            />
          </div>
          <div
            className={cn(
              "flex flex-col gap-1",
              isOperator ? "w-full sm:w-auto sm:min-w-40" : "min-w-40",
            )}
          >
            <Label
              htmlFor="recorded-end-date"
              className="text-xs font-medium text-muted-foreground font-normal"
            >
              {FORM_VI.toDate}
            </Label>
            <Input
              id="recorded-end-date"
              type="date"
              value={recordedEndDate}
              onChange={(event) => setRecordedEndDate(event.target.value)}
              className={cn(
                "bg-background",
                isOperator ? "h-12 w-full" : "h-10 w-40",
              )}
            />
          </div>
        </>
      }
      actions={
        <Button
          type="button"
          variant="outline"
          size={controlSize}
          className={isOperator ? "w-full sm:w-auto" : undefined}
          onClick={applyRecordedDateFilter}
        >
          {ACTIONS_VI.filter}
        </Button>
      }
      reset={
        hasRecordedServerFilter ? (
          <Button
            type="button"
            variant="ghost"
            size={compactActionSize}
            onClick={clearRecordedDateFilter}
          >
            <IconFilterX className="mr-1 size-4" />
            {ACTIONS_VI.clearFilter}
          </Button>
        ) : null
      }
    />
  );

  const issueColumns: DataTableColumn<IssueRow>[] = [
    {
      key: "code",
      header: INVENTORY_VI.issueCode,
      render: (item) => (
        <Link
          href={`${listBasePath}/${item.id}`}
          className="font-mono text-primary hover:underline"
        >
          {item.code}
        </Link>
      ),
    },
    {
      key: "type",
      header: INVENTORY_VI.issueTypeLabel,
      render: (item) => issueTypeLabel(item.type, item.branchKind),
    },
    {
      key: "branchName",
      header: BRANCH_VI.long,
      render: (item) => item.branchName,
    },
    {
      key: "date",
      header: INVENTORY_VI.createdDate,
      render: (item) => (
        <span className="font-mono tabular-nums text-muted-foreground">
          {item.date}
        </span>
      ),
    },
    {
      key: "status",
      header: FORM_VI.status,
      render: (item) => (
        <StatusBadge domain="inventory" value={item.status} size="sm" />
      ),
    },
    {
      key: "actions",
      header: "",
      className: "w-10",
      render: (item) => (
        <Button
          variant="ghost"
          size="icon-sm"
          asChild
          aria-label={`${ACTIONS_VI.viewDetails} ${item.code}`}
        >
          <Link href={`${listBasePath}/${item.id}`}>
            <IconDotsVertical className="size-4" />
          </Link>
        </Button>
      ),
    },
  ];

  const recordedConsumptionColumns: DataTableColumn<RecordedConsumptionRow>[] = [
    {
      key: "recordedAt",
      header: INVENTORY_VI.recordedAtLabel,
      render: (item) => (
        <span className="font-mono tabular-nums text-muted-foreground">
          {item.recordedAt}
        </span>
      ),
    },
    {
      key: "ingredientName",
      header: PRODUCT_VI.rawIngredient,
      render: (item) => item.ingredientName,
    },
    {
      key: "branchName",
      header: BRANCH_VI.long,
      render: (item) => item.branchName,
    },
    {
      key: "locationName",
      header: INVENTORY_VI.deductLocationLabel,
      render: (item) => item.locationName,
    },
    {
      key: "quantity",
      header: FORM_VI.quantity,
      render: (item) => (
        <span className="font-mono tabular-nums">{item.quantity}</span>
      ),
    },
    {
      key: "unitCost",
      header: INVENTORY_VI.unitCostLabel,
      render: (item) => (
        <span className="font-mono tabular-nums">{item.unitCost}</span>
      ),
    },
    {
      key: "totalCost",
      header: FORM_VI.amount,
      className: "text-right",
      render: (item) => (
        <span className="font-mono font-medium tabular-nums">
          {item.totalCost}
        </span>
      ),
    },
    {
      key: "sourceLabel",
      header: INVENTORY_VI.sourceLabel,
      className: "min-w-44",
      render: (item) => item.sourceLabel,
    },
  ];

  const renderIssueCard = (item: IssueRow) => (
    <InteractiveCard asChild minHeight="mobile" padding="default">
      <Link href={`${listBasePath}/${item.id}`} className="block">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-semibold">{item.code}</span>
            <StatusBadge domain="inventory" value={item.status} size="sm" />
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

  const content = (
    <>
      {embedded ? null : (
        <AppPageHeader
          eyebrow={messages.inventory.shell.moduleName}
          title={pageTitle ?? tNav("consumption", "navigation")}
          actions={issueActions}
        />
      )}

      {(recordedConsumptions.length > 0 || isConsumptionScope) && (
        <AppSection
          title={INVENTORY_VI.recordedConsumptionTitle}
          headerHint={visibleRecordedConsumptionHint}
          action={
            <Button
              type="button"
              variant="outline"
              size={compactActionSize}
              onClick={handleExportRecordedCsv}
            >
              <IconFileDownload className="size-4" />
              {INVENTORY_VI.exportCsvAction}
            </Button>
          }
          contentFlush
          size={embedded ? "sm" : "default"}
          collapsible
          defaultOpen={!embedded}
        >
          {recordedConsumptionFilterBar}
          <div className="grid gap-3 border-b p-3 sm:grid-cols-3">
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">
                {INVENTORY_VI.visibleRowsLabel}
              </span>
              <span className="font-mono text-sm font-semibold">
                {visibleRecordedConsumptions.length}/
                {recordedConsumptions.length}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">
                {INVENTORY_VI.totalAmountLabel}
              </span>
              <span className="font-mono text-sm font-semibold">
                {formatVND(visibleRecordedConsumptionTotal)}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">
                {INVENTORY_VI.scopeLabel}
              </span>
              <span className="text-sm font-medium">
                {recordedConsumptionHeaderHint}
              </span>
            </div>
          </div>
          <DataTable
            columns={recordedConsumptionColumns}
            data={visibleRecordedConsumptions}
            getRowKey={(item) => item.id}
            emptyTitle={INVENTORY_VI.recordedEmptyTitle}
            emptyDescription={INVENTORY_VI.recordedEmptyDescription}
            emptyMode="no-data"
            mobileCardRender={renderRecordedConsumptionCard}
          />
        </AppSection>
      )}

      <AppSection
        title={issueListTitle}
        className="overflow-hidden"
        contentFlush
      >
        {filterBar}
        <DataTable
          columns={issueColumns}
          data={filtered}
          getRowKey={(item) => item.id}
          emptyTitle={
            hasActiveFilters
              ? INVENTORY_VI.issueEmptyFiltered
              : issueEmptyNoDataTitle
          }
          emptyDescription={issueEmptyDescription}
          emptyMode={hasActiveFilters ? "no-results" : "no-data"}
          mobileCardRender={renderIssueCard}
        />
      </AppSection>

      <FormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title={createIssueActionLabel}
        description={createIssueDialogDescription}
        schema={createIssueSchema}
        defaultValues={createIssueDefaultValues}
        entityKey={defaultBranchId ?? "new-issue"}
        onSubmit={handleCreate}
        successMessage={INVENTORY_VI.issueCreated}
        submitLabel={createIssueActionLabel}
        cancelLabel={ACTIONS_VI.cancel}
      >
        {(form) => {
          const selectedBranchId = form.watch("branchId");
          const selectedBranch =
            branches.find((branch) => branch.id === Number(selectedBranchId)) ??
            null;
          const selectedKind = selectedBranch?.branchKind ?? null;
          return (
            <>
              <SelectField
                control={form.control}
                name="branchId"
                label={`${BRANCH_VI.long}${labelBranchExportSuffix}`}
                placeholder={BRANCH_VI.select}
                options={branches.map((branch) => ({
                  value: String(branch.id),
                  label: branch.name,
                }))}
                required
              />
              {selectedBranch ? (
                <p className="text-xs text-muted-foreground">
                  {`${BRANCH_VI.long}${labelBranchExportPrefix}`}
                  <span className="font-medium text-foreground">
                    {selectedBranch.name}
                  </span>
                </p>
              ) : null}
              <SelectField
                control={form.control}
                name="issueType"
                label={INVENTORY_VI.issueTypeLabel}
                options={allowedCreateIssueTypes.map((option) => ({
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
                placeholder={INVENTORY_VI.issueNotesPlaceholder}
              />
            </>
          );
        }}
      </FormDialog>
    </>
  );

  if (embedded) {
    return <div className="flex w-full flex-col gap-3">{content}</div>;
  }

  return (
    <AppPage width="xwide" density="compact">
      {content}
    </AppPage>
  );
}
