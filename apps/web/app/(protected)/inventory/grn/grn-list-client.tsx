"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ExternalLink as IconExternalLink,
  FileText as IconFileText,
  FilterX as IconFilterX,
  Receipt as IconReceipt,
  Search as IconSearch,
  Trash as IconTrash,
} from "lucide-react";
import { formatVNDate, formatVNDateTime } from "@comtammatu/shared/time";
import { ACTIONS_VI, FORM_VI } from "@comtammatu/shared/messages";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@comtammatu/ui/components/input-group";
import { InteractiveCard } from "@comtammatu/ui/components/interactive-card";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@comtammatu/ui/components/tabs";
import { toast } from "@comtammatu/ui/components/sonner";
import { ReasonConfirmDialog } from "@/components/reason-confirm-dialog";
import { BusinessDatePicker } from "@/components/form";
import {
  AppEmptyState,
  AppListFrame,
  AppPage,
  AppPageHeader,
  AppToolbar,
} from "@/components/surface";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import {
  RowActionsContextMenuItems,
  RowActionsMenu,
  type RowActionItem,
} from "@/components/row-actions-menu";
import { StatusBadge } from "@/components/status-badge";
import { useDocumentOverlayUrl } from "@lib/navigation/use-document-overlay-url";
import { messages } from "@lib/messages";
import { discardGrnDraft } from "../grn-actions";
import {
  hasGrnListFilters,
  supplierInvoiceHrefForGrn,
  type GrnListFilters,
  type GrnListRow,
} from "@lib/inventory/grn-list-model";
import { resolveGrnValuationDisplay } from "@lib/inventory/valuation-display";
import {
  OWNER_UNPRICED_GRN_STATUS,
  confirmedGrnUnitCostTargetFromQueue,
  filterUnpricedConfirmedGrnLines,
  type ConfirmedGrnUnitCostTarget,
  type UnpricedConfirmedGrnLine,
} from "@lib/inventory/grn-unpriced-queue-model";
import dynamic from "next/dynamic";
import { GrnUnpricedQueueTable } from "./grn-unpriced-queue";

const ConfirmedGrnUnitCostDialog = dynamic(
  () =>
    import("./[id]/views/confirmed-grn-unit-cost-dialog").then(
      (mod) => mod.ConfirmedGrnUnitCostDialog,
    ),
  { ssr: false },
);

import {
  OWNER_SHELL_BREAKPOINT,
  useIsMobile,
} from "@comtammatu/ui/hooks/use-mobile";
const statusLabels: Record<string, string> = {
  draft: "Chờ nhập hàng",
  confirmed: "Đã nhập kho",
  cancelled: "Đã hủy",
};

const grnCopy = messages.inventory.grn;
const valuationCopy = messages.inventory.valuationDisplay;
const multiSupplierBadge = messages.inventory.po.multiSupplierBadge;

function GrnSupplierLabel({ name }: { name: string }) {
  if (name === multiSupplierBadge) {
    return <Badge variant="secondary">{name}</Badge>;
  }
  return name;
}
const GRN_OVERLAY_KEYS = ["grnId", "mode"] as const;

export type { GrnListRow } from "@lib/inventory/grn-list-model";

