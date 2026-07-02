"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  ArrowRight as IconArrowRight,
  Plus as IconPlus,
  Search as IconSearch,
} from "lucide-react";
import { formatVNDate } from "@comtammatu/shared/time";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { toast } from "@comtammatu/ui/components/sonner";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@comtammatu/ui/components/input-group";
import { Combobox } from "@/components/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { cn } from "@comtammatu/ui";
import { matchesSearch } from "@lib/search";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import {
  AppPage,
  AppPageHeader,
  AppSection,
  AppToolbar,
} from "@/components/surface";
import { InteractiveCard } from "@/components/data-table/interactive-card";
import { StatusBadge } from "@/components/status-badge";
import { tRoute, tStatus } from "../_lib/dictionary";
import type { SupplierRow } from "../suppliers/suppliers-client";
import { fetchPurchaseOrdersPage } from "../procurement-actions";
import type { PurchaseOrderCursor } from "../procurement-actions";
import { messages } from "@lib/messages";

import { FORM_VI } from "@comtammatu/shared/messages";
export interface PurchaseOrderRow {
  id: number;
  po_number: string;
  display_id: string | null;
  status: string;
  ordered_at: string;
  notes: string | null;
  supplier_id: number;
  branch_id: number;
  suppliers: { id: number; name: string } | null;
}

const ALL_FILTER_VALUE = "_all";
const PO_FILTER_KEYS = [
  "draft",
  "sent",
  "partially_received",
  "received",
  "cancelled",
] as const;
const poCopy = messages.inventory.po;
const inventoryShellCopy = messages.inventory.shell;

function formatDate(value: string) {
  return formatVNDate(value);
}

