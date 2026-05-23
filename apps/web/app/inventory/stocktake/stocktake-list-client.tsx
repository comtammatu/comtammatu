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
import { Card, CardContent } from "@comtammatu/ui/components/card";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
import { toast } from "@comtammatu/ui/components/sonner";
import { cn } from "@comtammatu/ui";
import { useIsMobile } from "@comtammatu/ui/hooks/use-mobile";
import { matchesSearch } from "@lib/search";
import { messages } from "@lib/messages";
import {
  AppEmptyState,
  AppPage,
  AppPageHeader,
  AppToolbar,
} from "@/components/surface";
import { StatusBadge } from "../_components/status-badge";
import { InteractiveCard } from "../_components/interactive-card";
import { TableEmptyStateRow } from "../_components/table-empty-state-row";
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

  return (
    <AppPage width={isMobile ? "narrow" : "wide"}>
      <AppPageHeader
        eyebrow="Kho hàng"
        title={messages.inventory.stocktake.title}
        actions={
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" asChild>
              {/* S13a pilot entry. Route is feature-flag gated server-side —
                  non-pilot branches redirect to list with error=stocktake_v2_not_enabled. */}
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

      {/* Content */}
      {isMobile ? (
        <div className="flex flex-col gap-2">
          {filtered.length === 0 ? (
            <AppEmptyState
              mode={search || statusFilter !== "all" ? "no-results" : "no-data"}
              title={
                search || statusFilter !== "all"
                  ? messages.inventory.stocktake.noSessionsMatched
                  : messages.inventory.stocktake.noSessions
              }
              description={
                search || statusFilter !== "all"
                  ? undefined
                  : messages.inventory.stocktake.noSessionsHint
              }
            />
          ) : (
            filtered.map((r) => (
              <InteractiveCard
                key={r.id}
                minHeight="mobile"
                padding="default"
                asChild
              >
                <Link
                  href={`${routeBase}/${r.id}?branchId=${r.branch_id}`}
                  className="flex-col items-stretch gap-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-sm font-medium">
                      KK-{r.id}
                    </span>
                    <StatusBadge status={r.status} />
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{r.branches?.name ?? "—"}</span>
                    <span className="tabular-nums">
                      {formatDateShort(r.started_at ?? r.created_at)}
                    </span>
                  </div>
                </Link>
              </InteractiveCard>
            ))
          )}
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    {messages.inventory.stocktake.sessionCode}
                  </TableHead>
                  <TableHead>{BRANCH_VI.long}</TableHead>
                  <TableHead>
                    {messages.inventory.stocktake.startedAt}
                  </TableHead>
                  <TableHead>{FORM_VI.status}</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableEmptyStateRow
                    colSpan={5}
                    paddingClassName="py-16"
                    icon={
                      <IconClipboardCheck className="mx-auto size-10 text-muted-foreground/40" />
                    }
                    title={
                      search || statusFilter !== "all"
                        ? messages.inventory.stocktake.noSessionsMatched
                        : messages.inventory.stocktake.noSessions
                    }
                    description={
                      search || statusFilter !== "all"
                        ? undefined
                        : messages.inventory.stocktake.noSessionsHint
                    }
                  />
                ) : null}
                {filtered.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-sm font-medium">
                      KK-{r.id}
                    </TableCell>
                    <TableCell className="text-sm">
                      {r.branches?.name ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm tabular-nums text-muted-foreground">
                      {formatDateShort(r.started_at ?? r.created_at)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={r.status} />
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon-lg"
                        asChild
                        aria-label={messages.inventory.stocktake.detailsAria}
                      >
                        <Link
                          href={`${routeBase}/${r.id}?branchId=${r.branch_id}`}
                        >
                          <IconArrowRight className="size-4" />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {messages.inventory.stocktake.chooseBranchTitle}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
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
