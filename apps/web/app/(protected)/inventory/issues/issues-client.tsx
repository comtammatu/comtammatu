"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRightToLine as IconArrowBarRight,
  FileDown as IconFileDownload,
  Plus as IconPlus,
} from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { toast } from "@comtammatu/ui/components/sonner";
import { downloadCsv } from "@/_lib/download-file";
import { matchesSearch } from "@lib/search";
import {
  filterSaleConsumptionOrders,
  flattenSaleConsumptionOrdersForExport,
} from "@lib/inventory/recorded-sale-consumption-model";
import { useFormControlSize } from "@/components/form/control-size";
import {
  AppListFrame,
  AppPage,
  AppPageHeader,
} from "@/components/surface";
import { AppPageTabs, TabsContent } from "@/components/app-page-tabs";
import { DataTable } from "@/components/data-table/data-table";
import {
  RowActionsContextMenuItems,
  type RowActionItem,
} from "@/components/row-actions-menu";
import { formatVND } from "@lib/inventory/format";
import { tNav } from "../_lib/dictionary";
import { createStockIssueDraft } from "../issue-actions";
import {
  ACTIONS_VI,
  BRANCH_VI,
  FORM_VI,
  INVENTORY_VI,
  PRODUCT_VI,
} from "@comtammatu/shared/messages";
import { messages } from "@lib/messages";
import { IssueCreateDialog } from "./issue-create-dialog";
import {
  buildIssuesExportCsv,
  buildListHref,
  buildRecordedExportCsv,
  exportCsvStamp,
  ISSUE_TYPES,
  patchListFilterParams,
  readListFilterParams,
  toUtf8Base64,
  TYPE_FILTER_OPTIONS,
  type CreateIssueValues,
} from "./issue-list-helpers";
import {
  buildIssueColumns,
  buildRecordedConsumptionColumns,
  IssueListFilterBar,
  IssueRowCard,
  RecordedConsumptionCard,
  RecordedConsumptionFilterBar,
} from "./issue-list-chrome";
import type {
  IssueBranchOption,
  IssueRow,
  RecordedConsumptionRow,
} from "./issue-list-types";
import {
  RecordedConsumptionSheet,
  useRecordedConsumptionOverlay,
} from "./recorded-consumption-sheet";

export type { IssueBranchOption, IssueRow, RecordedConsumptionRow } from "./issue-list-types";

