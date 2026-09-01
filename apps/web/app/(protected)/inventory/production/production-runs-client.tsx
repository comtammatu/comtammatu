"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { Search as IconSearch } from "lucide-react";
import { formatCount, formatQuantity } from "@comtammatu/shared/format";
import {
  BRANCH_VI,
  FORM_VI,
  INVENTORY_VI,
  PRODUCT_VI,
} from "@comtammatu/shared/messages";
import { formatVNDate } from "@comtammatu/shared/time";
import { cn } from "@comtammatu/ui/lib/utils";
import { Badge } from "@comtammatu/ui/components/badge";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemHeader,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { messages } from "@lib/messages";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@comtammatu/ui/components/input-group";

import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import { StatusBadge } from "@/components/status-badge";
import { AppListFrame, AppToolbar } from "@/components/surface";
import { matchesSearch } from "@lib/search";
import { useDocumentOverlayUrl } from "@lib/navigation/use-document-overlay-url";
import type { ProductionRunListRow } from "../production-run-actions";
import { PRODUCTION_OVERLAY_KEYS } from "./production-document-dialog-host";

const ALL_STATUS_VALUE = "_all";

interface ProductionRunsClientProps {
  initial: ProductionRunListRow[];
}

export function ProductionRunsClient({ initial }: ProductionRunsClientProps) {
  const overlay = useDocumentOverlayUrl(PRODUCTION_OVERLAY_KEYS);
  const filters = useDocumentOverlayUrl(["q", "status"]);
  const [items] = useState<ProductionRunListRow[]>(initial);
  const search = filters.get("q") ?? "";
  const statusFilter = filters.get("status") ?? ALL_STATUS_VALUE;
  const [searchDraft, setSearchDraft] = useState(search);

  useEffect(() => {
    setSearchDraft(search);
  }, [search]);

  useEffect(() => {
    const trimmed = searchDraft.trim();
    if (trimmed === search.trim()) return;
    const timer = window.setTimeout(() => {
      filters.patchOverlay({ q: trimmed || null }, "replace");
    }, 250);
    return () => window.clearTimeout(timer);
  }, [filters, search, searchDraft]);

  const deferredSearch = useDeferredValue(searchDraft);

  const filteredItems = useMemo(() => {
    const query = deferredSearch.trim();

    return items.filter((row) => {
      if (statusFilter !== ALL_STATUS_VALUE && row.status !== statusFilter) {
        return false;
      }

      if (!query) return true;

      return matchesSearch(
        [
          row.production_number,
          row.finished_good_name,
          row.branch_name,
          row.notes,
        ],
        query,
      );
    });
  }, [items, deferredSearch, statusFilter]);

  function openProductionDetail(row: ProductionRunListRow) {
    overlay.patchOverlay({ runId: row.id, mode: "view" }, "push");
  }

  const columns = useMemo<DataTableColumn<ProductionRunListRow>[]>(() => {
    return [
      {
        key: "production_number",
        header: INVENTORY_VI.productionNumber,
        sortable: true,
        sortValue: (row) => row.production_number,
        render: (row) => (
          <span className="font-mono font-medium">{row.production_number}</span>
        ),
      },
      {
        key: "created_at",
        header: INVENTORY_VI.createdDate,
        sortable: true,
        sortValue: (row) => row.created_at,
        render: (row) => formatVNDate(row.created_at),
      },
      {
        key: "branch",
        header: BRANCH_VI.long,
        sortable: true,
        sortValue: (row) => row.branch_name,
        render: (row) => row.branch_name,
      },
      {
        key: "finished_good",
        header: PRODUCT_VI.finishedGood,
        sortable: true,
        sortValue: (row) => row.finished_good_name,
        render: (row) => row.finished_good_name,
      },
      {
        key: "planned_quantity",
        header: FORM_VI.quantity,
        className: "font-mono",
        sortable: true,
        sortValue: (row) => row.planned_quantity,
        render: (row) => {
          const unit = row.entry_unit_name || "";
          return `${formatQuantity(row.planned_quantity)} ${unit}`;
        },
      },
      {
        key: "status",
        header: FORM_VI.status,
        sortable: true,
        sortValue: (row) => row.status,
        render: (row) => (
          <StatusBadge domain="inventory" value={row.status} size="sm" />
        ),
      },
    ];
  }, []);

  const toolbar = (
    <AppToolbar
      variant="inline"
      search={
        <InputGroup size="field" className="min-w-0 flex-1 sm:min-w-72">
          <InputGroupAddon>
            <IconSearch />
          </InputGroupAddon>
          <InputGroupInput
            type="search"
            aria-label={INVENTORY_VI.productionOrdersSearchPlaceholder}
            value={searchDraft}
            onChange={(event) => setSearchDraft(event.target.value)}
            placeholder={INVENTORY_VI.productionOrdersSearchPlaceholder}
          />
        </InputGroup>
      }
      reset={
        <Badge variant="secondary" className="shrink-0 whitespace-nowrap text-xs">
          {`${formatCount(filteredItems.length)} / ${formatCount(items.length)} ${INVENTORY_VI.productionOrdersMetricLabel}`}
        </Badge>
      }
    />
  );

  const totalRuns = items.length;
  const inProgressRuns = items.filter((r) => r.status === "in_progress").length;
  const completedRuns = items.filter((r) => r.status === "completed").length;
  const draftRuns = items.filter((r) => r.status === "draft").length;
  const prodCopy = messages.inventory.productionRuns;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Item
          variant="outline"
          onClick={() => filters.patchOverlay({ status: null }, "replace")}
          className={cn(
            "flex flex-col justify-between p-3 text-left cursor-pointer",
            statusFilter === ALL_STATUS_VALUE
              ? "border-primary ring-1 ring-primary shadow-xs"
              : "border-border",
          )}
        >
          <div className="flex items-center justify-between gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <span>{prodCopy.metrics.total}</span>
            <span className="size-2 rounded-full bg-muted-foreground" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="font-mono text-2xl font-semibold tabular-nums text-foreground">
              {formatCount(totalRuns)}
            </span>
            <span className="text-xs text-muted-foreground">
              {prodCopy.metrics.runsUnit}
            </span>
          </div>
        </Item>

        <Item
          variant="outline"
          onClick={() =>
            filters.patchOverlay(
              { status: statusFilter === "in_progress" ? null : "in_progress" },
              "replace",
            )
          }
          className={cn(
            "flex flex-col justify-between p-3 text-left cursor-pointer",
            statusFilter === "in_progress"
              ? "border-warning ring-1 ring-warning shadow-xs"
              : "border-border",
          )}
        >
          <div className="flex items-center justify-between gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <span>{prodCopy.metrics.inProgress}</span>
            <span className="size-2 rounded-full bg-warning" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="font-mono text-2xl font-semibold tabular-nums text-warning">
              {formatCount(inProgressRuns)}
            </span>
            <span className="text-xs text-muted-foreground">
              {prodCopy.metrics.inProgressHint}
            </span>
          </div>
        </Item>

        <Item
          variant="outline"
          onClick={() =>
            filters.patchOverlay(
              { status: statusFilter === "completed" ? null : "completed" },
              "replace",
            )
          }
          className={cn(
            "flex flex-col justify-between p-3 text-left cursor-pointer",
            statusFilter === "completed"
              ? "border-success ring-1 ring-success shadow-xs"
              : "border-border",
          )}
        >
          <div className="flex items-center justify-between gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <span>{prodCopy.metrics.completed}</span>
            <span className="size-2 rounded-full bg-success" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="font-mono text-2xl font-semibold tabular-nums text-success">
              {formatCount(completedRuns)}
            </span>
            <span className="text-xs text-muted-foreground">
              {prodCopy.metrics.completedHint}
            </span>
          </div>
        </Item>

        <Item
          variant="outline"
          onClick={() =>
            filters.patchOverlay(
              { status: statusFilter === "draft" ? null : "draft" },
              "replace",
            )
          }
          className={cn(
            "flex flex-col justify-between p-3 text-left cursor-pointer",
            statusFilter === "draft"
              ? "border-primary ring-1 ring-primary shadow-xs"
              : "border-border",
          )}
        >
          <div className="flex items-center justify-between gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <span>{prodCopy.metrics.draft}</span>
            <span className="size-2 rounded-full bg-primary" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="font-mono text-2xl font-semibold tabular-nums text-primary">
              {formatCount(draftRuns)}
            </span>
            <span className="text-xs text-muted-foreground">
              {prodCopy.metrics.draftHint}
            </span>
          </div>
        </Item>
      </div>

      <AppListFrame toolbar={toolbar}>
        <DataTable
          className="[&_table]:table-fixed"
          data={filteredItems}
          columns={columns}
          pageSize={50}
          getRowKey={(row) => row.id.toString()}
          emptyTitle={
            search || statusFilter !== ALL_STATUS_VALUE
              ? INVENTORY_VI.productionOrdersNoResultsTitle
              : INVENTORY_VI.productionOrdersEmptyTitle
          }
          emptyDescription={
            search || statusFilter !== ALL_STATUS_VALUE
              ? INVENTORY_VI.productionOrdersNoResultsDescription
              : INVENTORY_VI.productionOrdersEmptyDescription
          }
          emptyMode={
            search || statusFilter !== ALL_STATUS_VALUE ? "no-results" : "no-data"
          }
          onRowClick={openProductionDetail}
          getRowAriaLabel={(row) =>
            `${INVENTORY_VI.productionNumber} ${row.production_number}`
          }
          mobileCardRender={(row) => (
            <ProductionRunCard row={row} onOpen={() => openProductionDetail(row)} />
          )}
        />
      </AppListFrame>
    </div>
  );
}

function ProductionRunCard({
  row,
  onOpen,
}: {
  row: ProductionRunListRow;
  onOpen: () => void;
}) {
  const unit = row.entry_unit_name ?? "";

  return (
    <Item
      variant="outline"
      className="w-full text-left"
      render={<button type="button" onClick={onOpen} />}
    >
      <ItemHeader>
        <div className="flex min-w-0 items-center gap-2">
          <ItemTitle className="font-mono font-semibold">
            {row.production_number}
          </ItemTitle>
          <StatusBadge domain="inventory" value={row.status} />
        </div>
      </ItemHeader>
      <ItemContent className="min-w-0 text-left">
        <ItemDescription className="truncate font-medium text-foreground">
          {row.finished_good_name}
        </ItemDescription>
        <ItemDescription className="text-xs text-muted-foreground">
          {formatVNDate(row.created_at)} · {formatQuantity(row.planned_quantity)}{" "}
          {unit}
        </ItemDescription>
        <ItemDescription className="truncate text-xs text-muted-foreground">
          {row.branch_name}
        </ItemDescription>
      </ItemContent>
    </Item>
  );
}