/** Vietnamese relative-time hint (e.g. "3 ngày trước", "Hôm nay") for tooltips. */
function formatRelative(value: string): string {
  const ms = Date.now() - new Date(value).getTime();
  const days = Math.floor(ms / 86400000);
  if (days === 0) return "Hôm nay";
  if (days === 1) return "Hôm qua";
  if (days < 0) return `${Math.abs(days)} ngày tới`;
  if (days < 30) return `${days} ngày trước`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} tháng trước`;
  return `${Math.floor(months / 12)} năm trước`;
}

export function PurchaseOrdersClient({
  initial,
  suppliers,
  statusCounts,
  initialHasMore = false,
  initialNextCursor = null,
  branchId,
  purchaseOrdersBasePath = "/inventory/purchase-orders",
  suppliersPath = "/inventory/suppliers",
  embedded = false,
}: {
  initial: PurchaseOrderRow[];
  suppliers: SupplierRow[];
  statusCounts: Record<string, number>;
  initialHasMore?: boolean;
  initialNextCursor?: PurchaseOrderCursor | null;
  branchId?: number;
  purchaseOrdersBasePath?: string;
  suppliersPath?: string | null;
  embedded?: boolean;
}) {
  const [rows, setRows] = useState(initial);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [nextCursor, setNextCursor] = useState<PurchaseOrderCursor | null>(
    initialNextCursor,
  );
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState(ALL_FILTER_VALUE);
  const [supplierFilter, setSupplierFilter] = useState(ALL_FILTER_VALUE);

  // Total across the whole tenant/branch (server count-only queries), so the
  // status tabs stay accurate even though the table is keyset-paginated.
  const totalCount = useMemo(
    () => Object.values(statusCounts).reduce((sum, count) => sum + count, 0),
    [statusCounts],
  );

  function handleLoadMore() {
    if (isPending || !hasMore || !nextCursor) return;
    startTransition(async () => {
      const result = await fetchPurchaseOrdersPage({
        branchId,
        before: nextCursor,
      });
      if (!result.success || !result.data) {
        toast.error(result.error ?? poCopy.loadMoreFailed);
        return;
      }
      const { items, hasMore: more, nextCursor: cursor } = result.data;
      setRows((current) => [...current, ...(items as PurchaseOrderRow[])]);
      setHasMore(more);
      setNextCursor(cursor);
    });
  }

  const filteredRows = useMemo(() => {
    const query = search.trim();

    return rows.filter((row) => {
      if (statusFilter !== ALL_FILTER_VALUE && row.status !== statusFilter) {
        return false;
      }

      if (
        supplierFilter !== ALL_FILTER_VALUE &&
        String(row.supplier_id) !== supplierFilter
      ) {
        return false;
      }

      if (!query) {
        return true;
      }

      return matchesSearch(
        [row.display_id, row.po_number, row.suppliers?.name, row.notes],
        query,
      );
    });
  }, [rows, search, statusFilter, supplierFilter]);

  const showEmptyResults =
    filteredRows.length === 0 &&
    (search.trim().length > 0 ||
      statusFilter !== ALL_FILTER_VALUE ||
      supplierFilter !== ALL_FILTER_VALUE);

  const columns: DataTableColumn<PurchaseOrderRow>[] = [
    {
      key: "po_number",
      header: "Số PO",
      className: "min-w-40",
      render: (row) => (
        <span className="font-mono font-medium">
          {row.display_id ?? row.po_number}
        </span>
      ),
    },
    {
      key: "supplier",
      header: "Nhà cung cấp",
      className: "min-w-52",
      render: (row) => (
        <span className="text-muted-foreground">
          {row.suppliers?.name ?? poCopy.supplierFallback}
        </span>
      ),
    },
    {
      key: "status",
      header: FORM_VI.status,
      className: "min-w-36",
      render: (row) => (
        <StatusBadge domain="inventory" value={row.status} size="sm" />
      ),
    },
    {
      key: "ordered_at",
      header: "Ngày đặt",
      className: "min-w-32",
      render: (row) => (
        <span
          className="text-muted-foreground"
          title={formatRelative(row.ordered_at)}
        >
          {formatDate(row.ordered_at)}
        </span>
      ),
    },
    {
      key: "notes",
      header: FORM_VI.notes,
      render: (row) => (
        <p
          className={cn(
            "max-w-md truncate text-sm text-muted-foreground",
            !row.notes && "text-muted-foreground/60",
          )}
        >
          {row.notes ?? poCopy.noNotes}
        </p>
      ),
    },
    {
      key: "action",
      header: FORM_VI.action,
      className: "w-28 text-right",
      render: (row) => (
        <Button asChild size="sm" variant="outline">
          <Link href={`${purchaseOrdersBasePath}/${row.id}`}>
            Xem
            <IconArrowRight className="size-4" />
          </Link>
        </Button>
      ),
    },
  ];

  const content = (
    <>
      <AppPageHeader
        eyebrow={inventoryShellCopy.moduleName}
        title={tRoute("/inventory/purchase-orders", "heading")}
        actions={
          <Button asChild disabled={suppliers.length === 0}>
            <Link href={`${purchaseOrdersBasePath}/new`}>
              <IconPlus className="size-4" />
              {poCopy.createPo}
            </Link>
          </Button>
        }
      />
      {suppliers.length === 0 ? (
        <AppSection
          tone="warning"
          title={poCopy.noSuppliersTitle}
          description={poCopy.noSuppliersDescription}
          action={
            suppliersPath ? (
              <Button asChild variant="outline">
                <Link href={suppliersPath}>{poCopy.goToSuppliers}</Link>
              </Button>
            ) : null
          }
        >
          <div />
        </AppSection>
      ) : null}

      <AppToolbar className="items-stretch sm:items-center">
        <InputGroup className="min-h-10 w-full sm:h-10 sm:flex-1">
          <InputGroupAddon>
            <IconSearch />
          </InputGroupAddon>
          <InputGroupInput
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={poCopy.searchPlaceholder}
          />
        </InputGroup>

        <Select
          value={statusFilter}
          onValueChange={(val) =>
            setStatusFilter((current) =>
              current === val ? ALL_FILTER_VALUE : val,
            )
          }
        >
          <SelectTrigger className="min-h-10 w-full sm:h-10 sm:w-44">
            <SelectValue placeholder={poCopy.statusPlaceholder} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_FILTER_VALUE}>
              {poCopy.allStatuses}
            </SelectItem>
            {PO_FILTER_KEYS.map((statusKey) => (
              <SelectItem key={statusKey} value={statusKey}>
                {tStatus(statusKey, "table")} ({statusCounts[statusKey] ?? 0})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Combobox
          value={supplierFilter}
          onValueChange={setSupplierFilter}
          options={[
            { value: ALL_FILTER_VALUE, label: poCopy.allSuppliers },
            ...suppliers.map((supplier) => ({
              value: String(supplier.id),
              label: supplier.name,
            })),
          ]}
          placeholder={poCopy.supplierRequired}
          searchPlaceholder={poCopy.supplierSearchPlaceholder}
          aria-label={poCopy.supplierFilterAria}
          triggerClassName="min-h-10 w-full sm:h-10 sm:w-48"
        />

        <Badge variant="outline" className="rounded-full">
          {filteredRows.length} / {totalCount} PO
        </Badge>
      </AppToolbar>

      <DataTable
        className="md:rounded-lg md:border"
        columns={columns}
        data={filteredRows}
        getRowKey={(row) => row.id}
        emptyTitle={
          showEmptyResults ? poCopy.emptySearchTitle : poCopy.emptyInitialTitle
        }
        emptyDescription={
          showEmptyResults
            ? poCopy.emptySearchDescription
            : poCopy.emptyInitialDescription
        }
        emptyMode={showEmptyResults ? "no-results" : "no-data"}
        mobileCardRender={(row) => (
          <PurchaseOrderCard
            row={row}
            href={`${purchaseOrdersBasePath}/${row.id}`}
          />
        )}
      />

      {hasMore ? (
        <div className="flex justify-center">
          <Button
            type="button"
            variant="outline"
            onClick={handleLoadMore}
            disabled={isPending}
          >
            {poCopy.loadMore}
          </Button>
        </div>
      ) : null}
    </>
  );

  if (embedded) {
    return <div className="flex w-full flex-col gap-3">{content}</div>;
  }

  return <AppPage width="wide">{content}</AppPage>;
}

function PurchaseOrderCard({
  row,
  href,
}: {
  row: PurchaseOrderRow;
  href: string;
}) {
  return (
    <InteractiveCard asChild minHeight="mobile" padding="default">
      <Link href={href} className="min-w-0">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="font-mono text-sm font-semibold">
            {row.display_id ?? row.po_number}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {row.suppliers?.name ?? poCopy.supplierFallback}
          </p>
          <p className="text-xs text-muted-foreground">
            {poCopy.orderedDatePrefix}:{" "}
            <span title={formatRelative(row.ordered_at)}>
              {formatDate(row.ordered_at)}
            </span>
          </p>
          {row.notes ? (
            <p className="truncate text-xs text-muted-foreground">
              {row.notes}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <StatusBadge domain="inventory" value={row.status} size="sm" />
          <IconArrowRight className="size-4 text-muted-foreground" />
        </div>
      </Link>
    </InteractiveCard>
  );
}
