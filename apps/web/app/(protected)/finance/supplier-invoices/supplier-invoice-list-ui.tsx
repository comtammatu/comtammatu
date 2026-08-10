"use client";

import {
  TriangleAlert as IconAlertTriangle,
  Eye as IconEye,
  ListFilter as IconFilter,
  ReceiptText as IconReceipt,
  Search as IconSearch,
} from "lucide-react";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@comtammatu/ui/components/input-group";
import { InteractiveCard } from "@comtammatu/ui/components/interactive-card";
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@comtammatu/ui/components/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { Tabs, TabsList, TabsTrigger } from "@comtammatu/ui/components/tabs";
import { cn } from "@comtammatu/ui";
import { Combobox } from "@/components/form";
import { useFormControlSize } from "@/components/form/control-size";
import { AppToolbar } from "@/components/surface";
import type { DataTableColumn } from "@/components/data-table/data-table";
import { getStatusBadgeMeta } from "@/components/status-badge";
import {
  RowActionsMenu,
  type RowActionItem,
} from "@/components/row-actions-menu";
import { formatAccountingVND as formatVND } from "@comtammatu/shared/format";
import { messages } from "@lib/messages";
import {
  getSupplierInvoiceGroupId,
  SUPPLIER_INVOICE_MATCH_STATUSES,
  SUPPLIER_INVOICE_PAYMENT_STATUSES,
  type SupplierInvoiceViewMode,
} from "./supplier-invoice-list-model";
import {
  ALL_FILTER_VALUE,
  getPrimaryInvoice,
  type SupplierInvoiceGroup,
} from "./supplier-invoice-form-schema";
import type { SupplierInvoiceRow } from "./supplier-invoice-row";

export const MATCH_FILTER_OPTIONS = SUPPLIER_INVOICE_MATCH_STATUSES.map((value) => ({
  value,
  label: getStatusBadgeMeta("inventory", value).label,
}));

export const PAYMENT_FILTER_OPTIONS = SUPPLIER_INVOICE_PAYMENT_STATUSES.map(
  (value) => ({
    value,
    label: getStatusBadgeMeta("inventory", value).label,
  }),
);

