/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: operator UI */
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
  AppEmptyState,
  AppPage,
  AppPageHeader,
  AppSection,
  AppToolbar,
} from "@/components/surface";
import { InteractiveCard } from "@/components/data-table/interactive-card";
import { ItemGroup } from "@comtammatu/ui/components/item";
import { useLongPress } from "@lib/hooks/use-long-press";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@comtammatu/ui/components/drawer";
import { StatusBadge } from "@/components/status-badge";
import { OperatorFlowSteps } from "../_components/operator-flow-steps";
import { messages } from "@lib/messages";
import {
  classifyTransfer,
  compareTransferQueue,
  type TransferListRow,
  type TransferTab,
} from "@lib/inventory/transfer-list-model";

import { ACTIONS_VI, FORM_VI, INVENTORY_VI } from "@comtammatu/shared/messages";
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
  createBasePath,
  supplierGrnBasePath,
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
  supplierGrnBasePath?: string;
  createEnabled?: boolean;
  initialTab?: TransferTab;
  pageTitle?: string;
  embedded?: boolean;
}) {
  const isOperator = basePath.startsWith("/br/");
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
  const [drawerRow, setDrawerRow] = useState<TransferListRow | null>(null);
  const router = useRouter();

  const createLabel = isBranchManager ? copy.requestGoods : copy.createSlip;
  const pageTitle = pageTitleOverride ?? copy.internalTransferTitle;
  const tabLabels: Record<TransferTab, string> = TAB_LABELS;
  const createPathBase = createBasePath ?? basePath;
  const operatorFlow = messages.inventory.operatorFlow;
  const createHref =
    userBranchId == null
      ? `${createPathBase}/new`
      : `${createPathBase}/new?branchId=${userBranchId}`;

  // Branch operators receive directly from a supplier (GRN) in addition to
  // requesting stock from a central site (D068). Surfaced only when the route
  // provides the GRN base path (the branch "Nhận hàng" hub).
  const canReceiveSupplier =
    isBranchManager &&
    userBranchKind === "branch" &&
    supplierGrnBasePath != null;
  const supplierGrnHref =
    userBranchId == null
      ? `${supplierGrnBasePath}/new`
      : `${supplierGrnBasePath}/new?branchId=${userBranchId}`;

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
          asChild
          aria-label={`${ACTIONS_VI.viewDetails} ${r.transfer_number}`}
        >
          <Link href={detailHref(r.id)}>
            <IconArrowRight className="size-4" />
          </Link>
        </Button>
      ),
    },
  ];

  const transferDrawer = (
    <Drawer
      open={!!drawerRow}
      onOpenChange={(open) => !open && setDrawerRow(null)}
    >
      <DrawerContent>
        {drawerRow && (
          <>
            <DrawerHeader>
              <DrawerTitle>{drawerRow.transfer_number}</DrawerTitle>
              <DrawerDescription>
                {drawerRow.from_branch_name} → {drawerRow.to_branch_name}
              </DrawerDescription>
            </DrawerHeader>
            <div className="flex flex-col gap-3 p-4">
              <Button
                variant="default"
                className="w-full"
                onClick={() => router.push(detailHref(drawerRow.id))}
              >
                Xem chi tiết
              </Button>
            </div>
          </>
        )}
      </DrawerContent>
    </Drawer>
  );

  if (isOperator) {
    return (
      <div className="flex w-full flex-col gap-3">
        <OperatorFlowSteps
          title={operatorFlow.transferListTitle}
          description={operatorFlow.transferListDescription}
          steps={operatorFlow.transferSteps}
          currentStep={1}
        />

        {canReceiveSupplier || canCreate ? (
          <div className="flex justify-end gap-2">
            {canReceiveSupplier ? (
              <Button size="touch" asChild>
                <Link href={supplierGrnHref}>
                  <IconPackageImport data-icon="inline-start" />
                  {INVENTORY_VI.receivingEyebrow}
                </Link>
              </Button>
            ) : null}
            {canCreate ? (
              <Button
                size="touch"
                variant={canReceiveSupplier ? "outline" : "default"}
                asChild
              >
                <Link href={createHref}>
                  <IconPlus data-icon="inline-start" />
                  {createLabel}
                </Link>
              </Button>
            ) : null}
          </div>
        ) : null}

        <AppToolbar
          variant="inline"
          className="items-stretch sm:items-center"
          search={
            <InputGroup className="min-h-12 w-full">
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
          }
        />

        {searchFiltered.length === 0 ? (
          <AppEmptyState
            compact
            title={emptyTitle}
            description={emptyDescription}
            icon={emptyIcon}
          />
        ) : (
          <ItemGroup className="gap-2 p-0 rounded-none border-0">
            {searchFiltered.map((r) => (
              <MobileTransferCard
                key={r.id}
                row={r}
                tab={activeTab}
                href={detailHref(r.id)}
                onOpenDrawer={setDrawerRow}
              />
            ))}
          </ItemGroup>
        )}

        {transferDrawer}
      </div>
    );
  }

  const desktopCreateAction = canCreate ? (
    <Button size={isOperator ? "touch" : "sm"} asChild>
      <Link href={createHref}>
        <IconPlus data-icon="inline-start" />
        {createLabel}
      </Link>
    </Button>
  ) : null;

  const desktopToolbar = (
    <AppToolbar
      variant="inline"
      className="items-stretch sm:items-center"
      search={
        <InputGroup
          className={
            isOperator
              ? "min-h-12 w-full sm:h-10 sm:flex-1"
              : "min-h-10 w-full sm:h-10 sm:flex-1"
          }
        >
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
      }
      filters={
        <Select
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as TransferTab)}
        >
          <SelectTrigger
            size={isOperator ? "touch" : "default"}
            className={
              isOperator ? "w-full sm:w-56" : "min-h-10 w-full sm:h-10 sm:w-56"
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
      getRowKey={(r) => r.id}
      emptyTitle={emptyTitle}
      emptyDescription={emptyDescription}
      emptyMode={search ? "no-results" : "no-data"}
      emptyIcon={emptyIcon}
      mobileCardRender={(r) => (
        <MobileTransferCard
          row={r}
          tab={activeTab}
          href={detailHref(r.id)}
          onOpenDrawer={setDrawerRow}
        />
      )}
    />
  );
  const desktopList = (
    <AppSection className="overflow-hidden" contentFlush>
      {desktopToolbar}
      {desktopTable}
    </AppSection>
  );

  if (embedded) {
    return (
      <div className="flex w-full flex-col gap-3">
        {desktopList}
        {transferDrawer}
      </div>
    );
  }

  return (
    <AppPage width="xwide" density="compact">
      <AppPageHeader
        eyebrow={messages.inventory.shell.moduleName}
        title={pageTitle}
        actions={desktopCreateAction}
      />
      {desktopList}
      {transferDrawer}
    </AppPage>
  );
}

function MobileTransferCard({
  row,
  tab,
  href,
  onOpenDrawer,
}: {
  row: TransferListRow;
  tab: TransferTab;
  href: string;
  onOpenDrawer: (row: TransferListRow) => void;
}) {
  const router = useRouter();
  const Icon =
    tab === "receive"
      ? IconPackageImport
      : tab === "dispatch"
        ? IconSend
        : IconCircleCheck;

  const longPress = useLongPress({
    onLongPress: () => onOpenDrawer(row),
    onClick: () => router.push(href),
  });

  return (
    <InteractiveCard
      minHeight="mobile"
      className="h-auto touch-none select-none cursor-pointer"
      {...longPress}
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
