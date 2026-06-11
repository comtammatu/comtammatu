"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight as IconArrowRight,
  CircleCheck as IconCircleCheck,
  ChevronRight as IconChevronRight,
  PackagePlus as IconPackageImport,
  PackageX as IconPackageOff,
  Plus as IconPlus,
  Search as IconSearch,
  Send as IconSend,
} from "lucide-react";
import type { StaffRole } from "@comtammatu/shared/auth";
import { formatVNDate } from "@comtammatu/shared/time";
import { Button } from "@comtammatu/ui/components/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@comtammatu/ui/components/input-group";
import { cn } from "@comtammatu/ui";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import { matchesSearch } from "@lib/search";
import { fetchStockTransfers } from "../transfer-actions";
import { CreateTransferDialog } from "./create-transfer-dialog";
import type {
  BranchForTransfer,
  InventoryLocation,
} from "./create-transfer-dialog";
import type { IngredientRow } from "../page";
import { AppPage, AppPageHeader } from "@/components/surface";
import { InteractiveCard } from "../_components/interactive-card";
import { StatusBadge } from "../_components/status-badge";
import { messages } from "@lib/messages";

import { FORM_VI } from "@comtammatu/shared/messages";
export type { BranchForTransfer, InventoryLocation };

export interface TransferListRow {
  id: number;
  transfer_number: string;
  status: string;
  notes: string | null;
  vehicle_info: string | null;
  shipped_at: string | null;
  received_at: string | null;
  receive_started_at: string | null;
  from_branch_id: number;
  to_branch_id: number;
  created_at: string;
  from_branch_name: string;
  to_branch_name: string;
}

type Tab = "receive" | "dispatch" | "history";

const copy = messages.inventory.transfer;

const TAB_LABELS: Record<Tab, string> = {
  receive: copy.list.tabs.receive,
  dispatch: copy.list.tabs.dispatch,
  history: copy.list.tabs.history,
};

function classifyTransfer(
  status: string,
  viewerBranchId: number | null,
  fromId: number,
  toId: number,
  userRole: StaffRole,
): Tab {
  const receiveStates = ["in_transit", "confirmed_ship", "confirmed_receive"];
  const dispatchStates = ["draft"];
  const terminal = ["received", "cancelled", "completed"];

  if (terminal.includes(status)) return "history";
  if (receiveStates.includes(status)) {
    if (viewerBranchId != null && viewerBranchId !== toId) {
      return "history";
    }
    return "receive";
  }
  if (dispatchStates.includes(status)) {
    if (viewerBranchId != null && viewerBranchId !== fromId) return "history";
    if (userRole === "branch_manager" && fromId !== toId) return "history";
    return "dispatch";
  }
  return "history";
}

