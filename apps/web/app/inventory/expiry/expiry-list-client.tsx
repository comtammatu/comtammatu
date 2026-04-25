"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CircleCheck as IconCircleCheck,
  Search as IconSearch,
  Trash as IconTrash,
} from "lucide-react";
import type { StaffRole } from "@comtammatu/shared/auth";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Card, CardContent } from "@comtammatu/ui/components/card";
import { Checkbox } from "@comtammatu/ui/components/checkbox";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@comtammatu/ui/components/input-group";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@comtammatu/ui/components/item";
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@comtammatu/ui/components/tabs";
import { cn } from "@comtammatu/ui";
import { useIsMobile } from "@comtammatu/ui/hooks/use-mobile";
import { InventoryHeader } from "../_components/inventory-header";
import {
  InventoryFilterBar,
  InventoryPageContent,
} from "../_components/inventory-page-layout";
import { TableEmptyStateRow } from "../_components/table-empty-state-row";
import { InventoryBulkActionBar } from "../_components/bulk-action-bar";
import {
  WasteEntryDialog,
  type WasteEntryItem,
} from "../_components/waste-entry-dialog";
import { useInventoryBulkSelection } from "../_lib/use-inventory-bulk-selection";
import { URGENCY_META } from "../_lib/constants";
import type { BranchOption, ExpiryAlertRow } from "../page";

function alertToWasteItem(alert: ExpiryAlertRow): WasteEntryItem {
  return {
    clientId: alert.id,
    ingredientId: alert.ingredient_id,
    ingredientName: alert.ingredient_name,
    branchId: alert.branch_id,
    branchName: alert.branch_name,
    unit: alert.unit,
    unitCost: alert.unit_cost,
    suggestedQuantity: alert.received_quantity,
    lot: {
      batchNumber: alert.batch_number,
      grnNumber: alert.grn_number,
      expiryDate: new Date(alert.expiry_date).toLocaleDateString("vi-VN"),
    },
  };
}

interface DialogState {
  items: ExpiryAlertRow[];
  branchId: number;
}

