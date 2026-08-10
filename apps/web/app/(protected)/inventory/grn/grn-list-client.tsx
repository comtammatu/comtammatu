"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ExternalLink as IconExternalLink,
  FileText as IconFileText,
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
import { Input } from "@comtammatu/ui/components/input";
import { InteractiveCard } from "@comtammatu/ui/components/interactive-card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { Textarea } from "@comtammatu/ui/components/textarea";
import { toast } from "@comtammatu/ui/components/sonner";
import { AppDialog, Combobox } from "@/components/form";
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

const statusLabels: Record<string, string> = {
  draft: "Chờ nhập hàng",
  confirmed: "Đã nhập kho",
  cancelled: "Đã hủy",
};

const grnCopy = messages.inventory.grn;
const valuationCopy = messages.inventory.valuationDisplay;
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
  loadFailed,
}: {
  rows: GrnListRow[];
  total: number;
  page: number;
  pageSize: number;
  filters: GrnListFilters;
  basePath?: string;
  canManageSupplierInvoice: boolean;
  loadFailed: boolean;
}) {
  const router = useRouter();
  const overlay = useDocumentOverlayUrl(GRN_OVERLAY_KEYS);
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState(filters.query);
  const [supplierId, setSupplierId] = useState(
    filters.supplierId?.toString() ?? "",
  );
  const [dateField, setDateField] = useState(filters.dateField);
  const [dateFrom, setDateFrom] = useState(filters.dateFrom);
  const [dateTo, setDateTo] = useState(filters.dateTo);
  const [poId, setPoId] = useState(filters.poId?.toString() ?? "");
  const [openActionRowId, setOpenActionRowId] = useState<number | null>(null);
  const [cancelRow, setCancelRow] = useState<GrnListRow | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  const options = useMemo(() => {
    const suppliers = new Map<string, string>();
    const purchaseOrders = new Map<string, string>();
    for (const row of rows) {
      suppliers.set(String(row.supplierId), row.supplierName);
      purchaseOrders.set(String(row.poId), row.poCode);
    }
    return {
      suppliers: [...suppliers].map(([value, label]) => ({ value, label })),
      purchaseOrders: [...purchaseOrders].map(([value, label]) => ({
        value,
        label,
      })),
    };
  }, [rows]);

  function listHref(next: Record<string, string | null>) {
    const params = new URLSearchParams();
    const values = {
      q: query.trim() || null,
      status: filters.status,
      supplierId: supplierId || null,
      dateField,
      dateFrom: dateFrom || null,
      dateTo: dateTo || null,
      poId: poId || null,
      branchId: filters.branchId?.toString() ?? null,
      ...next,
    };
    for (const [key, value] of Object.entries(values)) {
      if (value) params.set(key, value);
    }
    return `${basePath}?${params.toString()}`;
  }

  function navigate(next: Record<string, string | null>) {
    startTransition(() =>
      router.push(listHref(next), {
        scroll: false,
      }),
    );
  }

  function openDetail(row: GrnListRow, method: "push" | "replace" = "push") {
    overlay.patchOverlay(
      {
        grnId: row.id,
        mode: row.status === "draft" ? "receive" : "view",
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
        href: `/inventory/purchase-orders?poId=${row.poId}&mode=view`,
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
            {resolveGrnValuationDisplay({
              status: row.status,
              invoiceId: row.invoiceId,
            }) === "pending_invoice" ? (
              <Badge variant="warning">{valuationCopy.pendingInvoice}</Badge>
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
      render: (row) => row.supplierName,
    },
    {
      key: "site",
      header: "Kho nhận",
      render: (row) => row.receivingSiteName,
    },
    {
      key: "date",
      header: "Ngày",
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
      className="items-stretch max-lg:flex-col [&>[data-slot=separator]]:hidden [&>[data-slot=toolbar-group]:first-child]:basis-full"
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
            onKeyDown={(event) => {
              if (event.key === "Enter") navigate({ page: null });
            }}
            placeholder={grnCopy.listSearchPlaceholder}
          />
        </InputGroup>
      }
      filters={
        <>
          <Select
            value={filters.status}
            onValueChange={(value) => navigate({ status: value, page: null })}
          >
            <SelectTrigger
              size="field"
              className="w-40"
              aria-label={FORM_VI.status}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">{statusLabels.draft}</SelectItem>
              <SelectItem value="confirmed">
                {statusLabels.confirmed}
              </SelectItem>
              <SelectItem value="cancelled">
                {statusLabels.cancelled}
              </SelectItem>
              <SelectItem value="all">{grnCopy.allStatuses}</SelectItem>
            </SelectContent>
          </Select>
          <Combobox
            value={supplierId}
            onValueChange={setSupplierId}
            options={options.suppliers}
            placeholder={grnCopy.supplierFilter}
            searchPlaceholder={grnCopy.supplierSearchPlaceholder}
            className="w-44"
          />
          <Select
            value={dateField}
            onValueChange={(value) =>
              setDateField(value as GrnListFilters["dateField"])
            }
          >
            <SelectTrigger size="field" className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="expected">{grnCopy.expectedDate}</SelectItem>
              <SelectItem value="received">{grnCopy.receivedDate}</SelectItem>
            </SelectContent>
          </Select>
          <Input
            type="date"
            aria-label={grnCopy.dateFrom}
            value={dateFrom}
            onChange={(event) => setDateFrom(event.target.value)}
            className="w-36"
          />
          <Input
            type="date"
            aria-label={grnCopy.dateTo}
            value={dateTo}
            onChange={(event) => setDateTo(event.target.value)}
            className="w-36"
          />
          <Combobox
            value={poId}
            onValueChange={setPoId}
            options={options.purchaseOrders}
            placeholder={grnCopy.purchaseOrderFilter}
            searchPlaceholder={grnCopy.purchaseOrderSearchPlaceholder}
            className="w-40"
          />
        </>
      }
      actions={
        <>
          <Button
            type="button"
            size="field"
            disabled={pending}
            onClick={() => navigate({ page: null })}
          >
            {grnCopy.applyFilters}
          </Button>
          {hasGrnListFilters(filters) ? (
            <Button
              variant="ghost"
              size="field"
              render={
                <Link
                  href={`${basePath}?status=${filters.status}${
                    filters.branchId ? `&branchId=${filters.branchId}` : ""
                  }`}
                />
              }
            >
              {grnCopy.clearFilters}
            </Button>
          ) : null}
        </>
      }
    />
  );

  const table = loadFailed ? (
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
          description={grnCopy.listDescription}
        />
        <AppListFrame toolbar={loadFailed ? undefined : toolbar}>
          {table}
        </AppListFrame>
      </AppPage>
      <AppDialog
        open={cancelRow != null}
        onOpenChange={(open) => {
          if (!open) setCancelRow(null);
        }}
        title={grnCopy.cancelTitle}
        description={cancelRow?.code}
        footer={
          <>
            <Button variant="outline" onClick={() => setCancelRow(null)}>
              {ACTIONS_VI.close}
            </Button>
            <Button
              variant="destructive"
              disabled={cancelReason.trim().length < 5 || pending}
              onClick={() => {
                startTransition(cancelDraft);
              }}
            >
              {grnCopy.cancelAction}
            </Button>
          </>
        }
      >
        <Textarea
          aria-label={grnCopy.cancelReason}
          value={cancelReason}
          onChange={(event) => setCancelReason(event.target.value)}
          placeholder={grnCopy.cancelReasonPlaceholder}
        />
      </AppDialog>
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
  onOpen,
}: {
  row: GrnListRow;
  actions: RowActionItem[];
  onOpen: () => void;
}) {
  return (
    <InteractiveCard
      minHeight="mobile"
      padding="default"
      role="button"
      tabIndex={0}
      className="cursor-pointer touch-manipulation justify-between"
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm font-semibold">{row.code}</span>
          <StatusBadge
            domain="inventory"
            value={row.status}
            label={statusLabels[row.status] ?? grnCopy.unknownStatus}
          />
          {resolveGrnValuationDisplay({
            status: row.status,
            invoiceId: row.invoiceId,
          }) === "pending_invoice" ? (
            <Badge variant="warning">{valuationCopy.pendingInvoice}</Badge>
          ) : null}
        </div>
        <p className="truncate text-xs">{row.supplierName}</p>
        <p className="truncate text-xs text-muted-foreground">
          {row.poCode}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {row.receivingSiteName} ·{" "}
          {row.status === "confirmed"
            ? grnCopy.receivedDate
            : grnCopy.expectedDate}{" "}
          {row.status === "confirmed"
            ? row.receivedDate
              ? formatVNDate(row.receivedDate)
              : "—"
            : row.expectedReceiveDate
              ? formatVNDate(row.expectedReceiveDate)
              : "—"}
        </p>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span>
            {grnCopy.lineProgress(row.completedLineCount, row.lineCount)}
          </span>
          <ExceptionBadges row={row} />
        </div>
      </div>
      <div
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <RowActionsMenu
          items={actions}
          label={`${FORM_VI.action} ${row.code}`}
          triggerSize="icon-touch"
        />
      </div>
    </InteractiveCard>
  );
}
