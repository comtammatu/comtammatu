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
import { InteractiveCard } from "@comtammatu/ui/components/interactive-card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@comtammatu/ui/components/sheet";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { toast } from "@comtammatu/ui/components/sonner";
import { cn } from "@comtammatu/ui";
import { downloadCsv } from "@/_lib/download-file";
import { matchesSearch } from "@lib/search";
import {
  filterSaleConsumptionOrders,
  flattenSaleConsumptionOrdersForExport,
} from "@lib/inventory/recorded-sale-consumption-model";
import type { RecordedSaleConsumptionOrder } from "@lib/inventory/recorded-sale-consumption-model";
import { FormDialog, SelectField, TextareaField } from "@/components/form";
import { useFormControlSize } from "@/components/form/control-size";
import {
  AppListFrame,
  AppPage,
  AppPageHeader,
  AppToolbar,
} from "@/components/surface";
import { AppPageTabs, TabsContent } from "@/components/app-page-tabs";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
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
} from "../_components/inventory-list-filters";
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

export type RecordedConsumptionRow = RecordedSaleConsumptionOrder;

const ISSUE_TYPES = [
  { value: "consumption", label: INVENTORY_VI.issueTypeConsumption },
  { value: "writeoff", label: INVENTORY_VI.issueTypeWriteoff },
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
];

const labelBranchExportSuffix = " xuất";
const labelBranchExportPrefix = " xuất: ";

