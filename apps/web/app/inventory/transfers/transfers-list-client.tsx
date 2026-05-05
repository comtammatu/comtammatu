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
import { Button } from "@comtammatu/ui/components/button";
import { Card, CardContent } from "@comtammatu/ui/components/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@comtammatu/ui/components/empty";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
import { cn } from "@comtammatu/ui";
import { useIsMobile } from "@comtammatu/ui/hooks/use-mobile";
import { matchesSearch } from "@lib/search";
import { fetchStockTransfers } from "../transfer-actions";
import { CreateTransferDialog } from "./create-transfer-dialog";
import type {
  BranchForTransfer,
  InventoryLocation,
} from "./create-transfer-dialog";
import type { IngredientRow } from "../page";
import { InventoryHeader } from "../_components/inventory-header";
import {
  InventoryFilterBar,
  InventoryPageContent,
} from "../_components/inventory-page-layout";
import { InteractiveCard } from "../_components/interactive-card";
import { StatusBadge } from "../_components/status-badge";
import { TableEmptyStateRow } from "../_components/table-empty-state-row";
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

const STATUS_FILTER_OPTIONS = [
  { value: "all", label: copy.list.allStatuses },
  { value: "draft", label: copy.steps.draft },
  { value: "confirmed_ship", label: copy.steps.shipped },
  { value: "in_transit", label: copy.steps.inTransit },
  { value: "confirmed_receive", label: copy.steps.checking },
  { value: "received", label: copy.steps.received },
  { value: "cancelled", label: copy.steps.cancelled },
];

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
  const isMobile = useIsMobile();
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
  const [statusFilter, setStatusFilter] = useState<string>("all");
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

  const searchFiltered = useMemo(() => {
    const source = isMobile ? tabGroups[activeTab] : rows;
    let list = source;
    if (!isMobile && statusFilter !== "all") {
      list = list.filter((r) => r.status === statusFilter);
    }
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
  }, [isMobile, rows, tabGroups, activeTab, search, statusFilter]);

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

  // ─── Mobile layout ──────────────────────────────────────────────────
  if (isMobile) {
    return (
      <>
        <InventoryHeader
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
        <InventoryPageContent width="narrow">
          {/* Tab navigation */}
          <nav className="grid grid-cols-3 gap-1 rounded-md border bg-muted/30 p-1">
            {(Object.keys(tabLabels) as Tab[]).map((tab) => {
              const active = tab === activeTab;
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={cn(
                    "flex min-h-10 items-center justify-center rounded-lg px-2 text-xs font-semibold transition",
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

          {/* IconSearch */}
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
          </InputGroup>

          {/* Mobile cards */}
          {searchFiltered.length === 0 ? (
            <Empty className="border bg-card py-10">
              <EmptyMedia variant="icon">
                {activeTab === "receive" ? (
                  <IconPackageImport />
                ) : activeTab === "dispatch" ? (
                  <IconSend />
                ) : (
                  <IconPackageOff />
                )}
              </EmptyMedia>
              <EmptyHeader>
                <EmptyTitle className="text-sm font-semibold">
                  {search
                    ? copy.list.noTransfersFound
                    : activeTab === "receive"
                      ? copy.list.noReceiveTransfers
                      : activeTab === "dispatch"
                        ? copy.list.noDispatchTransfers
                        : copy.list.noHistory}
                </EmptyTitle>
                <EmptyDescription className="text-xs leading-5">
                  {search
                    ? copy.list.searchEmptyHint
                    : activeTab === "receive"
                      ? copy.list.receiveEmptyHint
                      : activeTab === "dispatch"
                        ? copy.list.dispatchEmptyHint
                        : copy.list.historyEmptyHint}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="flex flex-col gap-2">
              {searchFiltered.map((r) => (
                <MobileTransferCard
                  key={r.id}
                  row={r}
                  tab={activeTab}
                  href={detailHref(r.id)}
                />
              ))}
            </div>
          )}
        </InventoryPageContent>

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
      </>
    );
  }

  // ─── Desktop layout ─────────────────────────────────────────────────
  return (
    <>
      <InventoryHeader
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
      <InventoryPageContent>
        {/* Status filter + search */}
        <InventoryFilterBar>
          <div className="flex flex-1 flex-wrap items-end gap-3">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder={copy.list.allStatuses} />
              </SelectTrigger>
              <SelectContent>
                {STATUS_FILTER_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <InputGroup className="h-10 flex-1">
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
          </div>
        </InventoryFilterBar>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{copy.list.transferNumber}</TableHead>
                  <TableHead>{copy.list.route}</TableHead>
                  <TableHead>{FORM_VI.status}</TableHead>
                  <TableHead>{copy.list.createdAt}</TableHead>
                  <TableHead>{copy.list.shippedReceivedAt}</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {searchFiltered.length === 0 && (
                  <TableEmptyStateRow
                    colSpan={6}
                    title={
                      search || statusFilter !== "all"
                        ? copy.list.noTransfersFound
                        : copy.list.emptyTransfers
                    }
                  />
                )}
                {searchFiltered.map((r) => {
                  const dateDisplay = r.shipped_at
                    ? `Xuất: ${new Date(r.shipped_at).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" })}`
                    : r.received_at
                      ? `Nhận: ${new Date(r.received_at).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" })}`
                      : "—";

                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">
                        {r.transfer_number}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5 text-sm">
                          <span>{r.from_branch_name}</span>
                          <IconArrowRight className="size-3 text-muted-foreground" />
                          <span>{r.to_branch_name}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={r.status} size="sm" />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(r.created_at).toLocaleDateString("vi-VN", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                        })}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {dateDisplay}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon-sm" asChild>
                          <Link href={detailHref(r.id)}>
                            <IconArrowRight className="size-4" />
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </InventoryPageContent>

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
    </>
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
              {new Date(row.shipped_at ?? row.created_at).toLocaleDateString(
                "vi-VN",
                {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                },
              )}
            </p>
          )}
        </div>
        <IconChevronRight className="size-4 shrink-0 text-muted-foreground" />
      </Link>
    </InteractiveCard>
  );
}