export function IssuesClient({
  issues,
  recordedConsumptions,
  showRecordedConsumptions = true,
  canViewMonetary,
  branches,
  defaultBranchId,
  writeRequiresSitePick = false,
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
  /** When true, create CTAs must not invent a default site under scope=all. */
  writeRequiresSitePick?: boolean;
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
  const initialFilters = readListFilterParams(searchParams);
  const [activeStatus, setActiveStatus] = useState(initialFilters.status);
  const [activeType, setActiveType] = useState(initialFilters.type);
  const [search, setSearch] = useState(initialFilters.q);
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
  const recordedOverlay = useRecordedConsumptionOverlay();
  const controlSize = useFormControlSize("responsive");
  const compactActionSize = "sm";

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
    recordedOverlay.patchOverlay({ recordedOrderId: item.orderId }, "push");
  };

  const pushListFilters = useCallback(
    (patch: { status?: string; type?: string; q?: string }) => {
      const next = patchListFilterParams(searchParams, patch);
      router.push(buildListHref(listBasePath, next), { scroll: false });
    },
    [listBasePath, router, searchParams],
  );

  const allowedTypeFilterOptions = TYPE_FILTER_OPTIONS.filter(
    (option) =>
      option.value === "all" || allowedIssueTypes.includes(option.value),
  );
  const showTypeFilter = !isHubScope && allowedTypeFilterOptions.length > 2;
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
    const next = readListFilterParams(searchParams);
    setActiveStatus(next.status);
    setActiveType(next.type);
    setSearch(next.q);
  }, [searchParams]);

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
  const visibleRecordedConsumptionHint = (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
      <span>
        {recordedIsLimited
          ? INVENTORY_VI.rowRatioRecentOrders(
              visibleRecordedConsumptions.length,
              recordedConsumptions.length,
            )
          : INVENTORY_VI.rowRatioOrders(
              visibleRecordedConsumptions.length,
              recordedConsumptions.length,
            )}
      </span>
      {canViewMonetary ? (
        <span>
          {INVENTORY_VI.totalAmountLabel}:{" "}
          <span className="font-mono font-semibold text-foreground">
            {formatVND(visibleRecordedConsumptionTotal)}
          </span>
        </span>
      ) : null}
    </span>
  );

  function handleExportIssuesCsv() {
    if (filtered.length === 0) {
      toast.error(INVENTORY_VI.issueExportEmpty);
      return;
    }

    const body = buildIssuesExportCsv(filtered, {
      issueCode: INVENTORY_VI.issueCode,
      issueTypeLabel: INVENTORY_VI.issueTypeLabel,
      branchLong: BRANCH_VI.long,
      createdDate: INVENTORY_VI.createdDate,
      status: FORM_VI.status,
    });
    const filePrefix =
      resolvedView === "waste" || isWriteoffScope
        ? "phieu-hao-hut"
        : "phieu-tieu-hao-thu-cong";

    downloadCsv(
      toUtf8Base64(`\uFEFF${body}`),
      `${filePrefix}-${exportCsvStamp()}.csv`,
    );
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
    const body = buildRecordedExportCsv(flatRows, header);

    downloadCsv(
      toUtf8Base64(`\uFEFF${body}`),
      `tieu-hao-da-ghi-nhan-${exportCsvStamp()}.csv`,
    );
    toast.success(INVENTORY_VI.recordedExportSuccess(flatRows.length));
  }

  function applyRecordedDateFilter() {
    const next = new URLSearchParams(searchParams.toString());
    if (recordedStartDate) next.set("startDate", recordedStartDate);
    else next.delete("startDate");
    if (recordedEndDate) next.set("endDate", recordedEndDate);
    else next.delete("endDate");
    if (selectedRecordedBranchId && selectedRecordedBranchId !== "all") {
      next.set("branch", selectedRecordedBranchId);
      next.delete("branchId");
    } else {
      next.delete("branch");
      next.delete("branchId");
    }
    router.push(buildListHref(listBasePath, next));
  }

  function clearRecordedDateFilter() {
    const next = new URLSearchParams(searchParams.toString());
    next.delete("startDate");
    next.delete("endDate");
    next.delete("branch");
    next.delete("branchId");
    setRecordedStartDate("");
    setRecordedEndDate("");
    setRecordedBranchId("all");
    router.push(buildListHref(listBasePath, next));
  }

  const resolvedCreateHref =
    createHref && defaultBranchId != null
      ? `${createHref}?branch=${defaultBranchId}`
      : writeRequiresSitePick
        ? undefined
        : createHref;

  const issueActions =
    resolvedView === "waste" && resolvedCreateHref ? (
      <Button size="lg" render={<Link href={resolvedCreateHref} />}>
        <IconPlus className="size-4" />
        {INVENTORY_VI.createWasteTitle}
      </Button>
    ) : resolvedView === "waste" && writeRequiresSitePick ? (
      <Button size="lg" type="button" disabled title={messages.controlSurface.scopeControl.pickSite}>
        <IconPlus className="size-4" />
        {INVENTORY_VI.createWasteTitle}
      </Button>
    ) : resolvedView === "manual" &&
      allowedCreateIssueTypes.length > 0 &&
      !writeRequiresSitePick ? (
      <Button type="button" size="lg" onClick={() => setCreateOpen(true)}>
        <IconPlus className="size-4" />
        {INVENTORY_VI.manualConsumptionCreateAction}
      </Button>
    ) : resolvedView === "manual" &&
      allowedCreateIssueTypes.length > 0 &&
      writeRequiresSitePick ? (
      <Button
        type="button"
        size="lg"
        disabled
        title={messages.controlSurface.scopeControl.pickSite}
      >
        <IconPlus className="size-4" />
        {INVENTORY_VI.manualConsumptionCreateAction}
      </Button>
    ) : null;

  const recordedBranchSelectItems = [
    ...(canSelectAllRecordedBranches
      ? [{ value: "all", label: BRANCH_VI.selectAll }]
      : []),
    ...visibleRecordedBranchOptions.map((branch) => ({
      value: String(branch.id),
      label: branch.name,
    })),
  ];

  const issueColumns = useMemo(
    () =>
      buildIssueColumns({
        detailBasePath,
        getIssueRowActions,
        openActionRowId,
        setOpenActionRowId,
      }),
    [detailBasePath, openActionRowId],
  );

  const recordedConsumptionColumns = useMemo(
    () => buildRecordedConsumptionColumns(canViewMonetary),
    [canViewMonetary],
  );

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

  const issueListFrameProps = (
    data: IssueRow[],
    total: number,
    emptyTitle: string,
    emptyDescription: string,
    title: string,
  ) => ({
    title,
    headerHint: INVENTORY_VI.rowRatio(data.length, total),
    action: (
      <Button
        type="button"
        variant="outline"
        size={compactActionSize}
        onClick={handleExportIssuesCsv}
      >
        <IconFileDownload className="size-4" />
        {INVENTORY_VI.exportReportAction}
      </Button>
    ),
    toolbar: (
      <IssueListFilterBar
        controlSize={controlSize}
        search={search}
        activeStatus={activeStatus}
        activeType={activeType}
        showTypeFilter={showTypeFilter}
        allowedTypeFilterOptions={allowedTypeFilterOptions}
        hasActiveFilters={hasActiveFilters}
        onSearchChange={setSearch}
        onSearchApply={() =>
          pushListFilters({ status: activeStatus, type: activeType, q: search })
        }
        onStatusChange={(value) => {
          setActiveStatus(value);
          pushListFilters({ status: value, type: activeType, q: search });
        }}
        onTypeChange={(value) => {
          setActiveType(value);
          pushListFilters({ status: activeStatus, type: value, q: search });
        }}
        onClearFilters={() => {
          setActiveStatus("all");
          setActiveType("all");
          setSearch("");
          pushListFilters({ status: "all", type: "all", q: "" });
        }}
      />
    ),
    children: (
      <DataTable
        columns={issueColumns}
        data={data}
        pageSize={50}
        getRowKey={(item) => item.id}
        emptyTitle={hasActiveFilters ? INVENTORY_VI.issueEmptyFiltered : emptyTitle}
        emptyDescription={emptyDescription}
        emptyMode={hasActiveFilters ? "no-results" : "no-data"}
        onRowClick={openIssueDetail}
        getRowDataState={(item) =>
          openActionRowId === item.id ? "selected" : undefined
        }
        renderRowContextMenu={(item) => (
          <RowActionsContextMenuItems items={getIssueRowActions(item)} />
        )}
        mobileCardRender={(item) => (
          <IssueRowCard
            item={item}
            actions={getIssueRowActions(item)}
            onOpen={openIssueDetail}
          />
        )}
      />
    ),
  });

  return (
    <AppPage width="xwide" density="compact">
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
          recorded: [
            "branch",
            "branchId",
            "startDate",
            "endDate",
            "recordedOrderId",
          ],
          manual: ["branch", "branchId", "status", "type", "q"],
          waste: ["branch", "branchId", "status", "type", "q"],
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
              toolbar={
                <RecordedConsumptionFilterBar
                  controlSize={controlSize}
                  recordedSearch={recordedSearch}
                  selectedRecordedBranchId={selectedRecordedBranchId}
                  recordedBranchSelectItems={recordedBranchSelectItems}
                  recordedStartDate={recordedStartDate}
                  recordedEndDate={recordedEndDate}
                  hasRecordedServerFilter={hasRecordedServerFilter}
                  onRecordedSearchChange={setRecordedSearch}
                  onRecordedBranchChange={setRecordedBranchId}
                  onRecordedStartDateChange={setRecordedStartDate}
                  onRecordedEndDateChange={setRecordedEndDate}
                  onApplyFilter={applyRecordedDateFilter}
                  onClearFilter={clearRecordedDateFilter}
                />
              }
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
                mobileCardRender={(item) => (
                  <RecordedConsumptionCard
                    item={item}
                    canViewMonetary={canViewMonetary}
                    onOpen={openRecordedOrderDetail}
                  />
                )}
              />
            </AppListFrame>
          </TabsContent>
        ) : null}

        {showsManualTab ? (
          <TabsContent value="manual" className="mt-0">
            <AppListFrame
              {...issueListFrameProps(
                filteredConsumption,
                consumptionIssues.length,
                INVENTORY_VI.manualConsumptionEmptyTitle,
                INVENTORY_VI.manualConsumptionEmptyDescription,
                INVENTORY_VI.manualConsumptionSlipsTitle,
              )}
            />
          </TabsContent>
        ) : null}

        {showsWasteTab ? (
          <TabsContent value="waste" className="mt-0">
            <AppListFrame
              {...issueListFrameProps(
                filteredWriteoff,
                writeoffIssues.length,
                INVENTORY_VI.writeoffEmptyTitle,
                INVENTORY_VI.writeoffEmptyDescription,
                INVENTORY_VI.writeoffSlipsTitle,
              )}
            />
          </TabsContent>
        ) : null}
      </AppPageTabs>

      <RecordedConsumptionSheet
        orders={recordedConsumptions}
        canViewMonetary={canViewMonetary}
      />

      <IssueCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        branches={branches}
        defaultBranchId={defaultBranchId}
        defaultIssueType={defaultIssueType}
        onSubmit={handleCreate}
        allowedCreateIssueTypes={allowedCreateIssueTypes}
      />
    </AppPage>
  );
}