export function GrnListClient({
  rows,
  total,
  page,
  pageSize,
  filters,
  basePath = "/inventory/grn",
  canManageSupplierInvoice,
  canPatchConfirmedUnitCost = false,
  unpricedLines = [],
  unpricedTotal = 0,
  loadFailed,
}: {
  rows: GrnListRow[];
  total: number;
  page: number;
  pageSize: number;
  filters: GrnListFilters;
  basePath?: string;
  canManageSupplierInvoice: boolean;
  canPatchConfirmedUnitCost?: boolean;
  unpricedLines?: UnpricedConfirmedGrnLine[];
  unpricedTotal?: number;
  loadFailed: boolean;
}) {
  const router = useRouter();
  const overlay = useDocumentOverlayUrl(GRN_OVERLAY_KEYS);
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState(filters.query);
  const [dateFrom, setDateFrom] = useState(filters.dateFrom);
  const [dateTo, setDateTo] = useState(filters.dateTo);
  const [openActionRowId, setOpenActionRowId] = useState<number | null>(null);
  const [cancelRow, setCancelRow] = useState<GrnListRow | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [unitCostTarget, setUnitCostTarget] =
    useState<ConfirmedGrnUnitCostTarget | null>(null);
  const isUnpricedQueue = filters.status === OWNER_UNPRICED_GRN_STATUS;
  const visibleUnpricedLines = useMemo(
    () => filterUnpricedConfirmedGrnLines(unpricedLines, query),
    [query, unpricedLines],
  );

  useEffect(() => {
    setQuery(filters.query);
    setDateFrom(filters.dateFrom);
    setDateTo(filters.dateTo);
  }, [filters.dateFrom, filters.dateTo, filters.query]);

  const dateRangeScopeLabel =
    filters.status === "draft" ? grnCopy.expectedDate : grnCopy.receivedDate;

  const listHref = useCallback(
    (next: Record<string, string | null>) => {
      const params = new URLSearchParams();
      const values = {
        q: filters.query.trim() || null,
        status: filters.status,
        dateFrom: filters.dateFrom || null,
        dateTo: filters.dateTo || null,
        supplierId: filters.supplierId?.toString() ?? null,
        poId: filters.poId?.toString() ?? null,
        branchId: filters.branchId?.toString() ?? null,
        page: String(page),
        ...next,
      };
      for (const [key, value] of Object.entries(values)) {
        if (value) params.set(key, value);
      }
      return `${basePath}?${params.toString()}`;
    },
    [basePath, filters, page],
  );

  const navigate = useCallback(
    (next: Record<string, string | null>) => {
      startTransition(() =>
        router.push(listHref(next), {
          scroll: false,
        }),
      );
    },
    [listHref, router],
  );

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed === filters.query.trim()) return;
    const timer = window.setTimeout(() => {
      navigate({ q: trimmed || null, page: null });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [filters.query, navigate, query]);

  function clearFilters() {
    setQuery("");
    setDateFrom("");
    setDateTo("");
    navigate({
      q: null,
      dateFrom: null,
      dateTo: null,
      dateField: null,
      supplierId: null,
      poId: null,
      page: null,
    });
  }

  const pageMetrics = useMemo(() => {
    let exceptionCount = 0;
    let pendingInvoiceCount = 0;
    for (const row of rows) {
      if (
        row.shortageLineCount + row.excessLineCount + row.rejectedLineCount >
        0
      ) {
        exceptionCount += 1;
      }
      if (
        resolveGrnValuationDisplay({
          status: row.status,
          invoiceId: row.invoiceId,
        }) === "pending_invoice"
      ) {
        pendingInvoiceCount += 1;
      }
    }
    return { exceptionCount, pendingInvoiceCount };
  }, [rows]);

  function openDetail(row: GrnListRow, method: "push" | "replace" = "push") {
    overlay.patchOverlay(
      {
        grnId: row.id,
        mode: "view",
      },
      method,
    );
  }

  function rowActions(row: GrnListRow): RowActionItem[] {
    const actions: RowActionItem[] = [
      {
        key: "detail",
        label:
          row.status === "draft"
            ? "Tiếp tục nhập hàng"
            : ACTIONS_VI.viewDetails,
        icon: <IconExternalLink />,
        onSelect: () => openDetail(row),
      },
      {
        key: "purchase-order",
        label: "Xem đơn đặt hàng",
        icon: <IconFileText />,
        href: `/inventory/purchase-orders?tab=orders&poId=${row.poId}&mode=view`,
      },
    ];
    if (row.status === "confirmed" && canManageSupplierInvoice) {
      actions.push({
        key: "invoice",
        label: row.invoiceId ? "Xem hóa đơn" : "Ghi nhận hóa đơn",
        icon: <IconReceipt />,
        href: supplierInvoiceHrefForGrn({
          grnId: row.id,
          invoiceId: row.invoiceId,
        }),
      });
    }
    if (row.status === "draft") {
      actions.push({
        key: "cancel",
        label: "Hủy phiếu",
        icon: <IconTrash />,
        destructive: true,
        separatorBefore: true,
        onSelect: () => {
          setCancelRow(row);
          setCancelReason("");
        },
      });
    }
    return actions;
  }

  async function cancelDraft() {
    if (!cancelRow || cancelReason.trim().length < 5) return;
    const result = await discardGrnDraft({
      grnId: cancelRow.id,
      reason: cancelReason,
    });
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    setCancelRow(null);
    toast.success("Đã hủy phiếu nhập.");
    router.refresh();
  }

  const columns: DataTableColumn<GrnListRow>[] = [
    {
      key: "code",
      header: "Phiếu nhập",
      sortable: true,
      sortValue: (row) => row.code,
      render: (row) => (
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="link"
              className="h-auto p-0 font-mono font-medium"
              onClick={() => openDetail(row)}
            >
              {row.code}
            </Button>
            <StatusBadge
              domain="inventory"
              value={row.status}
              label={statusLabels[row.status] ?? grnCopy.unknownStatus}
            />
            {row.invoiceId ? (
              <Badge variant="outline" className="text-success text-2xs font-normal">
                {valuationCopy.hasInvoice}
              </Badge>
            ) : canManageSupplierInvoice &&
              resolveGrnValuationDisplay({
                status: row.status,
                invoiceId: row.invoiceId,
              }) === "pending_invoice" ? (
              <Badge variant="warning" className="text-2xs font-normal">
                {valuationCopy.pendingInvoice}
              </Badge>
            ) : null}
          </div>
          <div className="font-mono text-xs text-muted-foreground">
            {row.poCode}
          </div>
        </div>
      ),
    },
    {
      key: "supplier",
      header: "Nhà cung cấp",
      sortable: true,
      sortValue: (row) => row.supplierName ?? "",
      render: (row) => <GrnSupplierLabel name={row.supplierName} />,
    },
    {
      key: "site",
      header: "Kho nhận",
      sortable: true,
      sortValue: (row) => row.receivingSiteName ?? "",
      render: (row) => row.receivingSiteName,
    },
    {
      key: "date",
      header: "Ngày",
      sortable: true,
      sortValue: (row) =>
        row.status === "confirmed"
          ? row.receivedDate ?? ""
          : row.expectedReceiveDate ?? "",
      render: (row) => {
        const date =
          row.status === "confirmed"
            ? row.receivedDate
            : row.expectedReceiveDate;
        return date ? formatVNDate(date) : "—";
      },
    },
    {
      key: "result",
      header: "Kết quả",
      render: (row) => (
        <div className="flex flex-col gap-1">
          <div>
            {grnCopy.lineProgress(row.completedLineCount, row.lineCount)}
          </div>
          <ExceptionBadges row={row} />
        </div>
      ),
    },
    {
      key: "updated",
      header: "Cập nhật",
      sortable: true,
      sortValue: (row) => row.updatedAt ?? "",
      render: (row) => (
        <span className="font-mono tabular-nums text-muted-foreground">
          {formatVNDateTime(row.updatedAt)}
        </span>
      ),
    },
    {
      key: "actions",
      header: <span className="sr-only">{FORM_VI.action}</span>,
      className: "w-10 text-right",
      render: (row) => (
        <div
          className="flex justify-end"
          onClick={(event) => event.stopPropagation()}
        >
          <RowActionsMenu
            items={rowActions(row)}
            label={`${FORM_VI.action} ${row.code}`}
            triggerSize="icon-sm"
            open={openActionRowId === row.id}
            onOpenChange={(open) => setOpenActionRowId(open ? row.id : null)}
          />
        </div>
      ),
    },
  ];

  const toolbar = (
    <AppToolbar
      variant="inline"
      search={
        <InputGroup size="field" className="min-w-64 flex-1">
          <InputGroupAddon>
            <IconSearch />
          </InputGroupAddon>
          <InputGroupInput
            type="search"
            aria-label={grnCopy.listSearchAria}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={
              isUnpricedQueue
                ? grnCopy.confirmedUnitCost.searchPlaceholder
                : grnCopy.listSearchPlaceholder
            }
          />
        </InputGroup>
      }
      filters={
        isUnpricedQueue ? undefined : (
        <>
          <BusinessDatePicker
            aria-label={`${dateRangeScopeLabel} · ${grnCopy.dateFrom}`}
            value={dateFrom}
            onValueChange={(value) => {
              setDateFrom(value);
              navigate({ dateFrom: value || null, page: null });
            }}
            className="w-36"
          />
          <BusinessDatePicker
            aria-label={`${dateRangeScopeLabel} · ${grnCopy.dateTo}`}
            value={dateTo}
            onValueChange={(value) => {
              setDateTo(value);
              navigate({ dateTo: value || null, page: null });
            }}
            className="w-36"
          />
        </>
        )
      }
      reset={
        hasGrnListFilters(filters) ? (
          <Button
            type="button"
            variant="ghost"
            size="field"
            disabled={pending}
            onClick={clearFilters}
          >
            <IconFilterX className="mr-1 size-4" />
            {grnCopy.clearFilters}
          </Button>
        ) : null
      }
    />
  );

  const statusTabs = (
    <Tabs
      value={filters.status}
      onValueChange={(value) =>
        navigate({
          status: value,
          page: null,
          dateField: null,
        })
      }
    >
      <TabsList aria-label={grnCopy.statusTabsAria}>
        <TabsTrigger value="draft">{statusLabels.draft}</TabsTrigger>
        <TabsTrigger value="confirmed">{statusLabels.confirmed}</TabsTrigger>
        {canPatchConfirmedUnitCost ? (
          <TabsTrigger value={OWNER_UNPRICED_GRN_STATUS}>
            {grnCopy.confirmedUnitCost.tab}
            {unpricedTotal > 0 ? ` (${unpricedTotal})` : ""}
          </TabsTrigger>
        ) : null}
        <TabsTrigger value="cancelled">{statusLabels.cancelled}</TabsTrigger>
        <TabsTrigger value="all">{grnCopy.allStatuses}</TabsTrigger>
      </TabsList>
    </Tabs>
  );

  const table = isUnpricedQueue ? (
    <GrnUnpricedQueueTable
      rows={visibleUnpricedLines}
      loadFailed={loadFailed}
      onRetry={() => router.refresh()}
      onOpenGrn={(grnId) =>
        overlay.patchOverlay({ grnId, mode: "view" }, "push")
      }
      onConfirmLine={(row) =>
        setUnitCostTarget(confirmedGrnUnitCostTargetFromQueue(row))
      }
    />
  ) : loadFailed ? (
    <AppEmptyState
      compact
      mode="error"
      icon={<IconReceipt />}
      title={grnCopy.listLoadFailed}
    >
      <Button type="button" size="sm" onClick={() => router.refresh()}>
        {ACTIONS_VI.retry}
      </Button>
    </AppEmptyState>
  ) : (
    <DataTable
      columns={columns}
      data={rows}
      getRowKey={(row) => row.id}
      pageSize={pageSize}
      totalCount={total}
      currentPage={page}
      onPageChange={(nextPage) => navigate({ page: String(nextPage) })}
      emptyTitle={
        hasGrnListFilters(filters)
          ? grnCopy.emptyFiltered
          : filters.status === "draft"
            ? grnCopy.emptyWaiting
            : grnCopy.empty
      }
      emptyDescription={
        filters.status === "draft" ? grnCopy.emptyWaitingDescription : undefined
      }
      emptyMode={hasGrnListFilters(filters) ? "no-results" : "no-data"}
      emptyIcon={<IconReceipt />}
      rowClassName={(row) =>
        row.status === "cancelled" ? "opacity-60" : undefined
      }
      onRowClick={(row) => openDetail(row)}
      renderRowContextMenu={(row) => (
        <RowActionsContextMenuItems items={rowActions(row)} />
      )}
      mobileCardRender={(row) => (
        <GrnMobileCard
          row={row}
          actions={rowActions(row)}
          showInvoiceChrome={canManageSupplierInvoice}
          onOpen={() => openDetail(row)}
        />
      )}
    />
  );

  return (
    <>
      <AppPage width="xwide" density="compact">
        <AppPageHeader
          title={grnCopy.listTitle}
          tabs={statusTabs}
          meta={
            loadFailed ? undefined : (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="inline-flex items-center gap-1.5">
                  <span>{grnCopy.listMetaPage}</span>
                  <span className="font-mono font-semibold tabular-nums text-foreground">
                    {isUnpricedQueue ? visibleUnpricedLines.length : rows.length}
                  </span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span>{grnCopy.listMetaTotal}</span>
                  <span className="font-mono font-semibold tabular-nums text-foreground">
                    {isUnpricedQueue ? unpricedTotal : total}
                  </span>
                </span>
                {!isUnpricedQueue && pageMetrics.exceptionCount > 0 ? (
                  <span className="inline-flex items-center gap-1.5">
                    <span>{grnCopy.listMetaExceptions}</span>
                    <span className="font-mono font-semibold tabular-nums text-foreground">
                      {pageMetrics.exceptionCount}
                    </span>
                  </span>
                ) : null}
                {!isUnpricedQueue &&
                canManageSupplierInvoice &&
                pageMetrics.pendingInvoiceCount > 0 ? (
                  <span className="inline-flex items-center gap-1.5">
                    <span>{grnCopy.listMetaPendingInvoice}</span>
                    <span className="font-mono font-semibold tabular-nums text-foreground">
                      {pageMetrics.pendingInvoiceCount}
                    </span>
                  </span>
                ) : null}
              </div>
            )
          }
        />

        <AppListFrame toolbar={loadFailed ? undefined : toolbar}>
          {table}
        </AppListFrame>
      </AppPage>
      <ReasonConfirmDialog
        open={cancelRow != null}
        onOpenChange={(open) => {
          if (!open) {
            setCancelRow(null);
            setCancelReason("");
          }
        }}
        title={grnCopy.cancelTitle}
        description={cancelRow?.code}
        reasonId="grn-list-cancel-reason"
        reason={cancelReason}
        onReasonChange={setCancelReason}
        reasonLabel={grnCopy.cancelReason}
        reasonPlaceholder={grnCopy.cancelReasonPlaceholder}
        cancelLabel={ACTIONS_VI.close}
        confirmLabel={grnCopy.cancelAction}
        confirmVariant="destructive"
        isPending={pending}
        onConfirm={() => {
          startTransition(cancelDraft);
        }}
      />
      <ConfirmedGrnUnitCostDialog
        target={unitCostTarget}
        onClose={() => setUnitCostTarget(null)}
        onPatched={() => router.refresh()}
      />
    </>
  );
}

