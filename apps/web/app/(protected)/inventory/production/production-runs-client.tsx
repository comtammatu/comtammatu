"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight as IconArrowRight,
  ListChecks as IconListChecks,
  Plus as IconPlus,
} from "lucide-react";
import { formatCount } from "@comtammatu/shared/format";
import { formatVNDate } from "@comtammatu/shared/time";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { INVENTORY_STATUS_LABELS_VI } from "@comtammatu/shared/labels";
import {
  BRANCH_VI,
  FORM_VI,
  INVENTORY_VI,
  PRODUCT_VI,
} from "@comtammatu/shared/messages";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import { InteractiveCard } from "@/components/data-table/interactive-card";
import { getStatusBadgeMeta, StatusBadge } from "@/components/status-badge";
import { matchesSearch } from "@lib/search";
import { InventoryListFrame } from "../_components/inventory-list-frame";
import type { ProductionRunRow } from "../production-run-actions";

const ALL_STATUS_VALUE = "_all";
const STATUS_LABELS: Record<string, string> = INVENTORY_STATUS_LABELS_VI;

interface ProductionRunsClientProps {
  initial: ProductionRunRow[];
  branchId?: number;
  basePath: string;
  embedded?: boolean;
}

export function ProductionRunsClient({
  initial,
  branchId,
  basePath,
  embedded,
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
          row.target_branch_name,
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
        render: (row) => (
          <ProductionRoute
            from={row.branch_name}
            to={row.target_branch_name}
            sameBranch={row.branch_id === row.target_branch_id}
          />
        ),
      },
      {
        key: "finished_good",
        header: PRODUCT_VI.finishedGood,
        render: (row) => row.finished_good_name,
      },
      {
        key: "planned_quantity",
        header: FORM_VI.quantity,
        render: (row) => {
          const unit = row.entry_unit_name || "";
          return `${row.planned_quantity} ${unit}`;
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

  const table = (
    <DataTable
      data={filteredItems}
      columns={columns}
      pageSize={50}
      getRowKey={(row) => row.id.toString()}
      searchable
      searchPlaceholder="Tìm số lệnh, thành phẩm, chi nhánh..."
      searchValue={search}
      onSearchChange={setSearch}
      actions={
        embedded ? null : (
          <Badge variant="secondary">
            {`${formatCount(filteredItems.length)} / ${formatCount(items.length)} ${INVENTORY_VI.productionOrdersMetricLabel}`}
          </Badge>
        )
      }
      filters={[
        {
          key: "status",
          placeholder: FORM_VI.status,
          options: [
            { value: ALL_STATUS_VALUE, label: "Tất cả trạng thái" },
            ...statusOptions.map((status) => ({
              value: status,
              label: statusLabel(status),
            })),
          ],
        },
      ]}
      filterValues={{ status: statusFilter }}
      onFilterChange={(_key, value) => setStatusFilter(value)}
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
  );

  if (!embedded) {
    return <InventoryListFrame>{table}</InventoryListFrame>;
  }

  return (
    <InventoryListFrame
      icon={<IconListChecks />}
      title={INVENTORY_VI.productionOrdersTab}
      description={INVENTORY_VI.productionOrdersCardDescription}
      badge={{
        children: `${formatCount(filteredItems.length)} / ${formatCount(items.length)} ${INVENTORY_VI.productionOrdersMetricLabel}`,
        variant: "secondary",
      }}
      action={
        <Button
          size="touch"
          render={
            <Link
              href={`${basePath}/new${branchId ? `?branchId=${branchId}` : ""}`}
            />
          }
        >
          <IconPlus data-icon="inline-start" />
          {INVENTORY_VI.createOrderShort}
        </Button>
      }
    >
      {table}
    </InventoryListFrame>
  );
}

function statusLabel(status: string) {
  return STATUS_LABELS[status] ?? getStatusBadgeMeta("inventory", status).label;
}

function ProductionRoute({
  from,
  to,
  sameBranch,
}: {
  from: string;
  to: string;
  sameBranch: boolean;
}) {
  if (sameBranch) return <span>{from}</span>;

  return (
    <span className="flex min-w-0 items-center gap-1">
      <span className="truncate">{from}</span>
      <IconArrowRight className="size-3 shrink-0 text-muted-foreground" />
      <span className="truncate">{to}</span>
    </span>
  );
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
          {formatVNDate(row.created_at)} · {row.planned_quantity} {unit}
        </p>
        <p className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
          <ProductionRoute
            from={row.branch_name}
            to={row.target_branch_name}
            sameBranch={row.branch_id === row.target_branch_id}
          />
        </p>
      </div>
    </InteractiveCard>
  );
}
