"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight as IconArrowRight,
  ClipboardCheck as IconClipboardCheck,
  Plus as IconPlus,
  Search as IconSearch,
} from "lucide-react";
import type { StaffRole } from "@comtammatu/shared/auth";
import { formatVNDate } from "@comtammatu/shared/time";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@comtammatu/ui/components/dialog";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@comtammatu/ui/components/input-group";
import { Label } from "@comtammatu/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { toast } from "@comtammatu/ui/components/sonner";
import { cn } from "@comtammatu/ui";
import { useIsMobile } from "@comtammatu/ui/hooks/use-mobile";
import { matchesSearch } from "@lib/search";
import { messages } from "@lib/messages";
import { AppPage, AppPageHeader, AppToolbar } from "@/components/surface";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import { StatusBadge } from "../_components/status-badge";
import { InteractiveCard } from "../_components/interactive-card";
import { createStocktakeSession, fetchStocktakeSessions } from "../actions";

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
}: {
  row: StocktakeSessionRow;
  routeBase: string;
}) {
  return (
    <InteractiveCard minHeight="mobile" padding="default" asChild>
      <Link
        href={`${routeBase}/${row.id}?branchId=${row.branch_id}`}
        className="flex-col items-stretch gap-2"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-sm font-medium">KK-{row.id}</span>
          <StatusBadge status={row.status} />
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{row.branches?.name ?? "—"}</span>
          <span className="tabular-nums">
            {formatDateShort(row.started_at ?? row.created_at)}
          </span>
        </div>
      </Link>
    </InteractiveCard>
  );
}

export function StocktakeListClient({
  initial,
  branches,
  userRole: _userRole,
  userBranchId,
  routeBase = "/inventory/stocktake",
}: {
  initial: StocktakeSessionRow[];
  branches: BranchOption[];
  userRole: StaffRole;
  userBranchId: number | null;
  routeBase?: string;
}) {
  const router = useRouter();
  const isMobile = useIsMobile();
  const [rows, setRows] = useState(initial);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [isPending, startTransition] = useTransition();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedBranchId, setSelectedBranchId] = useState("");
  const branchQuery = userBranchId != null ? `?branchId=${userBranchId}` : "";

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

  function handleCreate() {
    setSelectedBranchId(userBranchId != null ? String(userBranchId) : "");
    setDialogOpen(true);
  }

  function doCreate(branchId: number) {
    startTransition(async () => {
      const res = await createStocktakeSession(branchId);
      if (!res.success) {
        toast.error(
          res.error ?? messages.inventory.stocktake.createClassicFailed,
        );
        return;
      }
      toast.success(messages.inventory.stocktake.classicCreated);
      setDialogOpen(false);
      const again = await fetchStocktakeSessions(branchId);
      if (again.success) setRows((again.data ?? []) as StocktakeSessionRow[]);
      const id = (res.data as { id: number }).id;
      router.push(`${routeBase}/${id}?branchId=${branchId}`);
    });
  }

  function handleDialogConfirm() {
    const bid = Number(selectedBranchId);
    if (!bid) {
      toast.error(messages.inventory.stocktake.selectBranch);
      return;
    }
    doCreate(bid);
  }

  const isFiltered = Boolean(search) || statusFilter !== "all";

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
      render: (r) => <StatusBadge status={r.status} />,
    },
    {
      key: "details",
      header: "",
      className: "w-10",
      render: (r) => (
        <Button
          variant="ghost"
          size="icon-lg"
          asChild
          aria-label={messages.inventory.stocktake.detailsAria}
        >
          <Link href={`${routeBase}/${r.id}?branchId=${r.branch_id}`}>
            <IconArrowRight className="size-4" />
          </Link>
        </Button>
      ),
    },
  ];

  return (
    <AppPage width={isMobile ? "narrow" : "wide"}>
      <AppPageHeader
        eyebrow="Kho hàng"
        title={messages.inventory.stocktake.title}
        actions={
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" asChild>
              {/* S13a pilot entry. Route is feature-flag gated server-side —
                  non-pilot branches redirect to list with error=stocktake_redesigned_not_enabled. */}
              <Link href={`${routeBase}/new${branchQuery}`}>
                <IconClipboardCheck className="size-4" />
                {messages.inventory.stocktake.v2}
              </Link>
            </Button>
            <Button type="button" onClick={handleCreate} disabled={isPending}>
              <IconPlus className="size-4" />
              {messages.inventory.stocktake.openSession}
            </Button>
          </div>
        }
      />
      {/* Filters */}
      <AppToolbar>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="min-w-44">
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

        <InputGroup className={cn("flex-1", isMobile && "h-12 basis-full")}>
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
          <StocktakeSessionCard row={r} routeBase={routeBase} />
        )}
      />
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {messages.inventory.stocktake.chooseBranchTitle}
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <Label htmlFor="branch-select">{BRANCH_VI.long}</Label>
            <Select
              value={selectedBranchId}
              onValueChange={setSelectedBranchId}
            >
              <SelectTrigger id="branch-select">
                <SelectValue
                  placeholder={
                    messages.inventory.stocktake.chooseBranchPlaceholder
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {branches.map((b) => (
                  <SelectItem key={b.id} value={String(b.id)}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={isPending}
            >
              {ACTIONS_VI.cancel}
            </Button>
            <Button
              onClick={handleDialogConfirm}
              disabled={isPending || !selectedBranchId}
            >
              {isPending
                ? messages.inventory.stocktake.creatingClassic
                : messages.inventory.stocktake.createClassic}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppPage>
  );
}
