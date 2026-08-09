"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRightToLine as IconArrowBarRight,
  Ban as IconBan,
  ClipboardCheck as IconClipboardCheck,
  Search as IconSearch,
} from "lucide-react";
import type { StaffRole } from "@comtammatu/shared/auth";
import { formatVNDate } from "@comtammatu/shared/time";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { confirm } from "@/components/confirm-dialog";
import { cancelStocktake } from "../actions";
import { toast } from "@comtammatu/ui/components/sonner";

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
import { matchesSearch } from "@lib/search";
import { messages } from "@lib/messages";
import { useFormControlSize } from "@/components/form/control-size";
import {
  AppListFrame,
  AppPage,
  AppPageHeader,
  AppToolbar,
} from "@/components/surface";
import { OperatorFlowSteps } from "../_components/operator-flow-steps";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import { StatusBadge } from "@/components/status-badge";
import { InteractiveCard } from "@/components/data-table/interactive-card";
import {
  RowActionsContextMenuItems,
  RowActionsMenu,
  type RowActionItem,
} from "@/components/row-actions-menu";

import { ACTIONS_VI, BRANCH_VI, FORM_VI } from "@comtammatu/shared/messages";
import {
  inventoryListFilterSelectClassName,
} from "../_components/inventory-list-filters";

export interface StocktakeSessionRow {
  id: number;
  session_number?: string | null;
  branch_id: number;
  started_at: string | null;
  completed_at: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  created_by: string;
  branches: { id: number; name: string } | null;
}

function stocktakeCode(row: Pick<StocktakeSessionRow, "id" | "session_number">): string {
  return row.session_number?.trim() || `KK-${row.id}`;
}

export interface BranchOption {
  id: number;
  name: string;
  is_active: boolean;
}

function formatDateShort(dateStr: string | null): string {
  if (!dateStr) return "—";
  return formatVNDate(dateStr);
}

function stocktakeDetailHref(routeBase: string, row: StocktakeSessionRow): string {
  return `${routeBase}/${row.id}?branchId=${row.branch_id}`;
}

function StocktakeSessionCard({
  row,
  actions,
  onOpen,
}: {
  row: StocktakeSessionRow;
  actions: RowActionItem[];
  onOpen: (row: StocktakeSessionRow) => void;
}) {
  return (
    <InteractiveCard
      minHeight="mobile"
      padding="default"
      className="flex-col items-stretch cursor-pointer"
      role="button"
      tabIndex={0}
      onClick={() => onOpen(row)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen(row);
        }
      }}
    >
      <div className="flex items-center gap-2">
        <span className="flex-1 font-mono text-sm font-medium">
          {stocktakeCode(row)}
        </span>
        <StatusBadge domain="inventory" value={row.status} />
        <div
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <RowActionsMenu
            items={actions}
            label={`${FORM_VI.action} ${stocktakeCode(row)}`}
            triggerSize="icon-touch"
          />
        </div>
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{row.branches?.name ?? "—"}</span>
        <span className="tabular-nums">
          {formatDateShort(row.started_at ?? row.created_at)}
        </span>
      </div>
    </InteractiveCard>
  );
}