function ExceptionBadges({ row }: { row: GrnListRow }) {
  if (
    row.shortageLineCount === 0 &&
    row.excessLineCount === 0 &&
    row.rejectedLineCount === 0
  ) {
    return (
      <span className="text-muted-foreground">{grnCopy.noExceptions}</span>
    );
  }
  return (
    <div className="flex flex-wrap gap-1">
      {row.shortageLineCount > 0 ? (
        <Badge variant="warning">
          {grnCopy.shortageLines(row.shortageLineCount)}
        </Badge>
      ) : null}
      {row.excessLineCount > 0 ? (
        <Badge variant="warning">
          {grnCopy.excessLines(row.excessLineCount)}
        </Badge>
      ) : null}
      {row.rejectedLineCount > 0 ? (
        <Badge variant="destructive">
          {grnCopy.rejectedExceptionLines(row.rejectedLineCount)}
        </Badge>
      ) : null}
    </div>
  );
}

function GrnMobileCard({
  row,
  actions,
  showInvoiceChrome,
  onOpen,
}: {
  row: GrnListRow;
  actions: RowActionItem[];
  showInvoiceChrome: boolean;
  onOpen: () => void;
}) {
  const isTouchLayout = useIsMobile(OWNER_SHELL_BREAKPOINT);

  return (
    <InteractiveCard
      minHeight="mobile"
      padding="default"
      role="button"
      tabIndex={0}
      className="w-full flex-col items-stretch gap-3 text-left"
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-semibold">{row.code}</span>
            <StatusBadge
              domain="inventory"
              value={row.status}
              label={statusLabels[row.status] ?? grnCopy.unknownStatus}
            />
            {showInvoiceChrome &&
            resolveGrnValuationDisplay({
              status: row.status,
              invoiceId: row.invoiceId,
            }) === "pending_invoice" ? (
              <Badge variant="warning">{valuationCopy.pendingInvoice}</Badge>
            ) : null}
          </div>
          <p className="mt-1 truncate text-sm">
            <GrnSupplierLabel name={row.supplierName} />
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {row.poCode} · {row.receivingSiteName}
          </p>
        </div>
        <div
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <RowActionsMenu
            items={actions}
            label={`${FORM_VI.action} ${row.code}`}
            triggerSize={isTouchLayout ? "icon-touch" : "icon"}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="min-w-0">
          <span className="block text-xs text-muted-foreground">
            {row.status === "confirmed"
              ? grnCopy.receivedDate
              : grnCopy.expectedDate}
          </span>
          <span className="font-mono text-sm font-semibold tabular-nums">
            {row.status === "confirmed"
              ? row.receivedDate
                ? formatVNDate(row.receivedDate)
                : "—"
              : row.expectedReceiveDate
                ? formatVNDate(row.expectedReceiveDate)
                : "—"}
          </span>
        </div>
        <div className="min-w-0">
          <span className="block text-xs text-muted-foreground">
            {grnCopy.kpiLines}
          </span>
          <span className="font-mono text-sm font-semibold tabular-nums">
            {grnCopy.lineProgress(row.completedLineCount, row.lineCount)}
          </span>
        </div>
      </div>
      <div className="border-t pt-2 text-xs">
        <ExceptionBadges row={row} />
      </div>
    </InteractiveCard>
  );
}
