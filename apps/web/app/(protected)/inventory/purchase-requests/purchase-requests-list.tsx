"use client";

import {
  ClipboardList as IconClipboardList,
  Pencil as IconPencil,
  Plus as IconPlus,
  Search as IconSearch,
  Trash as IconTrash,
} from "lucide-react";
import { ACTIONS_VI } from "@comtammatu/shared/messages";
import {
  formatVNDate,
  formatVNDateTime,
  getVNDateString,
} from "@comtammatu/shared/time";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@comtammatu/ui/components/input-group";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemHeader,
  ItemTitle,
} from "@comtammatu/ui/components/item";
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
import { useFormControlSize } from "@/components/form/control-size";
import { AppListFrame, AppToolbar } from "@/components/surface";
import {
  RowActionsMenu,
  type RowActionItem,
} from "@/components/row-actions-menu";
import {
  purchaseRequestStatusVariant,
  type PurchaseRequestRow,
} from "@lib/inventory/purchase-request-model";
import { messages } from "@lib/messages";
import { buildAutomaticPurchaseDemandAllocations } from "./purchase-order-drafts";
import { blankRequestLine } from "./purchase-request-draft-types";

const copy = messages.inventory.purchaseRequests;

export function PurchaseRequestsList({
  rows,
  branches,
  filtered,
  search,
  statusFilter,
  siteFilter,
  currentPage,
  suppliers,
  canCreateRequest,
  canAllocate,
  isPending,
  pendingId,
  onSearchChange,
  onStatusFilterChange,
  onSiteFilterChange,
  onPageChange,
  onOpenCreate,
  onOpenView,
  onOpenEdit,
  onCancelRow,
  onCloseRow,
  onSupplierDecision,
}: {
  rows: PurchaseRequestRow[];
  branches: Array<{ id: number; name: string }>;
  filtered: PurchaseRequestRow[];
  search: string;
  statusFilter: string;
  siteFilter: string;
  currentPage: number;
  suppliers: Parameters<typeof buildAutomaticPurchaseDemandAllocations>[1];
  canCreateRequest: boolean;
  canAllocate: boolean;
  isPending: boolean;
  pendingId: number | null;
  onSearchChange: (value: string) => void;
  onStatusFilterChange: (value: string) => void;
  onSiteFilterChange: (value: string) => void;
  onPageChange: (page: number) => void;
  onOpenCreate: () => void;
  onOpenView: (rowId: number) => void;
  onOpenEdit: (rowId: number) => void;
  onCancelRow: (row: PurchaseRequestRow) => void;
  onCloseRow: (row: PurchaseRequestRow) => void;
  onSupplierDecision: (row: PurchaseRequestRow) => void;
}) {
  const controlSize = useFormControlSize();

  function rowActions(row: PurchaseRequestRow): RowActionItem[] {
    const actions: RowActionItem[] = [
      {
        key: "view",
        label: ACTIONS_VI.view,
        onSelect: () => onOpenView(row.id),
      },
    ];
    if (
      canCreateRequest &&
      (row.status === "draft" ||
        row.status === "changes_requested" ||
        row.status === "pending_allocation")
    ) {
      actions.push({
        key: "edit",
        label: ACTIONS_VI.edit,
        icon: <IconPencil data-icon="inline-start" />,
        onSelect: () => onOpenEdit(row.id),
      });
    }
    if (
      canCreateRequest &&
      (row.status === "draft" || row.status === "changes_requested")
    ) {
      actions.push({
        key: "cancel",
        label: "Bỏ phiếu",
        icon: <IconTrash data-icon="inline-start" />,
        disabled: isPending || pendingId === row.id,
        onSelect: () => onCancelRow(row),
      });
    }
    if (
      canAllocate &&
      (row.status === "submitted" ||
        row.status === "pending_allocation" ||
        row.status === "partially_ordered")
    ) {
      actions.push({
        key: "allocate",
        label:
          buildAutomaticPurchaseDemandAllocations(row.items, suppliers) == null
            ? copy.allocateAction
            : copy.approveAllocationAction,
        disabled: isPending || pendingId === row.id,
        onSelect: () => onSupplierDecision(row),
      });
    }
    if (row.status === "partially_ordered" && canAllocate) {
      actions.push({
        key: "close",
        label: "Đóng phần còn lại",
        onSelect: () => onCloseRow(row),
      });
    }
    return actions;
  }

  const columns: DataTableColumn<PurchaseRequestRow>[] = [
    {
      key: "code",
      header: copy.codeColumn,
      render: (row) => (
        <span className="font-mono font-medium">{row.code}</span>
      ),
    },
    {
      key: "branch",
      header: copy.branchColumn,
      render: (row) => row.branchName,
    },
    {
      key: "status",
      header: copy.statusColumn,
      render: (row) => (
        <Badge variant={purchaseRequestStatusVariant(row.status)}>
          {copy.statusLabel(row.status)}
        </Badge>
      ),
    },
    {
      key: "needed",
      header: copy.neededByColumn,
      render: (row) => (row.neededBy ? formatVNDate(row.neededBy) : "—"),
    },
    {
      key: "progress",
      header: copy.progressColumn,
      render: (row) =>
        copy.orderedProgress(row.orderedLineCount, row.lineCount),
    },
    {
      key: "updated",
      header: copy.updatedColumn,
      render: (row) => formatVNDateTime(row.updatedAt),
    },
    {
      key: "actions",
      header: "",
      className: "w-12 text-right",
      render: (row) => (
        <div
          className="flex justify-end"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <RowActionsMenu
            items={rowActions(row)}
            label={row.code}
            triggerSize={controlSize === "touch" ? "icon-touch" : "icon"}
          />
        </div>
      ),
    },
  ];

  const hasActiveFilters = Boolean(
    search.trim() || statusFilter !== "all" || siteFilter !== "all",
  );

  return (
    <AppListFrame
      toolbar={
        <AppToolbar
          variant="inline"
          search={
            <InputGroup
              size={controlSize}
              className="min-w-0 flex-1 sm:min-w-72"
            >
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
            </InputGroup>
          }
          filters={
            <>
              <Select value={statusFilter} onValueChange={onStatusFilterChange}>
                <SelectTrigger
                  size={controlSize}
                  aria-label={copy.statusFilterAria}
                >
                  <SelectValue placeholder={copy.statusFilterPlaceholder} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{copy.allStatuses}</SelectItem>
                  {[...new Set(rows.map((row) => row.status))].map((status) => (
                    <SelectItem key={status} value={status}>
                      {copy.statusLabel(status)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {branches.length > 1 ? (
                <Select value={siteFilter} onValueChange={onSiteFilterChange}>
                  <SelectTrigger
                    size={controlSize}
                    aria-label={copy.warehouseFilterAria}
                  >
                    <SelectValue placeholder={copy.warehouseFilterPlaceholder} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{copy.allWarehouses}</SelectItem>
                    {branches.map((branch) => (
                      <SelectItem key={branch.id} value={String(branch.id)}>
                        {branch.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}
            </>
          }
          actions={
            canCreateRequest ? (
              <Button type="button" size={controlSize} onClick={onOpenCreate}>
                <IconPlus data-icon="inline-start" />
                {copy.createAction}
              </Button>
            ) : null
          }
        />
      }
    >
      <DataTable
        className="[&_table]:table-fixed"
        columns={columns}
        data={filtered}
        getRowKey={(row) => row.id}
        pageSize={50}
        currentPage={currentPage}
        onPageChange={onPageChange}
        onRowClick={(row) => onOpenView(row.id)}
        emptyTitle={
          hasActiveFilters
            ? "Không tìm thấy yêu cầu mua hàng phù hợp"
            : copy.emptyTitle
        }
        emptyDescription={
          hasActiveFilters
            ? "Thử thay đổi từ khóa tìm kiếm hoặc điều chỉnh bộ lọc."
            : copy.emptyDescription
        }
        emptyMode={hasActiveFilters ? "no-results" : "no-data"}
        emptyIcon={<IconClipboardList />}
        mobileCardRender={(row) => (
          <Item
            variant="outline"
            className="w-full text-left"
            render={<button type="button" onClick={() => onOpenView(row.id)} />}
          >
            <ItemHeader>
              <div className="flex min-w-0 items-center gap-2">
                <ItemTitle className="font-mono font-semibold">{row.code}</ItemTitle>
                <Badge variant={purchaseRequestStatusVariant(row.status)}>
                  {copy.statusLabel(row.status)}
                </Badge>
              </div>
            </ItemHeader>
            <ItemContent className="min-w-0 text-left">
              <ItemDescription className="truncate font-medium text-foreground">
                {row.branchName}
              </ItemDescription>
              <ItemDescription className="text-xs text-muted-foreground">
                {copy.lineCount(row.lineCount)} ·{" "}
                {copy.orderedProgress(row.orderedLineCount, row.lineCount)}
              </ItemDescription>
            </ItemContent>
          </Item>
        )}
      />
    </AppListFrame>
  );
}

export function buildCreateDraftState(branches: Array<{ id: number }>) {
  const nextBranchId = String(branches[0]?.id ?? "");
  const nextNeededBy = getVNDateString();
  const nextLines = [blankRequestLine()];
  return {
    branchId: nextBranchId,
    neededBy: nextNeededBy,
    requestLines: nextLines,
    baseline: JSON.stringify([nextBranchId, nextNeededBy, nextLines]),
  };
}