export function StocktakeListClient({
  initial,
  userRole: _userRole,
  userBranchId,
  routeBase = "/inventory/stocktake",
  embedded = false,
}: {
  initial: StocktakeSessionRow[];
  branches: BranchOption[];
  userRole: StaffRole;
  userBranchId: number | null;
  routeBase?: string;
  embedded?: boolean;
}) {
  const controlSize = useFormControlSize(embedded ? "touch" : "responsive");
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [openActionRowId, setOpenActionRowId] = useState<number | null>(null);
  const branchQuery = userBranchId != null ? `?branchId=${userBranchId}` : "";
  const [isPending, startTransition] = useTransition();

  async function handleCancelSession(id: number) {
    const ok = await confirm({
      title: "Hủy phiếu kiểm kê?",
      description:
        "Phiếu đang đếm sẽ chuyển sang trạng thái đã hủy và không thể hoàn tất.",
      confirmText: "Hủy phiếu",
      cancelText: ACTIONS_VI.cancel,
      variant: "destructive",
    });
    if (!ok) return;
    startTransition(async () => {
      const res = await cancelStocktake(id);
      if (!res.success) {
        toast.error(res.error ?? "Hủy phiếu thất bại");
        return;
      }
      toast.success("Hủy phiếu thành công");
      router.refresh();
    });
  }

  const openStocktakeDetail = (row: StocktakeSessionRow) => {
    router.push(stocktakeDetailHref(routeBase, row));
  };

  const getStocktakeRowActions = (
    row: StocktakeSessionRow,
  ): RowActionItem[] => {
    const items: RowActionItem[] = [
      {
        key: "view",
        label: ACTIONS_VI.viewDetails,
        icon: <IconArrowBarRight />,
        href: stocktakeDetailHref(routeBase, row),
      },
    ];

    if (row.status === "in_progress") {
      items.push({
        key: "cancel",
        label: "Hủy phiếu",
        icon: <IconBan />,
        destructive: true,
        disabled: isPending,
        separatorBefore: true,
        onSelect: () => {
          void handleCancelSession(row.id);
        },
      });
    }

    return items;
  };

  useEffect(() => {
    setRows(initial);
  }, [initial]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of rows) {
      counts[r.status] = (counts[r.status] ?? 0) + 1;
    }
    return counts;
  }, [rows]);

  const filtered = useMemo(() => {
    let list = rows;
    if (statusFilter !== "all") {
      list = list.filter((r) => r.status === statusFilter);
    }
    const q = search.trim();
    if (q) {
      list = list.filter((r) =>
        matchesSearch([stocktakeCode(r), r.branches?.name], q),
      );
    }
    return list;
  }, [rows, search, statusFilter]);

  const isFiltered = Boolean(search) || statusFilter !== "all";
  const operatorFlow = messages.inventory.operatorFlow;

  const columns: DataTableColumn<StocktakeSessionRow>[] = [
    {
      key: "code",
      header: messages.inventory.stocktake.sessionCode,
      className: "font-mono text-sm font-medium",
      render: (r) => stocktakeCode(r),
    },
    {
      key: "branch",
      header: BRANCH_VI.long,
      className: "text-sm",
      render: (r) => r.branches?.name ?? "—",
    },
    {
      key: "started",
      header: messages.inventory.stocktake.startedAt,
      className: "text-sm font-mono tabular-nums text-muted-foreground",
      render: (r) => formatDateShort(r.started_at ?? r.created_at),
    },
    {
      key: "status",
      header: FORM_VI.status,
      render: (r) => <StatusBadge domain="inventory" value={r.status} />,
    },
    {
      key: "actions",
      header: <span className="sr-only">{FORM_VI.action}</span>,
      className: "w-10 text-right",
      render: (r) => {
        const items = getStocktakeRowActions(r);
        return (
          <div
            className="flex justify-end"
            onClick={(event) => event.stopPropagation()}
          >
            <RowActionsMenu
              items={items}
              label={messages.inventory.stocktake.detailsAria}
              triggerSize="icon-sm"
              open={openActionRowId === r.id}
              onOpenChange={(open) =>
                setOpenActionRowId(open ? r.id : null)
              }
            />
          </div>
        );
      },
    },
  ];

  const stocktakeAction = (
    <Button
      type="button"
      size={embedded ? "touch" : "lg"}
      render={<Link href={`${routeBase}/new${branchQuery}`} />}
    >
      <IconClipboardCheck className="size-4" />
      {messages.inventory.stocktake.openSession}
    </Button>
  );

  const content = (
    <>
      {embedded ? (
        <OperatorFlowSteps
          title={operatorFlow.stocktakeListTitle}
          description={operatorFlow.stocktakeListDescription}
          steps={operatorFlow.stocktakeSteps}
          currentStep={1}
        />
      ) : null}

      {embedded ? (
        stocktakeAction
      ) : (
        <AppPageHeader
          title={messages.inventory.stocktake.title}
          actions={stocktakeAction}
        />
      )}
      <AppListFrame
        toolbar={
          <AppToolbar
            variant="inline"
            search={
              <InputGroup size={controlSize} className="w-full">
                <InputGroupAddon>
                  <IconSearch />
                </InputGroupAddon>
                <InputGroupInput
                  type="search"
                  aria-label={messages.inventory.stocktake.searchPlaceholder}
                  placeholder={messages.inventory.stocktake.searchPlaceholder}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  inputMode="search"
                />
              </InputGroup>
            }
            filters={
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger
                  size={controlSize}
                  className={
                    controlSize === "touch"
                      ? "w-full"
                      : inventoryListFilterSelectClassName
                  }
                >
                  <SelectValue
                    placeholder={messages.inventory.stocktake.statusPlaceholder}
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    {messages.inventory.stocktake.allStatuses}
                  </SelectItem>
                  <SelectItem value="in_progress">
                    {messages.inventory.stocktake.inProgressCount(
                      statusCounts["in_progress"] ?? 0,
                    )}
                  </SelectItem>
                  <SelectItem value="completed">
                    {messages.inventory.stocktake.completedCount(
                      statusCounts["completed"] ?? 0,
                    )}
                  </SelectItem>
                  <SelectItem value="cancelled">
                    {messages.inventory.stocktake.cancelledCount(
                      statusCounts["cancelled"] ?? 0,
                    )}
                  </SelectItem>
                </SelectContent>
              </Select>
            }
            reset={
              rows.length > 0 ? (
                <Badge variant="outline" className="rounded-full">
                  {filtered.length}/{rows.length}
                </Badge>
              ) : undefined
            }
          />
        }
      >
        <DataTable
          columns={columns}
          data={filtered}
          pageSize={50}
          getRowKey={(r) => r.id}
          emptyTitle={
            isFiltered
              ? messages.inventory.stocktake.noSessionsMatched
              : messages.inventory.stocktake.noSessions
          }
          emptyDescription={
            isFiltered
              ? undefined
              : messages.inventory.stocktake.noSessionsHint
          }
          emptyMode={isFiltered ? "no-results" : "no-data"}
          emptyIcon={<IconClipboardCheck />}
          onRowClick={openStocktakeDetail}
          getRowDataState={(r) =>
            openActionRowId === r.id ? "selected" : undefined
          }
          renderRowContextMenu={(r) => (
            <RowActionsContextMenuItems items={getStocktakeRowActions(r)} />
          )}
          mobileCardRender={(r) => (
            <StocktakeSessionCard
              row={r}
              actions={getStocktakeRowActions(r)}
              onOpen={openStocktakeDetail}
            />
          )}
        />
      </AppListFrame>
    </>
  );

  if (embedded) {
    return <div className="flex w-full flex-col gap-3">{content}</div>;
  }

  return (
    <AppPage width="xwide" density="compact">
      {content}
    </AppPage>
  );
}