const createIssueSchema = z.object({
  branchId: z
    .string()
    .min(1, { error: INVENTORY_VI.issueCreateBranchRequired }),
  issueType: z.enum(["consumption"]),
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
  allowedIssueTypes = ["consumption", "writeoff"],
  defaultIssueType = "consumption",
  createHref,
  pageTitle,
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
  createHref?: string;
  pageTitle?: string;
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
  const [selectedRecordedOrder, setSelectedRecordedOrder] =
    useState<RecordedConsumptionRow | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [openActionRowId, setOpenActionRowId] = useState<number | null>(null);
  const controlSize = useFormControlSize("responsive");
  const compactActionSize = "sm";
  const createIssueDefaultValues = useMemo<CreateIssueValues>(
    () => ({
      branchId: defaultBranchId ? String(defaultBranchId) : "",
      issueType: defaultIssueType as CreateIssueValues["issueType"],
      notes: "",
    }),
    [defaultBranchId, defaultIssueType],
  );

  const allowedCreateIssueTypes = ISSUE_TYPES.filter(
    (option) =>
      allowedIssueTypes.includes(option.value) &&
      option.value !== "writeoff" &&
      (!allowedIssueTypes.includes("consumption") ||
        allowedIssueTypes.length === 1 ||
        option.value === "consumption"),
  );
  const isWriteoffScope =
    allowedIssueTypes.length === 1 && allowedIssueTypes[0] === "writeoff";
  const isHubScope =
    allowedIssueTypes.includes("consumption") &&
    allowedIssueTypes.includes("writeoff");
  const showsRecordedConsumption =
    showRecordedConsumptions && allowedIssueTypes.includes("consumption");
  const showsWasteTab = isHubScope || isWriteoffScope;
  const consumptionIssues = useMemo(
    () => issues.filter((issue) => issue.type === "consumption"),
    [issues],
  );
  const writeoffIssues = useMemo(
    () => issues.filter((issue) => issue.type === "writeoff"),
    [issues],
  );
  const activeView = searchParams.get("view");
  const resolvedView =
    activeView === "waste" && showsWasteTab
      ? "waste"
      : activeView === "manual"
        ? "manual"
        : activeView === "recorded" && showsRecordedConsumption
          ? "recorded"
          : showsRecordedConsumption
            ? "recorded"
            : showsWasteTab && isWriteoffScope
              ? "waste"
              : "manual";


  const issueDetailHref = (item: IssueRow) =>
    item.type === "writeoff"
      ? `/inventory/issues/${item.id}`
      : `${detailBasePath}/${item.id}`;

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

  const openRecordedOrderDetail = (item: RecordedConsumptionRow) => {
    setSelectedRecordedOrder(item);
  };

  const allowedTypeFilterOptions = TYPE_FILTER_OPTIONS.filter(
    (option) =>
      option.value === "all" || allowedIssueTypes.includes(option.value),
  );
  // Hub tabs already partition by type; hide the redundant type filter.
  const showTypeFilter = !isHubScope && allowedTypeFilterOptions.length > 2;
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

  const filteredConsumption = useMemo(() => {
    let result = consumptionIssues;
    if (activeStatus !== "all") {
      result = result.filter((i) => i.status === activeStatus);
    }
    if (showTypeFilter && activeType !== "all") {
      result = result.filter((i) => i.type === activeType);
    }
    const q = search.trim();
    if (q) {
      result = result.filter((i) => matchesSearch([i.code, i.branchName], q));
    }
    return result;
  }, [activeStatus, activeType, search, consumptionIssues, showTypeFilter]);

  const filteredWriteoff = useMemo(() => {
    let result = writeoffIssues;
    if (activeStatus !== "all") {
      result = result.filter((i) => i.status === activeStatus);
    }
    const q = search.trim();
    if (q) {
      result = result.filter((i) => matchesSearch([i.code, i.branchName], q));
    }
    return result;
  }, [activeStatus, search, writeoffIssues]);

  const filtered =
    resolvedView === "waste" ? filteredWriteoff : filteredConsumption;

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
    activeStatus !== "all" ||
    (showTypeFilter && activeType !== "all") ||
    search.trim().length > 0;
  const visibleRecordedConsumptions = useMemo(
    () => filterSaleConsumptionOrders(recordedConsumptions, recordedSearch),
    [recordedConsumptions, recordedSearch],
  );
  const visibleRecordedConsumptionTotal = visibleRecordedConsumptions.reduce(
    (sum, row) => sum + row.totalCostValue,
    0,
  );
  const visibleRecordedConsumptionRatio = recordedIsLimited
    ? INVENTORY_VI.rowRatioRecentOrders(
        visibleRecordedConsumptions.length,
        recordedConsumptions.length,
      )
    : INVENTORY_VI.rowRatioOrders(
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

    const filePrefix =
      resolvedView === "waste" || isWriteoffScope
        ? "phieu-hao-hut"
        : "phieu-tieu-hao-thu-cong";

    downloadCsv(toUtf8Base64(csv), `${filePrefix}-${stamp}.csv`);
    toast.success(INVENTORY_VI.issueExportSuccess(filtered.length));
  }

  function handleExportRecordedCsv() {
    if (visibleRecordedConsumptions.length === 0) {
      toast.error(INVENTORY_VI.recordedExportEmpty);
      return;
    }

    const flatRows = flattenSaleConsumptionOrdersForExport(
      visibleRecordedConsumptions,
    );
    const header = [
      INVENTORY_VI.recordedOrderLabel,
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
    const rows = flatRows.map(
      ({ orderNumber, recordedAtLabel, branchName, sourceLabel, line }) => [
        orderNumber,
        recordedAtLabel,
        line.ingredientName,
        branchName,
        line.locationName,
        line.quantityLabel,
        ...(canViewMonetary
          ? [line.unitCostLabel ?? "—", line.totalCostLabel ?? "—"]
          : []),
        sourceLabel,
      ],
    );
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
    toast.success(INVENTORY_VI.recordedExportSuccess(flatRows.length));
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

  const resolvedCreateHref =
    createHref && defaultBranchId
      ? `${createHref}?branchId=${defaultBranchId}`
      : createHref;

  const issueActions =
    resolvedView === "waste" && resolvedCreateHref ? (
      <Button
        size="lg"
        render={<Link href={resolvedCreateHref} />}
      >
        <IconPlus className="size-4" />
        {INVENTORY_VI.createWasteTitle}
      </Button>
    ) : resolvedView === "manual" && allowedCreateIssueTypes.length > 0 ? (
      <Button
        type="button"
        size="lg"
        onClick={() => setCreateOpen(true)}
      >
        <IconPlus className="size-4" />
        {INVENTORY_VI.manualConsumptionCreateAction}
      </Button>
    ) : null;

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
              className={inventoryListFilterSelectClassName}
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

          {showTypeFilter ? (
            <Select value={activeType} onValueChange={setActiveType}>
              <SelectTrigger
                size={controlSize}
                className={inventoryListFilterSelectClassName}
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
          ) : null}
        </>
      }
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
              className={inventoryListFilterSelectClassName}
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
            className={cn("bg-background", "w-52 shrink-0")}
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
            className={cn("bg-background", "w-52 shrink-0")}
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
            {item.recordedAtLabel}
          </span>
        ),
      },
      {
        key: "orderNumber",
        header: INVENTORY_VI.recordedOrderLabel,
        render: (item) => (
          <span className="font-mono font-medium">{item.orderNumber}</span>
        ),
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
        key: "ingredientCount",
        header: INVENTORY_VI.recordedIngredientLinesLabel,
        render: (item) => INVENTORY_VI.ingredientCountBadge(item.ingredientCount),
      },
      ...(canViewMonetary
        ? [
            {
              key: "totalCost",
              header: FORM_VI.amount,
              className: "text-right",
              render: (item: RecordedConsumptionRow) => (
                <span className="font-mono font-medium tabular-nums">
                  {item.totalCostLabel ?? "—"}
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
    <InteractiveCard
      minHeight="tap"
      padding="compact"
      className="cursor-pointer"
      role="button"
      tabIndex={0}
      onClick={() => openRecordedOrderDetail(item)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openRecordedOrderDetail(item);
        }
      }}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex min-w-0 items-center justify-between gap-2">
          <span className="truncate font-mono text-sm font-semibold">
            {item.orderNumber}
          </span>
          {canViewMonetary ? (
            <span className="shrink-0 font-mono text-sm font-semibold">
              {item.totalCostLabel ?? "—"}
            </span>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">
          {item.branchName} · {item.locationName}
        </p>
        <p className="text-xs text-muted-foreground">
          {INVENTORY_VI.ingredientCountBadge(item.ingredientCount)} ·{" "}
          {item.recordedAtLabel}
        </p>
        <p className="text-xs text-muted-foreground">{item.sourceLabel}</p>
      </div>
    </InteractiveCard>
  );

  // Tab structure: recorded (POS ledger), manual consumption slips, and
  // writeoff/hao hụt. Each tab owns filters + one primary create action.
  const showsManualTab = !isWriteoffScope;
  const tabDefaultValue = showsRecordedConsumption
    ? "recorded"
    : showsManualTab
      ? "manual"
      : "waste";
  const tabsItems = [
    ...(showsRecordedConsumption
      ? [
          {
            value: "recorded",
            label: INVENTORY_VI.consumptionTabRecorded,
            count: recordedConsumptions.length,
          },
        ]
      : []),
    ...(showsManualTab
      ? [
          {
            value: "manual",
            label: INVENTORY_VI.consumptionTabManual,
            count: consumptionIssues.length,
          },
        ]
      : []),
    ...(showsWasteTab
      ? [
          {
            value: "waste",
            label: INVENTORY_VI.consumptionTabWaste,
            count: writeoffIssues.length,
          },
        ]
      : []),
  ];

  const content = (
    <>
      <AppPageHeader
        title={pageTitle ?? tNav("consumption", "navigation")}
        actions={issueActions}
      />

      <AppPageTabs
        items={tabsItems}
        defaultValue={tabDefaultValue}
        paramKey="view"
        ariaLabel={pageTitle ?? tNav("consumption", "navigation")}
        queryKeysByValue={{
          recorded: ["branchId", "startDate", "endDate"],
          manual: [],
          waste: [],
        }}
      >
        {showsRecordedConsumption ? (
          <TabsContent value="recorded" className="mt-0">
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
              toolbar={recordedConsumptionFilterBar}
            >
              <DataTable
                columns={recordedConsumptionColumns}
                data={visibleRecordedConsumptions}
                pageSize={50}
                getRowKey={(item) => item.orderId}
                onRowClick={openRecordedOrderDetail}
                emptyTitle={INVENTORY_VI.recordedEmptyTitle}
                emptyDescription={INVENTORY_VI.recordedEmptyDescription}
                emptyMode="no-data"
                mobileCardRender={renderRecordedConsumptionCard}
              />
            </AppListFrame>
          </TabsContent>
        ) : null}

        {showsManualTab ? (
          <TabsContent value="manual" className="mt-0">
            <AppListFrame
              title={INVENTORY_VI.manualConsumptionSlipsTitle}
              headerHint={INVENTORY_VI.rowRatio(
                filteredConsumption.length,
                consumptionIssues.length,
              )}
              action={
                showExportAction ? (
                  <Button
                    type="button"
                    variant="outline"
                    size={compactActionSize}
                    onClick={handleExportIssuesCsv}
                  >
                    <IconFileDownload className="size-4" />
                    {INVENTORY_VI.exportReportAction}
                  </Button>
                ) : null
              }
              toolbar={filterBar}
            >
              <DataTable
                columns={issueColumns}
                data={filteredConsumption}
                pageSize={50}
                getRowKey={(item) => item.id}
                emptyTitle={
                  hasActiveFilters
                    ? INVENTORY_VI.issueEmptyFiltered
                    : INVENTORY_VI.manualConsumptionEmptyTitle
                }
                emptyDescription={
                  INVENTORY_VI.manualConsumptionEmptyDescription
                }
                emptyMode={hasActiveFilters ? "no-results" : "no-data"}
                onRowClick={openIssueDetail}
                getRowDataState={(item) =>
                  openActionRowId === item.id ? "selected" : undefined
                }
                renderRowContextMenu={(item) => (
                  <RowActionsContextMenuItems
                    items={getIssueRowActions(item)}
                  />
                )}
                mobileCardRender={renderIssueCard}
              />
            </AppListFrame>
          </TabsContent>
        ) : null}

        {showsWasteTab ? (
          <TabsContent value="waste" className="mt-0">
            <AppListFrame
              title={INVENTORY_VI.writeoffSlipsTitle}
              headerHint={INVENTORY_VI.rowRatio(
                filteredWriteoff.length,
                writeoffIssues.length,
              )}
              action={
                showExportAction ? (
                  <Button
                    type="button"
                    variant="outline"
                    size={compactActionSize}
                    onClick={handleExportIssuesCsv}
                  >
                    <IconFileDownload className="size-4" />
                    {INVENTORY_VI.exportReportAction}
                  </Button>
                ) : null
              }
              toolbar={filterBar}
            >
              <DataTable
                columns={issueColumns}
                data={filteredWriteoff}
                pageSize={50}
                getRowKey={(item) => item.id}
                emptyTitle={
                  hasActiveFilters
                    ? INVENTORY_VI.issueEmptyFiltered
                    : INVENTORY_VI.writeoffEmptyTitle
                }
                emptyDescription={INVENTORY_VI.writeoffEmptyDescription}
                emptyMode={hasActiveFilters ? "no-results" : "no-data"}
                onRowClick={openIssueDetail}
                getRowDataState={(item) =>
                  openActionRowId === item.id ? "selected" : undefined
                }
                renderRowContextMenu={(item) => (
                  <RowActionsContextMenuItems
                    items={getIssueRowActions(item)}
                  />
                )}
                mobileCardRender={renderIssueCard}
              />
            </AppListFrame>
          </TabsContent>
        ) : null}
      </AppPageTabs>

      <Sheet
        open={selectedRecordedOrder != null}
        onOpenChange={(open) => {
          if (!open) setSelectedRecordedOrder(null);
        }}
      >
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
          {selectedRecordedOrder ? (
            <>
              <SheetHeader>
                <SheetTitle>
                  {INVENTORY_VI.recordedOrderDetailTitle(
                    selectedRecordedOrder.orderNumber,
                  )}
                </SheetTitle>
                <p className="text-sm text-muted-foreground">
                  {selectedRecordedOrder.recordedAtLabel} ·{" "}
                  {selectedRecordedOrder.branchName}
                </p>
              </SheetHeader>
              <div className="flex flex-col gap-3 px-4 pb-4">
                <ItemGroup className="flex flex-col gap-2">
                  {selectedRecordedOrder.lines.map((line) => (
                    <Item key={line.id} variant="outline" size="sm">
                      <ItemContent className="min-w-0 gap-1">
                        <ItemTitle>{line.ingredientName}</ItemTitle>
                        <ItemDescription className="line-clamp-none">
                          {line.quantityLabel} · {line.locationName}
                        </ItemDescription>
                        {canViewMonetary ? (
                          <p className="font-mono text-sm tabular-nums">
                            {line.unitCostLabel
                              ? `${line.unitCostLabel} · `
                              : ""}
                            {line.totalCostLabel ?? "—"}
                          </p>
                        ) : null}
                      </ItemContent>
                    </Item>
                  ))}
                </ItemGroup>
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>

      <FormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title={INVENTORY_VI.manualConsumptionCreateAction}
        description={INVENTORY_VI.manualConsumptionCreateDescription}
        schema={createIssueSchema}
        defaultValues={createIssueDefaultValues}
        entityKey={defaultBranchId ?? "new-issue"}
        onSubmit={handleCreate}
        successMessage={INVENTORY_VI.issueCreated}
        submitLabel={INVENTORY_VI.manualConsumptionCreateAction}
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

  return (
    <AppPage width="xwide" density="compact">
      {content}
    </AppPage>
  );
}
