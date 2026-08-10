"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { inventoryListFilterSelectClassName } from "../_components/inventory-list-filters";
import type { ProductionRunRow } from "../production-run-actions";

const ALL_STATUS_VALUE = "_all";
const STATUS_LABELS: Record<string, string> = INVENTORY_STATUS_LABELS_VI;

interface ProductionRunsClientProps {
  initial: ProductionRunRow[];
  basePath: string;
}

export function ProductionRunsClient({
  initial,
  basePath,
}: ProductionRunsClientProps) {
  const router = useRouter();
  const [items] = useState<ProductionRunRow[]>(initial);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState(ALL_STATUS_VALUE);

  const statusOptions = useMemo(() => {
    return Array.from(new Set(items.map((item) => item.status))).sort((a, b) =>
      statusLabel(a).localeCompare(statusLabel(b), "vi"),
    );
  }, [items]);

  const filteredItems = useMemo(() => {
    const query = search.trim();

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
  }, [items, search, statusFilter]);

  function detailHref(row: ProductionRunRow): string {
    return `${basePath}/${row.id}`;
  }

  function openProductionDetail(row: ProductionRunRow) {
    router.push(detailHref(row));
  }

  const columns = useMemo<DataTableColumn<ProductionRunRow>[]>(() => {
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
            aria-label="Tìm số lệnh, thành phẩm, chi nhánh…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Tìm số lệnh, thành phẩm, chi nhánh…"
          />
        </InputGroup>
      }
      filters={
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger
            size="field"
            className={inventoryListFilterSelectClassName}
            aria-label={FORM_VI.status}
          >
            <SelectValue placeholder={FORM_VI.status} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_STATUS_VALUE}>Tất cả trạng thái</SelectItem>
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
            ? "Không tìm thấy lệnh phù hợp"
            : INVENTORY_VI.productionOrdersEmptyTitle
        }
        emptyDescription={
          search || statusFilter !== ALL_STATUS_VALUE
            ? "Đổi từ khóa hoặc trạng thái để xem lại danh sách lệnh."
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
          <ProductionRunCard row={row} href={detailHref(row)} />
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
  href,
}: {
  row: ProductionRunRow;
  href: string;
}) {
  const unit = row.entry_unit_name ?? "";

  return (
    <InteractiveCard
      minHeight="mobile"
      padding="default"
      render={<Link href={href} className="min-w-0" />}
    >
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