export function useSupplierInvoiceListUi({
  copy,
  viewMode,
  detailOpen,
  selectedInvoice,
  supplierFilter,
  matchStatusFilter,
  paymentStatusFilter,
  showOnlyOverdue,
  showOnlyMissingVat,
  activeFilterCount,
  search,
  onSearchChange,
  allInvoiceGroupsLength,
  totalCount,
  supplierOptions,
  replaceListParam,
  updateListParams,
  openInvoiceDetail,
}: {
  copy: typeof messages.inventory.supplierInvoices;
  viewMode: SupplierInvoiceViewMode;
  detailOpen: boolean;
  selectedInvoice: SupplierInvoiceRow | null;
  supplierFilter: string;
  matchStatusFilter: string;
  paymentStatusFilter: string;
  showOnlyOverdue: boolean;
  showOnlyMissingVat: boolean;
  activeFilterCount: number;
  search: string;
  onSearchChange: (value: string) => void;
  allInvoiceGroupsLength: number;
  totalCount: number;
  supplierOptions: Array<{ label: string; value: string }>;
  replaceListParam: (key: string, value: string | null) => void;
  updateListParams: (
    updates: Record<string, string | null>,
    history?: "push" | "replace",
  ) => void;
  openInvoiceDetail: (invoiceId: number, history?: "push" | "replace") => void;
}) {
  const controlSize = useFormControlSize();

  const renderInvoiceGroupCard = (group: SupplierInvoiceGroup) => {
    const primaryInvoice = getPrimaryInvoice(group);
    const isActive =
      detailOpen &&
      selectedInvoice != null &&
      group.id === getSupplierInvoiceGroupId(selectedInvoice, viewMode);

    return (
      <InteractiveCard
        minHeight="mobile"
        padding="default"
        className={cn(
          "flex-col items-stretch gap-3 text-left",
          isActive && "border-primary/20 bg-primary/10 ring-2 ring-primary/20",
        )}
        render={
          <button
            type="button"
            onClick={() => {
              if (primaryInvoice) openInvoiceDetail(primaryInvoice.id);
            }}
            aria-pressed={isActive}
          />
        }
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <p className="truncate text-sm font-semibold">{group.title}</p>
            {viewMode === "po" ? (
              <p className="truncate text-sm text-muted-foreground">
                {group.subtitle}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            {group.overdueCount > 0 ? (
              <Badge variant="outline" className="border-destructive/20">
                {copy.overdueGroupSummary(group.overdueCount)}
              </Badge>
            ) : null}
            {group.missingVatCount > 0 ? (
              <Badge variant="outline" className="border-warning/20">
                {copy.vatMissingGroupSummary(group.missingVatCount)}
              </Badge>
            ) : null}
          </div>
        </div>

        <div className="mt-4 grid gap-2 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">{copy.totalInvoice}</span>
            <span className="font-mono font-semibold">
              {messages.inventory.common.currencyCompact(
                formatVND(group.totalAmount),
              )}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">
              {copy.outstandingPayable}
            </span>
            <span className="font-mono font-semibold">
              {messages.inventory.common.currencyCompact(
                formatVND(group.outstandingAmount),
              )}
            </span>
          </div>
          {viewMode === "supplier" ? (
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">{copy.paidAmount}</span>
              <span className="font-mono">
                {messages.inventory.common.currencyCompact(
                  formatVND(group.paidAmount),
                )}
              </span>
            </div>
          ) : null}
          {viewMode === "supplier" && group.creditAppliedAmount > 0 ? (
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">
                {copy.supplierCredit}
              </span>
              <span className="font-mono">
                {messages.inventory.common.currencyCompact(
                  formatVND(group.creditAppliedAmount),
                )}
              </span>
            </div>
          ) : null}
        </div>

        <span className="mt-4 text-sm font-medium text-primary">
          {isActive ? copy.analyzing : copy.groupDetailAction}
        </span>
      </InteractiveCard>
    );
  };

  const getSupplierInvoiceGroupRowActions = (
    group: SupplierInvoiceGroup,
  ): RowActionItem[] => {
    const primaryInvoice = getPrimaryInvoice(group);
    return [
      {
        key: "view",
        label: copy.groupDetailAction,
        icon: <IconEye data-icon="inline-start" />,
        disabled: primaryInvoice == null,
        onSelect: () => {
          if (primaryInvoice) openInvoiceDetail(primaryInvoice.id);
        },
      },
    ];
  };

  const invoiceGroupColumns: DataTableColumn<SupplierInvoiceGroup>[] = [
    {
      key: "group",
      header: viewMode === "supplier" ? copy.supplierGroup : copy.poGroup,
      className: "min-w-56",
      render: (group) => (
        <div className="flex min-w-0 flex-col gap-1">
          <p className="truncate text-foreground">{group.title}</p>
          {viewMode === "po" ? (
            <p className="text-xs text-muted-foreground">
              {copy.supplier}: {group.supplierName}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-1">
            {group.overdueCount > 0 ? (
              <Badge
                variant="outline"
                className="w-fit border-destructive/20 text-xs"
              >
                {copy.overdueGroupSummary(group.overdueCount)}
              </Badge>
            ) : null}
            {group.missingVatCount > 0 ? (
              <Badge
                variant="outline"
                className="w-fit border-warning/20 text-xs"
              >
                {copy.vatMissingGroupSummary(group.missingVatCount)}
              </Badge>
            ) : null}
          </div>
        </div>
      ),
    },
    ...(viewMode === "po"
      ? [
          {
            key: "invoiceCount",
            header: copy.relatedInvoicesHeader,
            className: "min-w-40",
            render: (group: SupplierInvoiceGroup) => (
              <div className="flex min-w-0 flex-col gap-1">
                <span className="text-sm text-muted-foreground">
                  {copy.invoiceGroupSummary(group.invoiceCount)}
                </span>
              </div>
            ),
          },
        ]
      : []),
    {
      key: "total",
      header: copy.totalInvoice,
      className: "min-w-36 text-right",
      render: (group) => (
        <span className="font-mono text-sm tabular-nums">
          {messages.inventory.common.currencyCompact(
            formatVND(group.totalAmount),
          )}
        </span>
      ),
    },
    ...(viewMode === "supplier"
      ? [
          {
            key: "paid",
            header: copy.paidAmount,
            className: "min-w-36 text-right",
            render: (group: SupplierInvoiceGroup) => (
              <div className="flex flex-col items-end gap-1 text-right">
                <span className="font-mono text-sm tabular-nums">
                  {messages.inventory.common.currencyCompact(
                    formatVND(group.paidAmount),
                  )}
                </span>
                {group.creditAppliedAmount > 0 ? (
                  <span className="text-xs text-muted-foreground">
                    {copy.supplierCredit}:{" "}
                    <span className="font-mono tabular-nums">
                      {messages.inventory.common.currencyCompact(
                        formatVND(group.creditAppliedAmount),
                      )}
                    </span>
                  </span>
                ) : null}
              </div>
            ),
          },
        ]
      : []),
    {
      key: "outstanding",
      header: copy.outstandingPayable,
      className: "min-w-40 text-right",
      render: (group) => (
        <span className="font-mono text-sm tabular-nums">
          {messages.inventory.common.currencyCompact(
            formatVND(group.outstandingAmount),
          )}
        </span>
      ),
    },
    {
      key: "action",
      header: "",
      className: "w-12 text-right",
      render: (group) => {
        const items = getSupplierInvoiceGroupRowActions(group);

        return (
          <div
            className="flex justify-end"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
          >
            <RowActionsMenu
              items={items}
              label={`${copy.groupDetailAction}: ${group.title}`}
              triggerSize={controlSize === "touch" ? "icon-touch" : "icon"}
            />
          </div>
        );
      },
    },
  ];

  const viewModeTabs = (
    <Tabs
      value={viewMode}
      onValueChange={(value) =>
        replaceListParam("view", value === "supplier" ? null : value)
      }
      aria-label={copy.groupByAria}
    >
      <TabsList
        variant="toolbar"
        size={controlSize === "touch" ? "touch" : "default"}
        className="w-full sm:w-fit"
        aria-label={copy.groupByLabel}
      >
        <TabsTrigger value="supplier">{copy.viewBySupplier}</TabsTrigger>
        <TabsTrigger value="po">{copy.viewByPo}</TabsTrigger>
      </TabsList>
    </Tabs>
  );

  const filterPopover = (
    <Popover>
      <PopoverTrigger
        render={
          <Button type="button" variant="outline" size={controlSize}>
            <IconFilter data-icon="inline-start" />
            {copy.filterAction}
            {activeFilterCount > 0 ? (
              <Badge variant="secondary" className="ml-1 rounded-full px-1.5">
                {activeFilterCount}
              </Badge>
            ) : null}
          </Button>
        }
      />
      <PopoverContent align="end" className="w-[min(20rem,calc(100vw-2rem))]">
        <PopoverHeader>
          <PopoverTitle>{copy.filterAction}</PopoverTitle>
          <p className="text-muted-foreground">{copy.filterHint}</p>
        </PopoverHeader>
        <div className="flex flex-col gap-2">
          <Combobox
            value={supplierFilter}
            onValueChange={(value) =>
              replaceListParam(
                "supplierId",
                value === ALL_FILTER_VALUE ? null : value,
              )
            }
            options={[
              { value: ALL_FILTER_VALUE, label: copy.allSuppliers },
              ...supplierOptions,
            ]}
            placeholder={copy.supplierPlaceholder}
            searchPlaceholder={copy.supplierSearchPlaceholder}
            aria-label={copy.supplierFilterAria}
            size={controlSize}
            triggerClassName="w-full"
          />

          <Select
            value={matchStatusFilter}
            onValueChange={(value) =>
              replaceListParam(
                "matchStatus",
                value === ALL_FILTER_VALUE ? null : value,
              )
            }
          >
            <SelectTrigger size={controlSize} className="w-full">
              <SelectValue placeholder={copy.matchingPlaceholder} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem
                value={ALL_FILTER_VALUE}
                size={controlSize === "touch" ? "touch" : "default"}
              >
                {copy.allMatching}
              </SelectItem>
              {MATCH_FILTER_OPTIONS.map((option) => (
                <SelectItem
                  key={option.value}
                  value={option.value}
                  size={controlSize === "touch" ? "touch" : "default"}
                >
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={paymentStatusFilter}
            onValueChange={(value) =>
              replaceListParam(
                "paymentStatus",
                value === ALL_FILTER_VALUE ? null : value,
              )
            }
          >
            <SelectTrigger size={controlSize} className="w-full">
              <SelectValue placeholder={copy.paymentPlaceholder} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem
                value={ALL_FILTER_VALUE}
                size={controlSize === "touch" ? "touch" : "default"}
              >
                {copy.allPayments}
              </SelectItem>
              {PAYMENT_FILTER_OPTIONS.map((option) => (
                <SelectItem
                  key={option.value}
                  value={option.value}
                  size={controlSize === "touch" ? "touch" : "default"}
                >
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            type="button"
            size={controlSize}
            variant={showOnlyOverdue ? "default" : "outline"}
            className="justify-start"
            onClick={() =>
              replaceListParam("overdue", showOnlyOverdue ? null : "1")
            }
            aria-pressed={showOnlyOverdue}
          >
            <IconAlertTriangle data-icon="inline-start" />
            {copy.overdueOnly}
          </Button>
          <Button
            type="button"
            size={controlSize}
            variant={showOnlyMissingVat ? "default" : "outline"}
            className="justify-start"
            onClick={() =>
              replaceListParam("vat", showOnlyMissingVat ? null : "missing")
            }
            aria-pressed={showOnlyMissingVat}
            aria-label={copy.vatMissingOnlyAria}
          >
            <IconReceipt data-icon="inline-start" />
            {copy.vatMissingOnly}
          </Button>
          {activeFilterCount > 0 ? (
            <Button
              type="button"
              size={controlSize}
              variant="ghost"
              className="justify-start"
              onClick={() =>
                updateListParams({
                  q: null,
                  supplierId: null,
                  matchStatus: null,
                  paymentStatus: null,
                  overdue: null,
                  vat: null,
                })
              }
            >
              {copy.clearFilters}
            </Button>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );

  const listToolbar = (
    <AppToolbar
      variant="inline"
      className="items-stretch sm:items-center [&>[data-slot=toolbar-group]:first-child]:min-w-0 sm:[&>[data-slot=toolbar-group]:first-child]:min-w-64"
      search={
        <InputGroup size={controlSize} className="min-w-0 flex-1">
          <InputGroupAddon>
            <IconSearch />
          </InputGroupAddon>
          <InputGroupInput
            type="search"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={copy.searchPlaceholder}
            aria-label={copy.searchPlaceholder}
          />
          <InputGroupAddon align="inline-end">
            <InputGroupText>
              {copy.groupCount(allInvoiceGroupsLength, totalCount)}
            </InputGroupText>
          </InputGroupAddon>
        </InputGroup>
      }
      filters={
        <>
          {viewModeTabs}
          {filterPopover}
        </>
      }
    />
  );

  return {
    controlSize,
    renderInvoiceGroupCard,
    getSupplierInvoiceGroupRowActions,
    invoiceGroupColumns,
    listToolbar,
  };
}
