"use client";

import { useMemo } from "react";
import {
  TriangleAlert as IconAlertTriangle,
  Eye as IconEye,
  ListFilter as IconFilter,
  ReceiptText as IconReceipt,
  Search as IconSearch,
  X as IconX,
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
import { Item } from "@comtammatu/ui/components/item";
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
import { addMoney } from "@comtammatu/shared/money";
import { messages } from "@lib/messages";
import type { SupplierAdvanceSummary } from "../supplier-invoice-actions";
import {
  getSupplierInvoiceGroupId,
  SUPPLIER_INVOICE_MATCH_STATUSES,
  SUPPLIER_INVOICE_PAYMENT_STATUSES,
  type SupplierInvoiceGroup as SupplierInvoiceModelGroup,
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
  aggregateGroups,
  advances,
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
  aggregateGroups: SupplierInvoiceModelGroup[];
  advances: SupplierAdvanceSummary[];
  replaceListParam: (key: string, value: string | null) => void;
  updateListParams: (
    updates: Record<string, string | null>,
    history?: "push" | "replace",
  ) => void;
  openInvoiceDetail: (invoiceId: number, history?: "push" | "replace") => void;
}) {
  const controlSize = useFormControlSize();

  const kpiMetrics = useMemo(() => {
    let outstanding = 0;
    let overdueAmt = 0;
    let overdueCount = 0;
    let missingVatAmt = 0;
    let missingVatCount = 0;
    for (const group of aggregateGroups) {
      outstanding += group.outstandingAmount;
      overdueAmt += group.overdueAmount;
      overdueCount += group.overdueCount;
      missingVatAmt += group.missingVatAmount;
      missingVatCount += group.missingVatCount;
    }
    const advanceAmount = addMoney(advances.map((a) => a.advanceAmount));
    return {
      outstanding,
      overdueAmount: overdueAmt,
      overdueCount,
      missingVatAmount: missingVatAmt,
      missingVatCount,
      advanceAmount,
    };
  }, [advances, aggregateGroups]);

  const kpiStrip = (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
      <Item variant="outline" size="sm" className="flex-col items-start gap-1">
        <span className="text-xs font-medium text-muted-foreground">{copy.outstandingPayable}</span>
        <span className="font-mono text-lg font-semibold tabular-nums text-foreground">
          {messages.inventory.common.currencyCompact(formatVND(kpiMetrics.outstanding))}
        </span>
        <span className="text-xs text-muted-foreground">{copy.groupCount(allInvoiceGroupsLength, totalCount)}</span>
      </Item>

      <InteractiveCard
        minHeight="mobile"
        padding="compact"
        className={cn(
          "flex-col items-stretch gap-1 text-left transition-colors",
          showOnlyOverdue && "bg-destructive/10 ring-1 ring-destructive/20",
        )}
        render={
          <button
            type="button"
            onClick={() => replaceListParam("overdue", showOnlyOverdue ? null : "1")}
          />
        }
      >
        <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
          <span>{copy.overdueOnly}</span>
          {kpiMetrics.overdueCount > 0 ? (
            <Badge variant="destructive" className="px-1.5 py-0 text-xs">
              {copy.overdueGroupSummary(kpiMetrics.overdueCount)}
            </Badge>
          ) : null}
        </div>
        <span className={cn("font-mono text-lg font-semibold tabular-nums", kpiMetrics.overdueCount > 0 ? "text-destructive" : "text-foreground")}>
          {messages.inventory.common.currencyCompact(formatVND(kpiMetrics.overdueAmount))}
        </span>
        <span className="text-xs text-muted-foreground">
          {copy.overdueOnly}
        </span>
      </InteractiveCard>

      <InteractiveCard
        minHeight="mobile"
        padding="compact"
        className={cn(
          "flex-col items-stretch gap-1 text-left transition-colors",
          showOnlyMissingVat && "bg-warning/10 ring-1 ring-warning/20",
        )}
        render={
          <button
            type="button"
            onClick={() => replaceListParam("vat", showOnlyMissingVat ? null : "missing")}
          />
        }
      >
        <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
          <span>{copy.vatMissingOnly}</span>
          {kpiMetrics.missingVatCount > 0 ? (
            <Badge variant="warning" className="px-1.5 py-0 text-xs">
              {copy.vatMissingGroupSummary(kpiMetrics.missingVatCount)}
            </Badge>
          ) : null}
        </div>
        <span className={cn("font-mono text-lg font-semibold tabular-nums", kpiMetrics.missingVatCount > 0 ? "text-warning" : "text-foreground")}>
          {messages.inventory.common.currencyCompact(formatVND(kpiMetrics.missingVatAmount))}
        </span>
        <span className="text-xs text-muted-foreground">
          {copy.vatMissingOnly}
        </span>
      </InteractiveCard>

      <Item variant="outline" size="sm" className="flex-col items-start gap-1">
        <span className="text-xs font-medium text-muted-foreground">{copy.supplierAdvance}</span>
        <span className="font-mono text-lg font-semibold tabular-nums text-foreground">
          {messages.inventory.common.currencyCompact(formatVND(kpiMetrics.advanceAmount))}
        </span>
        <span className="text-xs text-muted-foreground">
          {copy.supplierAdvance} ({advances.length})
        </span>
      </Item>
    </div>
  );

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
          "flex-col items-stretch gap-3 text-left transition-colors",
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
            <p className="truncate text-base font-semibold tracking-tight text-foreground">
              {group.title}
            </p>
            {viewMode === "po" ? (
              <p className="truncate text-xs text-muted-foreground">
                {group.supplierName} · {copy.invoiceGroupSummary(group.invoiceCount)}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                {copy.invoiceGroupSummary(group.invoiceCount)}
              </p>
            )}
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
            {group.overdueCount > 0 ? (
              <Badge variant="outline" className="border-destructive/20 text-xs font-medium text-destructive">
                {copy.overdueGroupSummary(group.overdueCount)}
              </Badge>
            ) : null}
            {group.missingVatCount > 0 ? (
              <Badge variant="outline" className="border-warning/20 text-xs font-medium text-warning">
                {copy.vatMissingGroupSummary(group.missingVatCount)}
              </Badge>
            ) : null}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 bg-muted/30 p-2 text-xs">
          <div className="flex flex-col gap-1">
            <span className="text-muted-foreground">{copy.totalInvoice}</span>
            <span className="font-mono text-sm font-medium tabular-nums text-foreground">
              {messages.inventory.common.currencyCompact(
                formatVND(group.totalAmount),
              )}
            </span>
          </div>
          <div className="flex flex-col items-end gap-1 text-right">
            <span className="text-muted-foreground">{copy.outstandingPayable}</span>
            <span
              className={cn(
                "font-mono text-sm font-semibold tabular-nums",
                group.overdueCount > 0 ? "text-destructive" : "text-primary",
              )}
            >
              {messages.inventory.common.currencyCompact(
                formatVND(group.outstandingAmount),
              )}
            </span>
          </div>
          {group.paidAmount > 0 ? (
            <div className="col-span-2 flex items-center justify-between border-t border-border pt-1 text-muted-foreground">
              <span>{copy.paidAmount}:</span>
              <span className="font-mono tabular-nums text-foreground">
                {messages.inventory.common.currencyCompact(
                  formatVND(group.paidAmount),
                )}
                {group.creditAppliedAmount > 0 ? (
                  <span className="text-xs text-muted-foreground">
                    {" "}(+{copy.supplierCredit} {messages.inventory.common.currencyCompact(
                      formatVND(group.creditAppliedAmount),
                    )})
                  </span>
                ) : null}
              </span>
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-between pt-1 text-xs">
          <span className="font-medium text-primary">
            {isActive ? copy.analyzing : copy.groupDetailAction}
          </span>
        </div>
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
          <p className="truncate font-medium text-foreground">{group.title}</p>
          <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
            {viewMode === "po" ? (
              <span>{group.supplierName} · </span>
            ) : null}
            <span>{copy.invoiceGroupSummary(group.invoiceCount)}</span>
            {group.overdueCount > 0 ? (
              <Badge
                variant="outline"
                className="w-fit border-destructive/20 px-1.5 py-0 text-xs text-destructive"
              >
                {copy.overdueGroupSummary(group.overdueCount)}
              </Badge>
            ) : null}
            {group.missingVatCount > 0 ? (
              <Badge
                variant="outline"
                className="w-fit border-warning/20 px-1.5 py-0 text-xs text-warning"
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
            className: "min-w-32",
            render: (group: SupplierInvoiceGroup) => (
              <span className="text-xs text-muted-foreground">
                {copy.invoiceGroupSummary(group.invoiceCount)}
              </span>
            ),
          },
        ]
      : []),
    {
      key: "total",
      header: copy.totalInvoice,
      className: "min-w-36 text-right",
      render: (group) => (
        <span className="font-mono text-sm tabular-nums text-muted-foreground">
          {messages.inventory.common.currencyCompact(
            formatVND(group.totalAmount),
          )}
        </span>
      ),
    },
    {
      key: "paid",
      header: copy.paidAmount,
      className: "min-w-36 text-right",
      render: (group) => (
        <div className="flex flex-col items-end text-right">
          <span className="font-mono text-sm tabular-nums text-foreground">
            {messages.inventory.common.currencyCompact(
              formatVND(group.paidAmount),
            )}
          </span>
          {group.creditAppliedAmount > 0 ? (
            <span className="text-xs text-muted-foreground">
              +{copy.supplierCredit} {messages.inventory.common.currencyCompact(
                formatVND(group.creditAppliedAmount),
              )}
            </span>
          ) : null}
        </div>
      ),
    },
    {
      key: "outstanding",
      header: copy.outstandingPayable,
      className: "min-w-36 text-right",
      render: (group) => (
        <span
          className={cn(
            "font-mono text-sm font-semibold tabular-nums",
            group.overdueCount > 0 ? "text-destructive" : "text-foreground",
          )}
        >
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

  const quickFilterChips = (
    <div className="flex flex-wrap items-center gap-1">
      <Button
        type="button"
        size="xs"
        variant={showOnlyOverdue ? "default" : "outline"}
        className="gap-1 font-normal"
        onClick={() =>
          replaceListParam("overdue", showOnlyOverdue ? null : "1")
        }
        aria-pressed={showOnlyOverdue}
      >
        <IconAlertTriangle className="size-3.5" />
        {copy.overdueOnly}
      </Button>
      <Button
        type="button"
        size="xs"
        variant={showOnlyMissingVat ? "default" : "outline"}
        className="gap-1 font-normal"
        onClick={() =>
          replaceListParam("vat", showOnlyMissingVat ? null : "missing")
        }
        aria-pressed={showOnlyMissingVat}
        aria-label={copy.vatMissingOnlyAria}
      >
        <IconReceipt className="size-3.5" />
        {copy.vatMissingOnly}
      </Button>
    </div>
  );

  const filterPopover = (
    <Popover>
      <PopoverTrigger
        render={
          <Button type="button" variant="outline" size={controlSize} className="gap-1">
            <IconFilter data-icon="inline-start" className="size-4" />
            {copy.filterAction}
            {activeFilterCount > 0 ? (
              <Badge variant="secondary" className="ml-0.5 rounded-full px-1.5 py-0 text-xs">
                {activeFilterCount}
              </Badge>
            ) : null}
          </Button>
        }
      />
      <PopoverContent align="end" className="w-[min(20rem,calc(100vw-2rem))] p-4">
        <PopoverHeader className="mb-3">
          <PopoverTitle>{copy.filterAction}</PopoverTitle>
          <p className="text-xs text-muted-foreground">{copy.filterHint}</p>
        </PopoverHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">
              {copy.supplier}
            </label>
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
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">
              {copy.matchingPlaceholder}
            </label>
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
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">
              {copy.paymentPlaceholder}
            </label>
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
          </div>

          <div className="flex flex-col gap-2 pt-1">
            <Button
              type="button"
              size={controlSize}
              variant={showOnlyOverdue ? "default" : "outline"}
              className="justify-start text-xs"
              onClick={() =>
                replaceListParam("overdue", showOnlyOverdue ? null : "1")
              }
              aria-pressed={showOnlyOverdue}
            >
              <IconAlertTriangle data-icon="inline-start" className="size-3.5" />
              {copy.overdueOnly}
            </Button>
            <Button
              type="button"
              size={controlSize}
              variant={showOnlyMissingVat ? "default" : "outline"}
              className="justify-start text-xs"
              onClick={() =>
                replaceListParam("vat", showOnlyMissingVat ? null : "missing")
              }
              aria-pressed={showOnlyMissingVat}
              aria-label={copy.vatMissingOnlyAria}
            >
              <IconReceipt data-icon="inline-start" className="size-3.5" />
              {copy.vatMissingOnly}
            </Button>
          </div>

          {activeFilterCount > 0 ? (
            <Button
              type="button"
              size={controlSize}
              variant="ghost"
              className="justify-center text-xs text-muted-foreground hover:text-foreground"
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

  const activeFiltersBar =
    activeFilterCount > 0 ? (
      <div className="flex flex-wrap items-center gap-1 px-3 py-1 text-xs text-muted-foreground">
        <span>{copy.filterAction}:</span>
        {supplierFilter !== ALL_FILTER_VALUE ? (
          <Button
            type="button"
            variant="secondary"
            size="xs"
            onClick={() => replaceListParam("supplierId", null)}
            className="gap-1 font-normal"
          >
            {copy.supplier}: {supplierOptions.find((s) => s.value === supplierFilter)?.label ?? supplierFilter}
            <IconX className="size-3" data-icon="inline-end" />
          </Button>
        ) : null}
        {matchStatusFilter !== ALL_FILTER_VALUE ? (
          <Button
            type="button"
            variant="secondary"
            size="xs"
            onClick={() => replaceListParam("matchStatus", null)}
            className="gap-1 font-normal"
          >
            {copy.matchingPlaceholder}: {MATCH_FILTER_OPTIONS.find((m) => m.value === matchStatusFilter)?.label ?? matchStatusFilter}
            <IconX className="size-3" data-icon="inline-end" />
          </Button>
        ) : null}
        {paymentStatusFilter !== ALL_FILTER_VALUE ? (
          <Button
            type="button"
            variant="secondary"
            size="xs"
            onClick={() => replaceListParam("paymentStatus", null)}
            className="gap-1 font-normal"
          >
            {copy.paymentPlaceholder}: {PAYMENT_FILTER_OPTIONS.find((p) => p.value === paymentStatusFilter)?.label ?? paymentStatusFilter}
            <IconX className="size-3" data-icon="inline-end" />
          </Button>
        ) : null}
        {showOnlyOverdue ? (
          <Button
            type="button"
            variant="destructive"
            size="xs"
            onClick={() => replaceListParam("overdue", null)}
            className="gap-1 font-normal"
          >
            {copy.overdueOnly}
            <IconX className="size-3" data-icon="inline-end" />
          </Button>
        ) : null}
        {showOnlyMissingVat ? (
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={() => replaceListParam("vat", null)}
            className="gap-1 font-normal text-warning border-warning/20"
          >
            {copy.vatMissingOnly}
            <IconX className="size-3" data-icon="inline-end" />
          </Button>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="xs"
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
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          {copy.clearFilters}
        </Button>
      </div>
    ) : null;

  const listToolbar = (
    <div className="flex flex-col gap-2">
      <AppToolbar
        variant="inline"
        className="items-stretch sm:items-center [&>[data-slot=toolbar-group]:first-child]:min-w-0 sm:[&>[data-slot=toolbar-group]:first-child]:min-w-64"
        search={
          <InputGroup size={controlSize} className="min-w-0 flex-1">
            <InputGroupAddon>
              <IconSearch className="size-4" />
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
            <div className="hidden lg:block">{quickFilterChips}</div>
            {filterPopover}
          </>
        }
      />
      {activeFiltersBar}
    </div>
  );

  return {
    controlSize,
    renderInvoiceGroupCard,
    getSupplierInvoiceGroupRowActions,
    invoiceGroupColumns,
    listToolbar,
    kpiStrip,
  };
}
