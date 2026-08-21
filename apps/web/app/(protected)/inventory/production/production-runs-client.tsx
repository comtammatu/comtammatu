"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { Search as IconSearch } from "lucide-react";
import { formatCount, formatQuantity } from "@comtammatu/shared/format";
import { INVENTORY_STATUS_LABELS_VI } from "@comtammatu/shared/labels";
import {
  BRANCH_VI,
  FORM_VI,
  INVENTORY_VI,
  PRODUCT_VI,
} from "@comtammatu/shared/messages";
import { formatVNDate } from "@comtammatu/shared/time";
import { Badge } from "@comtammatu/ui/components/badge";
import { InteractiveCard } from "@comtammatu/ui/components/interactive-card";
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
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import { getStatusBadgeMeta, StatusBadge } from "@/components/status-badge";
import { AppListFrame, AppToolbar } from "@/components/surface";
import { matchesSearch } from "@lib/search";
import { useDocumentOverlayUrl } from "@lib/navigation/use-document-overlay-url";
import { inventoryListFilterSelectClassName } from "../_components/inventory-list-filters";
import type { ProductionRunListRow } from "../production-run-actions";
import { PRODUCTION_OVERLAY_KEYS } from "./production-document-dialog-host";

const ALL_STATUS_VALUE = "_all";
const STATUS_LABELS: Record<string, string> = INVENTORY_STATUS_LABELS_VI;

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

  const statusOptions = useMemo(() => {
    return Array.from(new Set(items.map((item) => item.status))).sort((a, b) =>
      statusLabel(a).localeCompare(statusLabel(b), "vi"),
    );
  }, [items]);

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
        render: (row) => (
          <span className="font-mono font-medium">{row.production_number}</span>
        ),
      },
      {
        key: "created_at",
        header: INVENTORY_VI.createdDate,
        render: (row) => formatVNDate(row.created_at),
      },
      {
        key: "branch",
        header: BRANCH_VI.long,
        render: (row) => row.branch_name,
      },
      {
        key: "finished_good",
        header: PRODUCT_VI.finishedGood,
        render: (row) => row.finished_good_name,
      },
      {
        key: "planned_quantity",
        header: FORM_VI.quantity,
        className: "font-mono",
        render: (row) => {
          const unit = row.entry_unit_name || "";
          return `${formatQuantity(row.planned_quantity)} ${unit}`;
        },
      },
      {
        key: "status",
        header: FORM_VI.status,
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
      filters={
        <Select
          value={statusFilter}
          onValueChange={(value) =>
            filters.patchOverlay(
              { status: value === ALL_STATUS_VALUE ? null : value },
              "replace",
            )
          }
        >
          <SelectTrigger
            size="field"
            className={inventoryListFilterSelectClassName}
            aria-label={FORM_VI.status}
          >
            <SelectValue placeholder={FORM_VI.status} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_STATUS_VALUE}>
              {INVENTORY_VI.allStatusesOption}
            </SelectItem>
            {statusOptions.map((status) => (
              <SelectItem key={status} value={status}>
                {statusLabel(status)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
      reset={
        <Badge variant="secondary">
          {`${formatCount(filteredItems.length)} / ${formatCount(items.length)} ${INVENTORY_VI.productionOrdersMetricLabel}`}
        </Badge>
      }
    />
  );

  return (
    <AppListFrame toolbar={toolbar}>
      <DataTable
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
  );
}

function statusLabel(status: string) {
  return STATUS_LABELS[status] ?? getStatusBadgeMeta("inventory", status).label;
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
    <InteractiveCard minHeight="mobile" padding="default" onClick={onOpen}>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex min-w-0 items-start justify-between gap-2">
          <p className="truncate font-mono text-sm font-semibold">
            {row.production_number}
          </p>
          <StatusBadge domain="inventory" value={row.status} size="sm" />
        </div>
        <p className="truncate text-sm font-medium">{row.finished_good_name}</p>
        <p className="text-xs text-muted-foreground">
          {formatVNDate(row.created_at)} · {formatQuantity(row.planned_quantity)}{" "}
          {unit}
        </p>
        <p className="truncate text-xs text-muted-foreground">{row.branch_name}</p>
      </div>
    </InteractiveCard>
  );
}
