"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { z } from "zod";
import {
  ArrowRightToLine as IconArrowBarRight,
  FileDown as IconFileDownload,
  FilterX as IconFilterX,
  Plus as IconPlus,
  Search as IconSearch,
} from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
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
import { FormDialog, SelectField, TextareaField } from "@/components/form";
import { useFormControlSize } from "@/components/form/control-size";
import {
  AppListFrame,
  AppPage,
  AppPageHeader,
  AppToolbar,
} from "@/components/surface";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import { InteractiveCard } from "@/components/data-table/interactive-card";
import {
  RowActionsContextMenuItems,
  RowActionsMenu,
  type RowActionItem,
} from "@/components/row-actions-menu";
import { getStatusBadgeMeta, StatusBadge } from "@/components/status-badge";
import { formatVND } from "@lib/inventory/format";
import { tNav } from "../_lib/dictionary";
import {
  inventoryListFilterSelectClassName,
} from "../_components/inventory-list-frame";
import { createStockIssueDraft } from "../issue-actions";
import { UNKNOWN_LABEL_VI } from "@comtammatu/shared/labels";

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
  monetary: {
    unitCost: string;
    totalCost: string;
    totalCostValue: number;
  } | null;
};

const ISSUE_TYPES = [
  { value: "consumption", label: INVENTORY_VI.issueTypeConsumption },
  { value: "writeoff", label: INVENTORY_VI.issueTypeWriteoff },
  { value: "other", label: INVENTORY_VI.issueTypeOther },
] as const;

