"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
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
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@comtammatu/ui/components/input-group";
import { Tabs, TabsList, TabsTrigger } from "@comtammatu/ui/components/tabs";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import { matchesSearch } from "@lib/search";
import type { BranchForTransfer } from "./create-transfer-dialog";
import { AppPage, AppPageHeader } from "@/components/surface";
import { InteractiveCard } from "@/components/data-table/interactive-card";
import { StatusBadge } from "@/components/status-badge";
import { messages } from "@lib/messages";

import { FORM_VI } from "@comtammatu/shared/messages";
export type { BranchForTransfer };

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

export type TransferTab = "receive" | "dispatch" | "history";

const copy = messages.inventory.transfer;

const TAB_LABELS: Record<TransferTab, string> = {
  receive: copy.list.tabs.receive,
  dispatch: copy.list.tabs.dispatch,
  history: copy.list.tabs.history,
};

const TRANSFER_QUEUE_PRIORITY: Record<string, number> = {
  in_transit: 0,
  confirmed_ship: 1,
  confirmed_receive: 2,
  draft: 3,
  received: 20,
  completed: 21,
  cancelled: 22,
};

function compareTransferQueue(a: TransferListRow, b: TransferListRow): number {
  const aCreatedAt = Date.parse(a.created_at);
  const bCreatedAt = Date.parse(b.created_at);
  return (
    (TRANSFER_QUEUE_PRIORITY[a.status] ?? 10) -
      (TRANSFER_QUEUE_PRIORITY[b.status] ?? 10) ||
    (Number.isNaN(bCreatedAt) ? 0 : bCreatedAt) -
      (Number.isNaN(aCreatedAt) ? 0 : aCreatedAt)
  );
}

function classifyTransfer(
  status: string,
  viewerBranchId: number | null,
  fromId: number,
  toId: number,
  userRole: StaffRole,
): TransferTab {
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
    if (userRole === "branch_manager" && viewerBranchId === toId) {
      return "receive";
    }
    if (viewerBranchId != null && viewerBranchId !== fromId) return "history";
    if (userRole === "branch_manager" && fromId !== toId) return "history";
    return "dispatch";
  }
  return "history";
}

export function TransfersListClient({
  initial,
  branches,
  userBranchId,
  userRole,
  basePath = "/inventory/transfers",
  createBasePath,
  createEnabled = true,
  initialTab = "receive",
  pageTitle: pageTitleOverride,
  embedded = false,
}: {
  initial: TransferListRow[];
  branches: BranchForTransfer[];
  userBranchId: number | null;
  userRole: StaffRole;
  basePath?: string;
  createBasePath?: string;
  createEnabled?: boolean;
  initialTab?: TransferTab;
  pageTitle?: string;
  embedded?: boolean;
}) {
  const isBranchManager = userRole === "branch_manager";
  const userBranchKind =
    userBranchId == null
      ? null
      : (branches.find((branch) => branch.id === userBranchId)?.branch_kind ??
        null);
  const canCreateOutbound =
    !isBranchManager &&
    userBranchId != null &&
    (userBranchKind === "branch" ||
      userBranchKind === "central_supply" ||
      userBranchKind === "central_kitchen") &&
    branches.length >= 2;
  const canCreateInboundRequest =
    isBranchManager &&
    userBranchId != null &&
    userBranchKind === "branch" &&
    branches.some(
      (branch) =>
        branch.is_active &&
        (branch.branch_kind === "central_supply" ||
          branch.branch_kind === "central_kitchen"),
    );
  const canCreate =
    createEnabled && (canCreateOutbound || canCreateInboundRequest);
  const rows = initial;
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<TransferTab>(initialTab);

  const createLabel = isBranchManager ? "Yêu cầu hàng" : copy.createSlip;
  const pageTitle = pageTitleOverride ?? copy.internalTransferTitle;
  const tabLabels: Record<TransferTab, string> = TAB_LABELS;
  const createPathBase = createBasePath ?? basePath;
  const createHref =
    userBranchId == null
      ? `${createPathBase}/new`
      : `${createPathBase}/new?branchId=${userBranchId}`;

  const tabGroups = useMemo(() => {
    const groups: Record<TransferTab, TransferListRow[]> = {
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
    for (const tab of Object.keys(groups) as TransferTab[]) {
      groups[tab].sort(compareTransferQueue);
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
  // (Nhận / Chuyển / Lịch sử).
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
      render: (r) => (
        <StatusBadge domain="inventory" value={r.status} size="sm" />
      ),
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

  const content = (
    <>
      {embedded ? (
        canCreate ? (
          <div className="flex justify-end">
            <Button size="touch" asChild>
              <Link href={createHref}>
                <IconPlus data-icon="inline-start" />
                {createLabel}
              </Link>
            </Button>
          </div>
        ) : null
      ) : (
        <AppPageHeader
          eyebrow="Kho hàng"
          title={pageTitle}
          actions={
            canCreate ? (
              <Button size="sm" asChild>
                <Link href={createHref}>
                  <IconPlus data-icon="inline-start" />
                  {createLabel}
                </Link>
              </Button>
            ) : undefined
          }
        />
      )}
      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as TransferTab)}
      >
        <TabsList variant="toolbar" className="p-1">
          {(Object.keys(tabLabels) as TransferTab[]).map((tab) => {
            return (
              <TabsTrigger key={tab} value={tab} className="min-h-9 min-w-0">
                {tabLabels[tab]}
                {tabCounts[tab] > 0 && (
                  <Badge variant="secondary" className="ml-1.5 font-mono">
                    {tabCounts[tab]}
                  </Badge>
                )}
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>

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
    </>
  );

  if (embedded) {
    return <div className="flex w-full flex-col gap-3">{content}</div>;
  }

  return (
    <AppPage width="wide" density="compact">
      {content}
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
  tab: TransferTab;
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
        <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon className="size-5" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate font-mono text-sm font-semibold">
              {row.transfer_number}
            </p>
            <StatusBadge domain="inventory" value={row.status} size="sm" />
          </div>
          <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
            <span className="truncate">{row.from_branch_name}</span>
            <IconArrowRight className="size-3 shrink-0" />
            <span className="truncate">{row.to_branch_name}</span>
          </p>
          {(row.shipped_at || row.created_at) && (
            <p className="text-xs text-muted-foreground">
              {formatVNDate(row.shipped_at ?? row.created_at)}
            </p>
          )}
        </div>
        <IconChevronRight className="size-4 shrink-0 text-muted-foreground" />
      </Link>
    </InteractiveCard>
  );
}
