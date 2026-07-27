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
import { Button } from "@comtammatu/ui/components/button";
import { useFormControlSize } from "@/components/form/control-size";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@comtammatu/ui/components/input-group";
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
import { matchesSearch } from "@lib/search";
import type { BranchForTransfer } from "@lib/inventory/transfer-create-model";
import {
  AppPage,
  AppPageHeader,
  AppToolbar,
} from "@/components/surface";
import { InteractiveCard } from "@/components/data-table/interactive-card";
import { StatusBadge } from "@/components/status-badge";
import { messages } from "@lib/messages";
import {
  classifyTransfer,
  compareTransferQueue,
  type TransferListRow,
  type TransferTab,
} from "./transfer-list-model";
import {
  InventoryListFrame,
  inventoryListFilterSelectWideClassName,
} from "../_components/inventory-list-frame";

import { ACTIONS_VI, FORM_VI } from "@comtammatu/shared/messages";
export type { BranchForTransfer };
export type { TransferListRow, TransferTab };

const copy = messages.inventory.transfer;

const shippedLabelPrefix = "Xuất: ";
const receivedLabelPrefix = "Nhận: ";

const TAB_LABELS: Record<TransferTab, string> = {
  receive: copy.list.tabs.receive,
  dispatch: copy.list.tabs.dispatch,
  history: copy.list.tabs.history,
};

export function TransfersListClient({
  initial,
  branches,
  userBranchId,
  userRole,
  basePath = "/inventory/transfers",
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
  createEnabled?: boolean;
  initialTab?: TransferTab;
  pageTitle?: string;
  embedded?: boolean;
}) {
  const controlSize = useFormControlSize(embedded ? "touch" : "responsive");
  const isOwner = userRole === "owner";
  const userBranchKind =
    userBranchId == null
      ? null
      : (branches.find((branch) => branch.id === userBranchId)?.branch_kind ??
        null);
  const canCreateOutbound =
    isOwner &&
    userBranchId != null &&
    (userBranchKind === "branch" ||
      userBranchKind === "central_supply" ||
      userBranchKind === "central_kitchen") &&
    branches.length >= 2;
  const canCreate = createEnabled && canCreateOutbound;
  const rows = initial;
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<TransferTab>(initialTab);

  const createLabel = copy.createSlip;
  const pageTitle = pageTitleOverride ?? copy.internalTransferTitle;
  const tabLabels: Record<TransferTab, string> = TAB_LABELS;
  const createHref =
    userBranchId == null
      ? `${basePath}/new`
      : `${basePath}/new?branchId=${userBranchId}`;

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
      className: "min-w-36",
      render: (r) => (
        <span className="font-mono tabular-nums">{r.transfer_number}</span>
      ),
    },
    {
      key: "route",
      header: copy.list.route,
      render: (r) => (
        <div className="flex items-center gap-1.5">
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
      render: (r) => (
        <span className="font-mono tabular-nums text-muted-foreground">
          {formatVNDate(r.created_at)}
        </span>
      ),
    },
    {
      key: "movement",
      header: copy.list.shippedReceivedAt,
      render: (r) =>
        r.shipped_at
          ? `${shippedLabelPrefix}${formatVNDate(r.shipped_at)}`
          : r.received_at
            ? `${receivedLabelPrefix}${formatVNDate(r.received_at)}`
            : "—",
    },
    {
      key: "open",
      header: "",
      className: "w-10",
      render: (r) => (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`${ACTIONS_VI.viewDetails} ${r.transfer_number}`}
          render={<Link href={detailHref(r.id)} />}
        >
          <IconArrowRight className="size-4" />
        </Button>
      ),
    },
  ];

  const desktopCreateAction = canCreate ? (
    <Button
      size={embedded ? controlSize : "lg"}
      render={<Link href={createHref} />}
    >
      <IconPlus data-icon="inline-start" />
      {createLabel}
    </Button>
  ) : null;

  const desktopToolbar = (
    <AppToolbar
      variant="inline"
      className="items-stretch sm:items-center"
      search={
        <InputGroup size={controlSize} className="w-full sm:flex-1">
          <InputGroupAddon>
            <IconSearch />
          </InputGroupAddon>
          <InputGroupInput
            type="search"
            aria-label={copy.list.searchPlaceholder}
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
      }
      filters={
        <Select
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as TransferTab)}
        >
          <SelectTrigger
            size={controlSize}
            className={
              controlSize === "touch"
                ? "w-full"
                : inventoryListFilterSelectWideClassName
            }
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(tabLabels) as TransferTab[]).map((tab) => (
              <SelectItem key={tab} value={tab}>
                {tabLabels[tab]} ({tabCounts[tab]})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
      actions={embedded ? desktopCreateAction : null}
    />
  );

  const desktopTable = (
    <DataTable
      columns={columns}
      data={searchFiltered}
      pageSize={50}
      getRowKey={(r) => r.id}
      emptyTitle={emptyTitle}
      emptyDescription={emptyDescription}
      emptyMode={search ? "no-results" : "no-data"}
      emptyIcon={emptyIcon}
      mobileCardRender={(r) => (
        <MobileTransferCard row={r} tab={activeTab} href={detailHref(r.id)} />
      )}
    />
  );
  const desktopList = (
    <InventoryListFrame toolbar={desktopToolbar}>
      {desktopTable}
    </InventoryListFrame>
  );

  if (embedded) {
    return <div className="flex w-full flex-col gap-3">{desktopList}</div>;
  }

  return (
    <AppPage width="xwide" density="compact">
      <AppPageHeader
        eyebrow={messages.inventory.shell.moduleName}
        title={pageTitle}
        actions={desktopCreateAction}
      />
      {desktopList}
    </AppPage>
  );
}

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
    <InteractiveCard
      render={<Link href={href} />}
      minHeight="mobile"
      className="h-auto touch-manipulation cursor-pointer"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary pointer-events-none">
        <Icon className="size-5" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1 pointer-events-none">
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
      <IconChevronRight className="size-4 shrink-0 text-muted-foreground pointer-events-none" />
    </InteractiveCard>
  );
}
