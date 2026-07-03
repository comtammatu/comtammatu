"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { z } from "zod";
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
import { FormDialog, SelectField } from "@/components/form";
import { AppPage, AppPageHeader, AppToolbar } from "@/components/surface";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import { StatusBadge } from "@/components/status-badge";
import { InteractiveCard } from "@/components/data-table/interactive-card";
import { createStocktakeSession } from "../actions";

import { ACTIONS_VI, BRANCH_VI, FORM_VI } from "@comtammatu/shared/messages";

const createStocktakeSchema = z.object({
  branchId: z.string().min(1, {
    error: messages.inventory.stocktake.selectBranch,
  }),
});

type CreateStocktakeValues = z.infer<typeof createStocktakeSchema>;

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
        className="flex-col items-stretch gap-3"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-sm font-medium">KK-{row.id}</span>
          <StatusBadge domain="inventory" value={row.status} />
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
  const [dialogOpen, setDialogOpen] = useState(false);
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

  const branchOptions = useMemo(
    () => branches.map((branch) => ({ value: String(branch.id), label: branch.name })),
    [branches],
  );

  const createDefaultValues = useMemo<CreateStocktakeValues>(
    () => ({
      branchId: userBranchId != null ? String(userBranchId) : "",
    }),
    [userBranchId],
  );

  function handleCreate() {
    setDialogOpen(true);
  }

  async function handleCreateSession(values: CreateStocktakeValues) {
    const branchId = Number(values.branchId);
    const res = await createStocktakeSession(branchId);
    if (!res.success || !res.data) {
      return {
        success: false,
        error: res.error ?? messages.inventory.stocktake.createClassicFailed,
      };
    }

    const id = (res.data as { id: number }).id;
    router.push(`${routeBase}/${id}?branchId=${branchId}`);
    return { success: true };
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

  const stocktakeActions = (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size={embedded ? "touch" : "default"}
        asChild
      >
        {/* S13a pilot entry. Route is feature-flag gated server-side —
            non-pilot branches redirect to list with error=stocktake_redesigned_not_enabled. */}
        <Link href={`${routeBase}/new${branchQuery}`}>
          <IconClipboardCheck className="size-4" />
          {messages.inventory.stocktake.v2}
        </Link>
      </Button>
      <Button
        type="button"
        size={embedded ? "touch" : "default"}
        onClick={handleCreate}
      >
        <IconPlus className="size-4" />
        {messages.inventory.stocktake.openSession}
      </Button>
    </div>
  );

  const content = (
    <>
      {embedded ? (
        stocktakeActions
      ) : (
        <AppPageHeader
          eyebrow="Kho hàng"
          title={messages.inventory.stocktake.title}
          actions={stocktakeActions}
        />
      )}
      {/* Filters */}
      <AppToolbar>
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
      <FormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={messages.inventory.stocktake.chooseBranchTitle}
        schema={createStocktakeSchema}
        defaultValues={createDefaultValues}
        entityKey={`stocktake-${createDefaultValues.branchId || "new"}`}
        onSubmit={handleCreateSession}
        successMessage={messages.inventory.stocktake.classicCreated}
        submitLabel={messages.inventory.stocktake.createClassic}
        cancelLabel={ACTIONS_VI.cancel}
        contentClassName="sm:max-w-sm"
      >
        {(form) => (
          <SelectField
            control={form.control}
            name="branchId"
            label={BRANCH_VI.long}
            options={branchOptions}
            placeholder={messages.inventory.stocktake.chooseBranchPlaceholder}
            required
          />
        )}
      </FormDialog>
    </>
  );

  if (embedded) {
    return <div className="flex w-full flex-col gap-3">{content}</div>;
  }

  return (
    <AppPage width="wide">
      {content}
    </AppPage>
  );
}