function issueTypeLabel(type: string, branchKind: string | null): string {
  void branchKind;
  return ISSUE_TYPES.find((o) => o.value === type)?.label ?? UNKNOWN_LABEL_VI;
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

function buildListHref(listBasePath: string, params: URLSearchParams): string {
  const query = params.toString();
  return query ? `${listBasePath}?${query}` : listBasePath;
}

export function IssuesClient({
  issues,
  recordedConsumptions,
  showRecordedConsumptions = true,
  canViewMonetary,
  branches,
  defaultBranchId,
  recordedBranchId: initialRecordedBranchId,
  recordedEndDate: initialRecordedEndDate,
  recordedIsLimited,
  recordedStartDate: initialRecordedStartDate,
  listBasePath = "/inventory/consumption",
  detailBasePath = listBasePath,
  allowedIssueTypes = ["consumption", "writeoff", "other"],
  defaultIssueType = "consumption",
  pageTitle,
  embedded = false,
}: {
  issues: IssueRow[];
  recordedConsumptions: RecordedConsumptionRow[];
  showRecordedConsumptions?: boolean;
  canViewMonetary: boolean;
  branches: IssueBranchOption[];
  defaultBranchId: number | null;
  recordedBranchId: number | null;
  recordedEndDate: string;
  recordedIsLimited: boolean;
  recordedStartDate: string;
  listBasePath?: string;
  detailBasePath?: string;
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
  const [openActionRowId, setOpenActionRowId] = useState<number | null>(null);
  const isOperator = listBasePath.startsWith("/br/");
  const controlSize = useFormControlSize(isOperator ? "touch" : "responsive");
  const compactActionSize = isOperator ? "touch" : "sm";
  const createIssueDefaultValues = useMemo<CreateIssueValues>(
    () => ({
      branchId: defaultBranchId ? String(defaultBranchId) : "",
      issueType: defaultIssueType as CreateIssueValues["issueType"],
      notes: "",
    }),
    [defaultBranchId, defaultIssueType],
  );

  const issueDetailHref = (item: IssueRow) => `${detailBasePath}/${item.id}`;

  const getIssueRowActions = (item: IssueRow): RowActionItem[] => [
    {
      key: "view",
      label: ACTIONS_VI.viewDetails,
      icon: <IconArrowBarRight />,
      href: issueDetailHref(item),
    },
  ];

  const openIssueDetail = (item: IssueRow) => {
    router.push(issueDetailHref(item));
  };
  const allowedCreateIssueTypes = ISSUE_TYPES.filter(
    (option) =>
      allowedIssueTypes.includes(option.value) &&
      option.value !== "writeoff" &&
      (!allowedIssueTypes.includes("consumption") ||
        allowedIssueTypes.length === 1 ||
        option.value === "consumption"),
  );
  const allowedTypeFilterOptions = TYPE_FILTER_OPTIONS.filter(
    (option) =>
      option.value === "all" || allowedIssueTypes.includes(option.value),
  );
  const isConsumptionScope =
    allowedIssueTypes.length === 1 && allowedIssueTypes[0] === "consumption";
  const isCombinedConsumptionScope =
    allowedIssueTypes.length > 1 && allowedIssueTypes.includes("consumption");
  const showsRecordedConsumption =
    showRecordedConsumptions && allowedIssueTypes.includes("consumption");
  const issueListTitle = isCombinedConsumptionScope
    ? INVENTORY_VI.combinedConsumptionSlipsTitle
    : isConsumptionScope
      ? INVENTORY_VI.manualConsumptionSlipsTitle
      : INVENTORY_VI.issueSlipsTitle;
  const createIssueActionLabel = isCombinedConsumptionScope
    ? INVENTORY_VI.combinedConsumptionCreateAction
    : isConsumptionScope
      ? INVENTORY_VI.manualConsumptionCreateAction
      : INVENTORY_VI.issueCreateAction;
  const createIssueDialogDescription = isCombinedConsumptionScope
    ? INVENTORY_VI.combinedConsumptionCreateDescription
    : isConsumptionScope
      ? INVENTORY_VI.manualConsumptionCreateDescription
      : INVENTORY_VI.issueCreateDialogDescription;
  const issueEmptyNoDataTitle = isCombinedConsumptionScope
    ? INVENTORY_VI.combinedConsumptionEmptyTitle
    : isConsumptionScope
      ? INVENTORY_VI.manualConsumptionEmptyTitle
      : INVENTORY_VI.issueEmptyNoData;
  const issueEmptyDescription = isCombinedConsumptionScope
    ? INVENTORY_VI.combinedConsumptionEmptyDescription
    : isConsumptionScope
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
      router.push(`${detailBasePath}/${newId}`);
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
    (sum, row) => sum + (row.monetary?.totalCostValue ?? 0),
    0,
  );
  const visibleRecordedConsumptionRatio = recordedIsLimited
    ? INVENTORY_VI.rowRatioRecent(
        visibleRecordedConsumptions.length,
        recordedConsumptions.length,
      )
    : INVENTORY_VI.rowRatio(
        visibleRecordedConsumptions.length,
        recordedConsumptions.length,
      );
  const visibleRecordedConsumptionHint = (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
      <span>{visibleRecordedConsumptionRatio}</span>
      {canViewMonetary ? <span>
        {INVENTORY_VI.totalAmountLabel}:{" "}
        <span className="font-mono font-semibold text-foreground">
          {formatVND(visibleRecordedConsumptionTotal)}
        </span>
      </span> : null}
    </span>
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
      ? "phieu-tieu-hao-thu-cong"
      : "wo-pxk-khac";

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
      ...(canViewMonetary
        ? [INVENTORY_VI.unitCostLabel, FORM_VI.amount]
        : []),
      INVENTORY_VI.sourceLabel,
    ];
    const rows = visibleRecordedConsumptions.map((row) => [
      row.recordedAt,
      row.ingredientName,
      row.branchName,
      row.locationName,
      row.quantity,
      ...(row.monetary
        ? [row.monetary.unitCost, row.monetary.totalCost]
        : []),
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
        size={embedded ? controlSize : "lg"}
        onClick={() => setCreateOpen(true)}
      >
        <IconPlus className="size-4" />
        {createIssueActionLabel}
      </Button>
      {isCombinedConsumptionScope && defaultBranchId ? (
        <Button
          render={
            <Link href={`/inventory/waste/new?branchId=${defaultBranchId}`} />
          }
          variant="outline"
          size={embedded ? controlSize : "lg"}
        >
          {INVENTORY_VI.createWasteTitle}
        </Button>
      ) : null}
      {showExportAction ? (
        <Button
          type="button"
          variant="outline"
          size={embedded ? controlSize : "lg"}
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
      className="items-center"
      search={
        <InputGroup size={controlSize} className="min-w-0 flex-1">
          <InputGroupAddon>
            <IconSearch />
          </InputGroupAddon>
          <InputGroupInput
            type="search"
            aria-label={INVENTORY_VI.issueSearchPlaceholder}
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
              className={
                controlSize === "touch"
                  ? "w-full"
                  : inventoryListFilterSelectClassName
              }
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
              className={
                controlSize === "touch"
                  ? "w-full"
                  : inventoryListFilterSelectClassName
              }
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
      actions={embedded ? issueActions : null}
      reset={
        hasActiveFilters ? (
          <Button
            type="button"
            variant="ghost"
            size={controlSize}
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

  const recordedBranchSelectItems = [
    ...(canSelectAllRecordedBranches
      ? [{ value: "all", label: BRANCH_VI.selectAll }]
      : []),
    ...visibleRecordedBranchOptions.map((branch) => ({
      value: String(branch.id),
      label: branch.name,
    })),
  ];

  const recordedConsumptionFilterBar = (
    <AppToolbar
      variant="inline"
      className="items-center"
      search={
        <InputGroup size={controlSize} className="min-w-0 flex-1">
          <InputGroupAddon>
            <IconSearch />
          </InputGroupAddon>
          <InputGroupInput
            type="search"
            aria-label={INVENTORY_VI.recordedSearchPlaceholder}
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
            items={recordedBranchSelectItems}
          >
            <SelectTrigger
              size={controlSize}
              aria-label={BRANCH_VI.select}
              className={
                controlSize === "touch"
                  ? "w-full"
                  : inventoryListFilterSelectClassName
              }
            >
              <SelectValue placeholder={BRANCH_VI.select} />
            </SelectTrigger>
            <SelectContent>
              {recordedBranchSelectItems.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <InputGroup
            size={controlSize}
            className={cn(
              "bg-background",
              isOperator ? "w-full sm:w-52" : "w-52 shrink-0",
            )}
          >
            <InputGroupAddon>
              <InputGroupText>{FORM_VI.fromDate}</InputGroupText>
            </InputGroupAddon>
            <InputGroupInput
              id="recorded-start-date"
              type="date"
              aria-label={FORM_VI.fromDate}
              value={recordedStartDate}
              onChange={(event) => setRecordedStartDate(event.target.value)}
            />
          </InputGroup>
          <InputGroup
            size={controlSize}
            className={cn(
              "bg-background",
              isOperator ? "w-full sm:w-52" : "w-52 shrink-0",
            )}
          >
            <InputGroupAddon>
              <InputGroupText>{FORM_VI.toDate}</InputGroupText>
            </InputGroupAddon>
            <InputGroupInput
              id="recorded-end-date"
              type="date"
              aria-label={FORM_VI.toDate}
              value={recordedEndDate}
              onChange={(event) => setRecordedEndDate(event.target.value)}
            />
          </InputGroup>
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
            size={controlSize}
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
          href={`${detailBasePath}/${item.id}`}
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
      header: <span className="sr-only">{FORM_VI.action}</span>,
      className: "w-10 text-right",
      render: (item) => {
        const items = getIssueRowActions(item);
        return (
          <div
            className="flex justify-end"
            onClick={(event) => event.stopPropagation()}
          >
            <RowActionsMenu
              items={items}
              label={`${ACTIONS_VI.viewDetails} ${item.code}`}
              triggerSize="icon-sm"
              open={openActionRowId === item.id}
              onOpenChange={(open) =>
                setOpenActionRowId(open ? item.id : null)
              }
            />
          </div>
        );
      },
    },
  ];

  const recordedConsumptionColumns: DataTableColumn<RecordedConsumptionRow>[] =
    [
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
      ...(canViewMonetary
        ? [
            {
              key: "unitCost",
              header: INVENTORY_VI.unitCostLabel,
              render: (item: RecordedConsumptionRow) => (
                <span className="font-mono tabular-nums">
                  {item.monetary?.unitCost ?? "—"}
                </span>
              ),
            },
            {
              key: "totalCost",
              header: FORM_VI.amount,
              className: "text-right",
              render: (item: RecordedConsumptionRow) => (
                <span className="font-mono font-medium tabular-nums">
                  {item.monetary?.totalCost ?? "—"}
                </span>
              ),
            },
          ]
        : []),
      {
        key: "sourceLabel",
        header: INVENTORY_VI.sourceLabel,
        className: "min-w-44",
        render: (item) => item.sourceLabel,
      },
    ];

  const renderIssueCard = (item: IssueRow) => {
    const actions = getIssueRowActions(item);
    return (
      <InteractiveCard
        minHeight="mobile"
        padding="default"
        className="cursor-pointer"
        role="button"
        tabIndex={0}
        onClick={() => openIssueDetail(item)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openIssueDetail(item);
          }
        }}
      >
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
        <div
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <RowActionsMenu
            items={actions}
            label={`${ACTIONS_VI.viewDetails} ${item.code}`}
            triggerSize="icon-touch"
          />
        </div>
      </InteractiveCard>
    );
  };

  const renderRecordedConsumptionCard = (item: RecordedConsumptionRow) => (
    <InteractiveCard minHeight="tap" padding="compact">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex min-w-0 items-center justify-between gap-2">
          <span className="truncate text-sm font-medium">
            {item.ingredientName}
          </span>
          {canViewMonetary ? (
            <span className="shrink-0 font-mono text-sm font-semibold">
              {item.monetary?.totalCost ?? "—"}
            </span>
          ) : null}
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
          title={pageTitle ?? tNav("consumption", "navigation")}
          actions={issueActions}
        />
      )}

      {(recordedConsumptions.length > 0 || showsRecordedConsumption) && (
        <AppListFrame
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
          size={embedded ? "sm" : "default"}
          collapsible
          defaultOpen={!embedded}
          toolbar={recordedConsumptionFilterBar}
        >
          <DataTable
            columns={recordedConsumptionColumns}
            data={visibleRecordedConsumptions}
            pageSize={50}
            getRowKey={(item) => item.id}
            emptyTitle={INVENTORY_VI.recordedEmptyTitle}
            emptyDescription={INVENTORY_VI.recordedEmptyDescription}
            emptyMode="no-data"
            mobileCardRender={renderRecordedConsumptionCard}
          />
        </AppListFrame>
      )}

      <AppListFrame
        title={issueListTitle}
        headerHint={INVENTORY_VI.rowRatio(filtered.length, issues.length)}
        toolbar={filterBar}
      >
        <DataTable
          columns={issueColumns}
          data={filtered}
          pageSize={50}
          getRowKey={(item) => item.id}
          emptyTitle={
            hasActiveFilters
              ? INVENTORY_VI.issueEmptyFiltered
              : issueEmptyNoDataTitle
          }
          emptyDescription={issueEmptyDescription}
          emptyMode={hasActiveFilters ? "no-results" : "no-data"}
          onRowClick={openIssueDetail}
          getRowDataState={(item) =>
            openActionRowId === item.id ? "selected" : undefined
          }
          renderRowContextMenu={(item) => (
            <RowActionsContextMenuItems items={getIssueRowActions(item)} />
          )}
          mobileCardRender={renderIssueCard}
        />
      </AppListFrame>

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