export function ExpiryListClient({
  initial,
  branches,
  userRole,
  userBranchId,
  defaultLocationByBranch,
}: {
  initial: ExpiryAlertRow[];
  branches: BranchOption[];
  userRole: StaffRole;
  userBranchId: number | null;
  defaultLocationByBranch: Record<number, number | null>;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [branchFilter, setBranchFilter] = useState<string>(
    userRole === "branch_manager" && userBranchId != null
      ? String(userBranchId)
      : "all",
  );
  const [urgencyFilter, setUrgencyFilter] = useState<string | null>(null);
  const [dialogState, setDialogState] = useState<DialogState | null>(null);
  const isMobile = useIsMobile();

  const isBranchLocked = userRole === "branch_manager" && userBranchId != null;

  const filtered = useMemo(() => {
    let items = initial;

    if (branchFilter !== "all") {
      const bid = Number(branchFilter);
      items = items.filter((a) => a.branch_id === bid);
    }

    const q = search.trim().toLowerCase();
    if (q) {
      items = items.filter(
        (a) =>
          a.ingredient_name.toLowerCase().includes(q) ||
          (a.batch_number ?? "").toLowerCase().includes(q) ||
          a.grn_number.toLowerCase().includes(q) ||
          a.branch_name.toLowerCase().includes(q),
      );
    }

    return items;
  }, [initial, branchFilter, search]);

  const urgencyCounts = useMemo(() => {
    const counts = { expired: 0, critical: 0, warning: 0 };
    for (const a of filtered) {
      if (a.urgency === "expired") counts.expired++;
      else if (a.urgency === "critical") counts.critical++;
      else if (a.urgency === "warning") counts.warning++;
    }
    return counts;
  }, [filtered]);

  const displayItems = useMemo(() => {
    if (!urgencyFilter) return filtered;
    return filtered.filter((a) => a.urgency === urgencyFilter);
  }, [filtered, urgencyFilter]);

  const expired = useMemo(
    () => filtered.filter((a) => a.urgency === "expired"),
    [filtered],
  );
  const nearExpiry = useMemo(
    () =>
      filtered.filter(
        (a) => a.urgency === "critical" || a.urgency === "warning",
      ),
    [filtered],
  );

  // Bulk selection across the currently displayed list (post-filter).
  const bulkSelection = useInventoryBulkSelection<ExpiryAlertRow>(displayItems);

  // A bulk action requires every selected lot to share a single branch — the
  // create_waste_entry RPC only accepts one branch per call.
  const selectedBranchIds = useMemo(
    () => new Set(bulkSelection.selectedItems.map((it) => it.branch_id)),
    [bulkSelection.selectedItems],
  );
  const bulkSpansBranches = selectedBranchIds.size > 1;
  const bulkBranchId =
    selectedBranchIds.size === 1
      ? (Array.from(selectedBranchIds)[0] ?? null)
      : null;

  function openSingleWaste(alert: ExpiryAlertRow) {
    setDialogState({ items: [alert], branchId: alert.branch_id });
  }

  function openBulkWaste() {
    if (bulkBranchId == null) return;
    setDialogState({
      items: bulkSelection.selectedItems,
      branchId: bulkBranchId,
    });
  }

  function handleDialogComplete() {
    bulkSelection.clear();
    setDialogState(null);
    router.refresh();
  }

  const dialogLocationId =
    dialogState != null
      ? (defaultLocationByBranch[dialogState.branchId] ?? null)
      : null;
  const dialogItems = useMemo(
    () => (dialogState ? dialogState.items.map(alertToWasteItem) : []),
    [dialogState],
  );

  function renderTable(items: ExpiryAlertRow[]) {
    return (
      <Card>
        <CardContent className="p-0">
          {isMobile ? (
            <div className="divide-y">
              {items.length === 0 && (
                <div className="py-16 text-center">
                  <IconCircleCheck className="mx-auto size-10 text-success/40" />
                  <p className="mt-2 text-sm font-medium text-muted-foreground">
                    Không có hàng sắp hết hạn
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground/70">
                    Tất cả nguyên liệu còn trong hạn sử dụng
                  </p>
                </div>
              )}
              {items.map((alert) => {
                const meta = URGENCY_META[alert.urgency] ?? {
                  label: alert.urgency,
                  className: "bg-muted text-muted-foreground",
                };
                return (
                  <Item
                    key={alert.id}
                    size="sm"
                    className="justify-between bg-muted/30"
                  >
                    <ItemContent>
                      <ItemTitle className="text-sm font-medium">
                        <span className="truncate">
                          {alert.ingredient_name}
                        </span>
                        <Badge
                          className={cn("text-xs shrink-0", meta.className)}
                        >
                          {alert.urgency === "expired"
                            ? "Đã hết hạn"
                            : `${alert.days_remaining} ngày`}
                        </Badge>
                      </ItemTitle>
                      <ItemDescription className="truncate">
                        Lô: {alert.batch_number ?? "—"} · GRN:{" "}
                        {alert.grn_number} · {alert.branch_name} · Nhập ban
                        đầu: {alert.received_quantity} {alert.unit}
                      </ItemDescription>
                    </ItemContent>
                    <ItemActions>
                      <Button
                        variant="destructive"
                        size="sm"
                        className="h-7 gap-1.5 text-xs shrink-0"
                        onClick={() => openSingleWaste(alert)}
                      >
                        <IconTrash className="size-3.5" />
                        Hao hụt
                      </Button>
                    </ItemActions>
                  </Item>
                );
              })}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={
                        bulkSelection.isAllSelected
                          ? true
                          : bulkSelection.isSomeSelected
                            ? "indeterminate"
                            : false
                      }
                      onCheckedChange={(value) => {
                        if (value) bulkSelection.selectAll();
                        else bulkSelection.clear();
                      }}
                      aria-label="Chọn tất cả"
                    />
                  </TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider">
                    Nguyên liệu
                  </TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider">
                    Lô hàng
                  </TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider">
                    Ngày hết hạn
                  </TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider">
                    Còn lại
                  </TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider text-right">
                    Nhập ban đầu
                  </TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider">
                    Phiếu nhập
                  </TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider">
                    Chi nhánh
                  </TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider">
                    Hành động
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.length === 0 && (
                  <TableEmptyStateRow
                    colSpan={9}
                    paddingClassName="py-16"
                    icon={
                      <IconCircleCheck className="mx-auto size-10 text-success/40" />
                    }
                    title="Không có hàng sắp hết hạn"
                    description="Tất cả nguyên liệu còn trong hạn sử dụng"
                  />
                )}
                {items.map((alert) => {
                  const isItemSelected = bulkSelection.isSelected(alert.id);
                  return (
                    <TableRow
                      key={alert.id}
                      className="hover:bg-muted/30 transition-colors"
                    >
                      <TableCell className="w-10">
                        <Checkbox
                          checked={isItemSelected}
                          onCheckedChange={(value) =>
                            bulkSelection.setSelected(alert.id, value === true)
                          }
                          aria-label={`Chọn ${alert.ingredient_name}`}
                        />
                      </TableCell>
                      <TableCell className="text-sm font-medium">
                        {alert.ingredient_name}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {alert.batch_number ?? "—"}
                      </TableCell>
                      <TableCell className="text-sm tabular-nums text-muted-foreground">
                        {new Date(alert.expiry_date).toLocaleDateString(
                          "vi-VN",
                          {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                          },
                        )}
                      </TableCell>
                      <TableCell>
                        {alert.urgency === "expired" ? (
                          <Badge className="bg-destructive/10 text-destructive border-destructive/30 text-xs">
                            Đã hết hạn
                          </Badge>
                        ) : (
                          <span
                            className={cn(
                              "text-sm font-medium tabular-nums",
                              alert.urgency === "critical"
                                ? "text-destructive"
                                : "text-warning",
                            )}
                          >
                            {alert.days_remaining} ngày
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm tabular-nums">
                        {alert.received_quantity} {alert.unit}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {alert.grn_number}
                      </TableCell>
                      <TableCell className="text-sm">
                        {alert.branch_name}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="destructive"
                          size="sm"
                          className="h-7 gap-1.5 text-xs"
                          onClick={() => openSingleWaste(alert)}
                        >
                          <IconTrash className="size-3.5" />
                          Hao hụt
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <InventoryHeader title="Hạn sử dụng" />
      <InventoryPageContent>
        {/* IconSearch + branch filter */}
        <InventoryFilterBar>
          <InputGroup className="h-10 flex-1">
            <InputGroupAddon>
              <IconSearch />
            </InputGroupAddon>
            <InputGroupInput
              placeholder="Tìm nguyên liệu, lô hàng, phiếu nhập..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </InputGroup>
          {!isBranchLocked && (
            <Select value={branchFilter} onValueChange={setBranchFilter}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Chi nhánh" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả chi nhánh</SelectItem>
                {branches.map((b) => (
                  <SelectItem key={b.id} value={String(b.id)}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Badge variant="outline" className="rounded-full">
            {displayItems.length} mục
          </Badge>
        </InventoryFilterBar>

        {/* Urgency filter buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={() =>
              setUrgencyFilter((prev) =>
                prev === "expired" ? null : "expired",
              )
            }
            className={cn(
              "h-auto gap-1.5 rounded-full px-3 py-1 font-medium",
              urgencyFilter === "expired"
                ? "bg-destructive/10 text-destructive border-destructive/30"
                : "bg-muted/50 text-muted-foreground hover:bg-muted",
            )}
          >
            Đã hết hạn
            <span className="font-mono tabular-nums">
              {urgencyCounts.expired}
            </span>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={() =>
              setUrgencyFilter((prev) =>
                prev === "critical" ? null : "critical",
              )
            }
            className={cn(
              "h-auto gap-1.5 rounded-full px-3 py-1 font-medium",
              urgencyFilter === "critical"
                ? "bg-destructive/10 text-destructive border-destructive/30"
                : "bg-muted/50 text-muted-foreground hover:bg-muted",
            )}
          >
            Nguy cấp
            <span className="font-mono tabular-nums">
              {urgencyCounts.critical}
            </span>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={() =>
              setUrgencyFilter((prev) =>
                prev === "warning" ? null : "warning",
              )
            }
            className={cn(
              "h-auto gap-1.5 rounded-full px-3 py-1 font-medium",
              urgencyFilter === "warning"
                ? "bg-warning/10 text-warning border-warning/30"
                : "bg-muted/50 text-muted-foreground hover:bg-muted",
            )}
          >
            Sắp hết hạn
            <span className="font-mono tabular-nums">
              {urgencyCounts.warning}
            </span>
          </Button>
          {urgencyFilter && (
            <Button
              type="button"
              variant="link"
              size="xs"
              onClick={() => setUrgencyFilter(null)}
              className="h-auto px-0 text-muted-foreground hover:text-foreground"
            >
              Xóa bộ lọc
            </Button>
          )}
        </div>

        {/* Tabs */}
        <Tabs defaultValue="all">
          <TabsList>
            <TabsTrigger value="all">
              Tất cả ({displayItems.length})
            </TabsTrigger>
            <TabsTrigger value="expired">
              Đã hết hạn (
              {urgencyFilter
                ? displayItems.filter((a) => a.urgency === "expired").length
                : expired.length}
              )
            </TabsTrigger>
            <TabsTrigger value="near">
              Sắp hết hạn (
              {urgencyFilter
                ? displayItems.filter(
                    (a) => a.urgency === "critical" || a.urgency === "warning",
                  ).length
                : nearExpiry.length}
              )
            </TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="mt-4">
            {renderTable(displayItems)}
          </TabsContent>
          <TabsContent value="expired" className="mt-4">
            {renderTable(
              urgencyFilter
                ? displayItems.filter((a) => a.urgency === "expired")
                : expired,
            )}
          </TabsContent>
          <TabsContent value="near" className="mt-4">
            {renderTable(
              urgencyFilter
                ? displayItems.filter(
                    (a) => a.urgency === "critical" || a.urgency === "warning",
                  )
                : nearExpiry,
            )}
          </TabsContent>
        </Tabs>
      </InventoryPageContent>

      {!isMobile ? (
        <InventoryBulkActionBar
          selectedCount={bulkSelection.selectedCount}
          itemNoun="lô hàng"
          actions={[
            {
              key: "bulk-waste",
              label: bulkSpansBranches
                ? "Chỉ chọn 1 chi nhánh để hao hụt"
                : `Hao hụt ${bulkSelection.selectedCount} lô`,
              icon: IconTrash,
              variant: "destructive",
              primary: true,
              disabled: bulkSpansBranches || bulkBranchId == null,
              onClick: openBulkWaste,
            },
          ]}
          onClear={bulkSelection.clear}
        />
      ) : null}

      {dialogState != null ? (
        <WasteEntryDialog
          open
          onOpenChange={(open) => {
            if (!open) setDialogState(null);
          }}
          items={dialogItems}
          branchId={dialogState.branchId}
          locationId={dialogLocationId}
          reasonCode="expired"
          onComplete={handleDialogComplete}
        />
      ) : null}
    </>
  );
}
