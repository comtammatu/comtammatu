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
import { InteractiveCard } from "@comtammatu/ui/components/interactive-card";
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
      className: "w-12",
      render: (row) => (
        <div
          className="flex justify-end"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <RowActionsMenu items={rowActions(row)} label={row.code} />
        </div>
      ),
    },
  ];

  return (
    <AppListFrame
      toolbar={
        <AppToolbar
          variant="inline"
          search={
            <InputGroup className="min-w-0 flex-1 sm:min-w-72">
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
                <SelectTrigger size="field" aria-label={copy.statusFilterAria}>
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
                    size="field"
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
              <Button type="button" onClick={onOpenCreate}>
                <IconPlus data-icon="inline-start" />
                {copy.createAction}
              </Button>
            ) : null
          }
        />
      }
    >
      <DataTable
        columns={columns}
        data={filtered}
        getRowKey={(row) => row.id}
        pageSize={50}
        currentPage={currentPage}
        onPageChange={onPageChange}
        onRowClick={(row) => onOpenView(row.id)}
        emptyTitle={copy.emptyTitle}
        emptyDescription={copy.emptyDescription}
        emptyIcon={
          <IconClipboardList className="size-8 text-muted-foreground" />
        }
        mobileCardRender={(row) => (
          <InteractiveCard
            minHeight="mobile"
            padding="default"
            className="w-full flex-col items-stretch gap-2 text-left"
            render={<button type="button" />}
            onClick={() => onOpenView(row.id)}
          >
            <span className="flex items-center justify-between gap-2">
              <span className="font-mono font-semibold">{row.code}</span>
              <Badge variant={purchaseRequestStatusVariant(row.status)}>
                {copy.statusLabel(row.status)}
              </Badge>
            </span>
            <span className="text-sm">{row.branchName}</span>
            <span className="text-xs text-muted-foreground">
              {copy.lineCount(row.lineCount)} ·{" "}
              {copy.orderedProgress(row.orderedLineCount, row.lineCount)}
            </span>
          </InteractiveCard>
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
