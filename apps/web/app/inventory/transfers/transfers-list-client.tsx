"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight as IconArrowRight, CircleCheck as IconCircleCheck, ChevronRight as IconChevronRight, PackagePlus as IconPackageImport, PackageX as IconPackageOff, Plus as IconPlus, Search as IconSearch, Send as IconSend } from "lucide-react";
import type { StaffRole } from "@comtammatu/shared/auth";
import { Button } from "@comtammatu/ui/components/button";
import { Card, CardContent } from "@comtammatu/ui/components/card";
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

const TAB_LABELS: Record<Tab, string> = {
  receive: "Cần nhận",
  dispatch: "Cần giao",
  history: "Lịch sử",
};

function classifyTransfer(
  status: string,
  viewerBranchId: number | null,
  fromId: number,
  toId: number,
): Tab {
  const receiveStates = ["in_transit", "confirmed_ship", "confirmed_receive"];
  const dispatchStates = ["draft"];
  const terminal = ["received", "cancelled", "completed"];

  if (terminal.includes(status)) return "history";
  if (receiveStates.includes(status)) {
    if (
      viewerBranchId != null &&
      viewerBranchId !== toId &&
      viewerBranchId !== fromId
    ) {
      return "history";
    }
    return "receive";
  }
  if (dispatchStates.includes(status)) return "dispatch";
  return "history";
}

const STATUS_FILTER_OPTIONS = [
  { value: "all", label: "Tất cả trạng thái" },
  { value: "draft", label: "Nháp" },
  { value: "confirmed_ship", label: "Đã xuất kho" },
  { value: "in_transit", label: "Đang vận chuyển" },
  { value: "confirmed_receive", label: "Đang kiểm nhận" },
  { value: "received", label: "Đã nhận" },
  { value: "cancelled", label: "Đã hủy" },
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
}: {
  initial: TransferListRow[];
  branches: BranchForTransfer[];
  ingredients: IngredientRow[];
  locations: InventoryLocation[];
  hqBranchId: number | null;
  userBranchId: number | null;
  userRole: StaffRole;
  basePath?: string;
}) {
  const router = useRouter();
  const isMobile = useIsMobile();
  const [rows, setRows] = useState(initial);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [activeTab, setActiveTab] = useState<Tab>("receive");

  const canCreate =
    branches.length >= 2 || (userBranchId != null && locations.length >= 2);

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
      );
      groups[tab].push(r);
    }
    return groups;
  }, [rows, userBranchId]);

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
    fetchStockTransfers().then((res) => {
      if (res.success) setRows((res.data ?? []) as TransferListRow[]);
    });
    router.push(`${basePath}/${id}`);
  }

  // ─── Mobile layout ──────────────────────────────────────────────────
  if (isMobile) {
    return (
      <>
        <InventoryHeader
          title="Điều chuyển nội bộ"
          actions={
            canCreate ? (
              <Button size="sm" onClick={() => setOpen(true)}>
                <IconPlus className="size-4" />
                Tạo phiếu
              </Button>
            ) : undefined
          }
        />
        <InventoryPageContent width="narrow">
          {/* Tab navigation */}
          <nav className="grid grid-cols-3 gap-1 rounded-md border bg-muted/30 p-1">
            {(Object.keys(TAB_LABELS) as Tab[]).map((tab) => {
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
                  {TAB_LABELS[tab]}
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
              placeholder="Tìm số phiếu hoặc tên kho..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </InputGroup>

          {/* Mobile cards */}
          {searchFiltered.length === 0 ? (
            <div className="py-16 text-center">
              {activeTab === "receive" ? (
                <IconPackageImport className="mx-auto size-10 text-muted-foreground/40" />
              ) : activeTab === "dispatch" ? (
                <IconSend className="mx-auto size-10 text-muted-foreground/40" />
              ) : (
                <IconPackageOff className="mx-auto size-10 text-muted-foreground/40" />
              )}
              <p className="mt-2 text-sm font-medium text-muted-foreground">
                {search
                  ? "Không tìm thấy phiếu nào"
                  : activeTab === "receive"
                    ? "Không có phiếu cần nhận"
                    : activeTab === "dispatch"
                      ? "Không có phiếu đang soạn"
                      : "Chưa có lịch sử điều chuyển"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground/70">
                {search
                  ? "Thử tìm kiếm khác hoặc xóa bộ lọc."
                  : activeTab === "receive"
                    ? "Khi kho gửi xác nhận xuất, phiếu sẽ hiện ở đây."
                    : activeTab === "dispatch"
                      ? "Tạo phiếu mới nếu cần."
                      : "Các phiếu đã hoàn tất sẽ được lưu ở đây."}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {searchFiltered.map((r) => (
                <MobileTransferCard
                  key={r.id}
                  row={r}
                  tab={activeTab}
                  basePath={basePath}
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
        title="Điều chuyển nội bộ"
        actions={
          canCreate ? (
            <Button size="sm" onClick={() => setOpen(true)}>
              <IconPlus className="size-4" />
              Tạo phiếu
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
                <SelectValue placeholder="Tất cả trạng thái" />
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
                placeholder="Tìm số phiếu hoặc tên kho..."
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
                  <TableHead>Số phiếu</TableHead>
                  <TableHead>Lộ trình</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead>Ngày tạo</TableHead>
                  <TableHead>Ngày xuất / nhận</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {searchFiltered.length === 0 && (
                  <TableEmptyStateRow
                    colSpan={6}
                    title={
                      search || statusFilter !== "all"
                        ? "Không tìm thấy phiếu nào"
                        : "Chưa có phiếu luân chuyển"
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
                          <Link href={`${basePath}/${r.id}`}>
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
  basePath,
}: {
  row: TransferListRow;
  tab: Tab;
  basePath: string;
}) {
  const Icon =
    tab === "receive" ? IconPackageImport : tab === "dispatch" ? IconSend : IconCircleCheck;

  return (
    <InteractiveCard asChild minHeight="mobile" className="h-auto">
      <Link href={`${basePath}/${row.id}`}>
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
