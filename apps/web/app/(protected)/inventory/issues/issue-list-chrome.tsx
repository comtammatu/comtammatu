"use client";

import Link from "next/link";
import {
  FilterX as IconFilterX,
  Search as IconSearch,
} from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@comtammatu/ui/components/input-group";
import { InteractiveCard } from "@comtammatu/ui/components/interactive-card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { BusinessDatePicker } from "@/components/form";
import {
  AppToolbar,
} from "@/components/surface";
import {
  DataTableColumn,
} from "@/components/data-table/data-table";
import {
  RowActionsMenu,
  type RowActionItem,
} from "@/components/row-actions-menu";
import { StatusBadge } from "@/components/status-badge";
import {
  ACTIONS_VI,
  BRANCH_VI,
  FORM_VI,
  INVENTORY_VI,
} from "@comtammatu/shared/messages";
import { inventoryListFilterSelectClassName } from "../_components/inventory-list-filters";
import {
  issueTypeLabel,
  STATE_FILTER_OPTIONS,
} from "./issue-list-helpers";
import type { IssueRow, RecordedConsumptionRow } from "./issue-list-types";

type SelectOption = { value: string; label: string };

import {
  OWNER_SHELL_BREAKPOINT,
  useIsMobile,
} from "@comtammatu/ui/hooks/use-mobile";
export function IssueListFilterBar({
  controlSize,
  search,
  activeStatus,
  activeType,
  showTypeFilter,
  allowedTypeFilterOptions,
  hasActiveFilters,
  onSearchChange,
  onSearchApply,
  onStatusChange,
  onTypeChange,
  onClearFilters,
}: {
  controlSize: "field" | "touch";
  search: string;
  activeStatus: string;
  activeType: string;
  showTypeFilter: boolean;
  allowedTypeFilterOptions: SelectOption[];
  hasActiveFilters: boolean;
  onSearchChange: (value: string) => void;
  onSearchApply: () => void;
  onStatusChange: (value: string) => void;
  onTypeChange: (value: string) => void;
  onClearFilters: () => void;
}) {
  return (
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
            onChange={(e) => onSearchChange(e.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") onSearchApply();
            }}
            placeholder={INVENTORY_VI.issueSearchPlaceholder}
            inputMode="search"
          />
        </InputGroup>
      }
      filters={
        <>
          <Select value={activeStatus} onValueChange={onStatusChange}>
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
            <Select value={activeType} onValueChange={onTypeChange}>
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
      actions={
        search.trim().length > 0 ? (
          <Button
            type="button"
            variant="outline"
            size={controlSize}
            onClick={onSearchApply}
          >
            {ACTIONS_VI.filter}
          </Button>
        ) : null
      }
      reset={
        hasActiveFilters ? (
          <Button
            type="button"
            variant="ghost"
            size={controlSize}
            onClick={onClearFilters}
          >
            <IconFilterX className="mr-1 size-4" />
            {ACTIONS_VI.clearFilter}
          </Button>
        ) : null
      }
    />
  );
}

export function RecordedConsumptionFilterBar({
  controlSize,
  recordedSearch,
  selectedRecordedBranchId,
  recordedBranchSelectItems,
  recordedStartDate,
  recordedEndDate,
  hasRecordedServerFilter,
  onRecordedSearchChange,
  onRecordedBranchChange,
  onRecordedStartDateChange,
  onRecordedEndDateChange,
  onApplyFilter,
  onClearFilter,
}: {
  controlSize: "field" | "touch";
  recordedSearch: string;
  selectedRecordedBranchId: string;
  recordedBranchSelectItems: SelectOption[];
  recordedStartDate: string;
  recordedEndDate: string;
  hasRecordedServerFilter: boolean;
  onRecordedSearchChange: (value: string) => void;
  onRecordedBranchChange: (value: string) => void;
  onRecordedStartDateChange: (value: string) => void;
  onRecordedEndDateChange: (value: string) => void;
  onApplyFilter: () => void;
  onClearFilter: () => void;
}) {
  return (
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
            onChange={(event) => onRecordedSearchChange(event.target.value)}
            placeholder={INVENTORY_VI.recordedSearchPlaceholder}
            inputMode="search"
          />
        </InputGroup>
      }
      filters={
        <>
          <Select
            value={selectedRecordedBranchId}
            onValueChange={onRecordedBranchChange}
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
          <BusinessDatePicker
            id="recorded-start-date"
            value={recordedStartDate}
            onValueChange={onRecordedStartDateChange}
            aria-label={FORM_VI.fromDate}
            className="w-52 shrink-0"
          />
          <BusinessDatePicker
            id="recorded-end-date"
            value={recordedEndDate}
            onValueChange={onRecordedEndDateChange}
            aria-label={FORM_VI.toDate}
            className="w-52 shrink-0"
          />
        </>
      }
      actions={
        <Button
          type="button"
          variant="outline"
          size={controlSize}
          onClick={onApplyFilter}
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
            onClick={onClearFilter}
          >
            <IconFilterX className="mr-1 size-4" />
            {ACTIONS_VI.clearFilter}
          </Button>
        ) : null
      }
    />
  );
}

export function buildIssueColumns({
  detailBasePath,
  getIssueRowActions,
  openActionRowId,
  setOpenActionRowId,
  onOpen,
}: {
  detailBasePath: string;
  getIssueRowActions: (item: IssueRow) => RowActionItem[];
  openActionRowId: number | null;
  setOpenActionRowId: (id: number | null) => void;
  onOpen?: (item: IssueRow) => void;
}): DataTableColumn<IssueRow>[] {
  return [
    {
      key: "code",
      header: INVENTORY_VI.issueCode,
      render: (item) =>
        onOpen ? (
          <Button
            type="button"
            variant="link"
            className="h-auto p-0 font-mono font-medium"
            onClick={() => onOpen(item)}
          >
            {item.code}
          </Button>
        ) : (
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
}

export function buildRecordedConsumptionColumns(
  canViewMonetary: boolean,
): DataTableColumn<RecordedConsumptionRow>[] {
  return [
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
      render: (item) =>
        INVENTORY_VI.ingredientCountBadge(item.ingredientCount),
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
}

export function IssueRowCard({
  item,
  actions,
  onOpen,
}: {
  item: IssueRow;
  actions: RowActionItem[];
  onOpen: (item: IssueRow) => void;
}) {
  const isTouchLayout = useIsMobile(OWNER_SHELL_BREAKPOINT);

  return (
    <InteractiveCard
      minHeight="mobile"
      padding="default"
      className="cursor-pointer"
      role="button"
      tabIndex={0}
      onClick={() => onOpen(item)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen(item);
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
          triggerSize={isTouchLayout ? "icon-touch" : "icon"}
        />
      </div>
    </InteractiveCard>
  );
}

export function RecordedConsumptionCard({
  item,
  canViewMonetary,
  onOpen,
}: {
  item: RecordedConsumptionRow;
  canViewMonetary: boolean;
  onOpen: (item: RecordedConsumptionRow) => void;
}) {
  return (
    <InteractiveCard
      minHeight="tap"
      padding="compact"
      className="cursor-pointer"
      role="button"
      tabIndex={0}
      onClick={() => onOpen(item)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen(item);
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
}
