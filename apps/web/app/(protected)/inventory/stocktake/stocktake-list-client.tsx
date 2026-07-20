/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: operator UI */
"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight as IconArrowRight,
  ClipboardCheck as IconClipboardCheck,
  EllipsisVertical as IconDotsVertical,
  Search as IconSearch,
} from "lucide-react";
import type { StaffRole } from "@comtammatu/shared/auth";
import { formatVNDate } from "@comtammatu/shared/time";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { confirm } from "@comtammatu/ui/components/confirm-dialog";
import { useLongPress } from "@lib/hooks/use-long-press";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@comtammatu/ui/components/drawer";
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
import { AppPage, AppPageHeader, AppToolbar } from "@/components/surface";
import { OperatorFlowSteps } from "../_components/operator-flow-steps";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import { StatusBadge } from "@/components/status-badge";
import { InteractiveCard } from "@/components/data-table/interactive-card";
import { Ban as IconBan } from "lucide-react";

import { ACTIONS_VI, BRANCH_VI, FORM_VI } from "@comtammatu/shared/messages";

export interface StocktakeSessionRow {
  id: number;
  branch_id: number;
  started_at: string | null;
  completed_at: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  created_by: string;
  branches: { id: number; name: string } | null;
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

function StocktakeSessionCard({
  row,
  routeBase,
  onOpenDrawer,
}: {
  row: StocktakeSessionRow;
  routeBase: string;
  onOpenDrawer: (row: StocktakeSessionRow) => void;
}) {
  const router = useRouter();

  const longPress = useLongPress({
    onLongPress: () => onOpenDrawer(row),
    onClick: () =>
      router.push(`${routeBase}/${row.id}?branchId=${row.branch_id}`),
  });

  return (
    <InteractiveCard
      minHeight="mobile"
      padding="default"
      className="flex-col items-stretch touch-pan-y select-none cursor-pointer"
      {...longPress}
    >
      <div className="flex items-center gap-2">
        <span className="flex-1 font-mono text-sm font-medium pointer-events-none">
          KK-{row.id}
        </span>
        <span className="pointer-events-none">
          <StatusBadge domain="inventory" value={row.status} />
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon-touch"
          aria-label={`${FORM_VI.action} KK-${row.id}`}
          onClick={() => onOpenDrawer(row)}
        >
          <IconDotsVertical />
        </Button>
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground pointer-events-none">
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
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const branchQuery = userBranchId != null ? `?branchId=${userBranchId}` : "";
  const [drawerRow, setDrawerRow] = useState<StocktakeSessionRow | null>(null);
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
      setDrawerRow(null);
      router.refresh();
    });
  }

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
        matchesSearch([`KK-${r.id}`, r.branches?.name], q),
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
      render: (r) => `KK-${r.id}`,
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
      key: "details",
      header: "",
      className: "w-10",
      render: (r) => (
        <Button
          variant="ghost"
          size="icon-lg"
          aria-label={messages.inventory.stocktake.detailsAria}
          render={
            <Link href={`${routeBase}/${r.id}?branchId=${r.branch_id}`} />
          }
        >
          <IconArrowRight className="size-4" />
        </Button>
      ),
    },
  ];

  const stocktakeActions = (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size={embedded ? "touch" : "default"}
        render={<Link href={`${routeBase}/new${branchQuery}`} />}
      >
        <IconClipboardCheck className="size-4" />
        {messages.inventory.stocktake.openSession}
      </Button>
    </div>
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
        stocktakeActions
      ) : (
        <AppPageHeader
          eyebrow={messages.inventory.shell.moduleName}
          title={messages.inventory.stocktake.title}
          actions={stocktakeActions}
        />
      )}
      {/* Filters */}
      <AppToolbar variant={embedded ? "inline" : "card"}>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger
            size={embedded ? "touch" : "default"}
            className={embedded ? "w-full" : "min-w-44"}
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

        <InputGroup className="h-12 flex-1 basis-full sm:h-10 sm:basis-auto">
          <InputGroupAddon>
            <IconSearch />
          </InputGroupAddon>
          <InputGroupInput
            placeholder={messages.inventory.stocktake.searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            inputMode="search"
          />
        </InputGroup>

        {rows.length > 0 ? (
          <Badge variant="outline" className="rounded-full">
            {filtered.length}/{rows.length}
          </Badge>
        ) : null}
      </AppToolbar>

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
          isFiltered ? undefined : messages.inventory.stocktake.noSessionsHint
        }
        emptyMode={isFiltered ? "no-results" : "no-data"}
        emptyIcon={<IconClipboardCheck />}
        mobileCardRender={(r) => (
          <StocktakeSessionCard
            row={r}
            routeBase={routeBase}
            onOpenDrawer={setDrawerRow}
          />
        )}
      />
      <Drawer
        open={!!drawerRow}
        onOpenChange={(open) => !open && setDrawerRow(null)}
      >
        <DrawerContent>
          {drawerRow && (
            <>
              <DrawerHeader>
                <DrawerTitle>KK-{drawerRow.id}</DrawerTitle>
                <DrawerDescription>
                  {drawerRow.branches?.name ?? "—"}
                </DrawerDescription>
              </DrawerHeader>
              <div className="p-4 flex flex-col gap-3">
                <Button
                  variant="default"
                  className="w-full"
                  onClick={() =>
                    router.push(
                      `${routeBase}/${drawerRow.id}?branchId=${drawerRow.branch_id}`,
                    )
                  }
                >
                  Xem chi tiết
                </Button>
                {drawerRow.status === "in_progress" && (
                  <Button
                    variant="destructive"
                    className="w-full"
                    disabled={isPending}
                    onClick={() => handleCancelSession(drawerRow.id)}
                  >
                    <IconBan className="mr-2 h-4 w-4" />
                    Hủy phiếu
                  </Button>
                )}
              </div>
            </>
          )}
        </DrawerContent>
      </Drawer>
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