export function TransfersListClient({
  initial,
  branches,
  ingredients,
  locations,
  hqBranchId,
  userBranchId,
  userRole,
  basePath = "/inventory/transfers",
  initialCreateOpen = false,
}: {
  initial: TransferListRow[];
  branches: BranchForTransfer[];
  ingredients: IngredientRow[];
  locations: InventoryLocation[];
  hqBranchId: number | null;
  userBranchId: number | null;
  userRole: StaffRole;
  basePath?: string;
  initialCreateOpen?: boolean;
}) {
  const router = useRouter();
  const isBranchManager = userRole === "branch_manager";
  const userBranchKind =
    userBranchId == null
      ? null
      : (branches.find((branch) => branch.id === userBranchId)?.branch_kind ??
        null);
  const canCreateInternal =
    userBranchId != null &&
    userBranchKind === "branch" &&
    locations.length >= 2;
  const canCreateOutbound =
    !isBranchManager &&
    branches.length >= 2 &&
    ((userBranchId == null && hqBranchId != null) ||
      userBranchKind === "central_warehouse" ||
      userBranchKind === "central_kitchen");
  const canCreate = isBranchManager
    ? canCreateInternal
    : canCreateOutbound || canCreateInternal;
  const [rows, setRows] = useState(initial);
  const [open, setOpen] = useState(() => initialCreateOpen && canCreate);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<Tab>("receive");

  const createLabel = isBranchManager
    ? copy.createKitchenShort
    : copy.createSlip;
  const pageTitle = isBranchManager
    ? copy.receiveKitchenTitle
    : copy.internalTransferTitle;
  const tabLabels: Record<Tab, string> = isBranchManager
    ? {
        receive: copy.list.tabs.receive,
        dispatch: copy.list.tabs.kitchen,
        history: copy.list.tabs.history,
      }
    : TAB_LABELS;

  const tabGroups = useMemo(() => {
    const groups: Record<Tab, TransferListRow[]> = {
      receive: [],
      dispatch: [],
      history: [],
    };
    for (const r of rows) {
      const tab = classifyTransfer(
        r.status,
        userBranchId,
        r.from_branch_id,
        r.to_branch_id,
        userRole,
      );
      groups[tab].push(r);
    }
    return groups;
  }, [rows, userBranchId, userRole]);

  const tabCounts = useMemo(
    () => ({
      receive: tabGroups.receive.length,
      dispatch: tabGroups.dispatch.length,
      history: tabGroups.history.length,
    }),
    [tabGroups],
  );

  // One filtering model for every breakpoint: the job-based tabs
  // (Nhận / Chuyển / Lịch sử). The desktop-only status Select duplicated
  // the lifecycle with a second vocabulary and is retired.
  const searchFiltered = useMemo(() => {
    let list = tabGroups[activeTab];
    const q = search.trim();
    if (q) {
      list = list.filter((r) =>
        matchesSearch(
          [r.transfer_number, r.from_branch_name, r.to_branch_name],
          q,
        ),
      );
    }
    return list;
  }, [tabGroups, activeTab, search]);

  function handleCreated(id: number) {
    fetchStockTransfers(userBranchId ?? undefined).then((res) => {
      if (res.success) setRows((res.data ?? []) as TransferListRow[]);
    });
    router.push(detailHref(id));
  }

  function detailHref(id: number): string {
    const scopeQuery = userBranchId != null ? `?branchId=${userBranchId}` : "";
    return `${basePath}/${id}${scopeQuery}`;
  }

  const emptyIcon =
    activeTab === "receive" ? (
      <IconPackageImport />
    ) : activeTab === "dispatch" ? (
      <IconSend />
    ) : (
      <IconPackageOff />
    );
  const emptyTitle = search
    ? copy.list.noTransfersFound
    : activeTab === "receive"
      ? copy.list.noReceiveTransfers
      : activeTab === "dispatch"
        ? copy.list.noDispatchTransfers
        : copy.list.noHistory;
  const emptyDescription = search
    ? copy.list.searchEmptyHint
    : activeTab === "receive"
      ? copy.list.receiveEmptyHint
      : activeTab === "dispatch"
        ? copy.list.dispatchEmptyHint
        : copy.list.historyEmptyHint;

  const columns: DataTableColumn<TransferListRow>[] = [
    {
      key: "transfer_number",
      header: copy.list.transferNumber,
      className: "font-medium",
      render: (r) => r.transfer_number,
    },
    {
      key: "route",
      header: copy.list.route,
      render: (r) => (
        <div className="flex items-center gap-1.5 text-sm">
          <span>{r.from_branch_name}</span>
          <IconArrowRight className="size-3 text-muted-foreground" />
          <span>{r.to_branch_name}</span>
        </div>
      ),
    },
    {
      key: "status",
      header: FORM_VI.status,
      render: (r) => <StatusBadge status={r.status} size="sm" />,
    },
    {
      key: "created_at",
      header: copy.list.createdAt,
      className: "text-sm text-muted-foreground",
      render: (r) => formatVNDate(r.created_at),
    },
    {
      key: "movement",
      header: copy.list.shippedReceivedAt,
      className: "text-sm text-muted-foreground",
      render: (r) =>
        r.shipped_at
          ? `Xuất: ${formatVNDate(r.shipped_at)}`
          : r.received_at
            ? `Nhận: ${formatVNDate(r.received_at)}`
            : "—",
    },
    {
      key: "open",
      header: "",
      className: "w-10",
      render: (r) => (
        <Button variant="ghost" size="icon-sm" asChild>
          <Link href={detailHref(r.id)}>
            <IconArrowRight className="size-4" />
          </Link>
        </Button>
      ),
    },
  ];

  return (
    <AppPage>
      <AppPageHeader
        eyebrow="Kho hàng"
        title={pageTitle}
        actions={
          canCreate ? (
            <Button size="sm" onClick={() => setOpen(true)}>
              <IconPlus className="size-4" />
              {createLabel}
            </Button>
          ) : undefined
        }
      />
      <nav className="grid grid-cols-3 gap-1 rounded-md border bg-muted/30 p-1">
        {(Object.keys(tabLabels) as Tab[]).map((tab) => {
          const active = tab === activeTab;
          return (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={cn(
                "flex items-center justify-center rounded-lg px-2 py-2.5 text-xs font-semibold transition",
                active
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {tabLabels[tab]}
              {tabCounts[tab] > 0 && (
                <span
                  className={cn(
                    "ml-1.5 rounded-full px-1.5 py-0.5 text-xs tabular-nums",
                    active
                      ? "bg-primary/15 text-primary"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {tabCounts[tab]}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <InputGroup className="h-10">
        <InputGroupAddon>
          <IconSearch />
        </InputGroupAddon>
        <InputGroupInput
          type="search"
          placeholder={copy.list.searchPlaceholder}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <InputGroupAddon align="inline-end">
          <InputGroupText>
            {searchFiltered.length} / {rows.length}
          </InputGroupText>
        </InputGroupAddon>
      </InputGroup>

      <DataTable
        className="md:rounded-md md:border"
        columns={columns}
        data={searchFiltered}
        getRowKey={(r) => r.id}
        emptyTitle={emptyTitle}
        emptyDescription={emptyDescription}
        emptyMode={search ? "no-results" : "no-data"}
        emptyIcon={emptyIcon}
        mobileCardRender={(r) => (
          <MobileTransferCard row={r} tab={activeTab} href={detailHref(r.id)} />
        )}
      />

      <CreateTransferDialog
        open={open}
        onOpenChange={setOpen}
        branches={branches}
        ingredients={ingredients}
        locations={locations}
        hqBranchId={hqBranchId}
        userBranchId={userBranchId}
        userRole={userRole}
        onCreated={handleCreated}
      />
    </AppPage>
  );
}

// ─── Mobile card sub-component ────────────────────────────────────────

function MobileTransferCard({
  row,
  tab,
  href,
}: {
  row: TransferListRow;
  tab: Tab;
  href: string;
}) {
  const Icon =
    tab === "receive"
      ? IconPackageImport
      : tab === "dispatch"
        ? IconSend
        : IconCircleCheck;

  return (
    <InteractiveCard asChild minHeight="mobile" className="h-auto">
      <Link href={href}>
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate font-mono text-sm font-semibold">
              {row.transfer_number}
            </p>
            <StatusBadge status={row.status} size="sm" />
          </div>
          <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
            <span className="truncate">{row.from_branch_name}</span>
            <IconArrowRight className="size-3 shrink-0" />
            <span className="truncate">{row.to_branch_name}</span>
          </p>
          {(row.shipped_at || row.created_at) && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {formatVNDate(row.shipped_at ?? row.created_at)}
            </p>
          )}
        </div>
        <IconChevronRight className="size-4 shrink-0 text-muted-foreground" />
      </Link>
    </InteractiveCard>
  );
}
