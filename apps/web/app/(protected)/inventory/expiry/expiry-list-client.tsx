"use client";

import { useMemo, useState, useTransition } from "react";
import {
  CircleCheck as IconCircleCheck,
  Search as IconSearch,
  Trash as IconTrash,
} from "lucide-react";
import type { StaffRole } from "@comtammatu/shared/auth";
import { ACTIONS_VI, BRANCH_VI, PRODUCT_VI } from "@comtammatu/shared/messages";
import { formatVNDate } from "@comtammatu/shared/time";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Card, CardContent } from "@comtammatu/ui/components/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@comtammatu/ui/components/alert-dialog";
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
} from "@comtammatu/ui/components/input-group";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@comtammatu/ui/components/item";
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@comtammatu/ui/components/tabs";
import { toast } from "@comtammatu/ui/components/sonner";
import { cn } from "@comtammatu/ui";
import { useIsMobile } from "@comtammatu/ui/hooks/use-mobile";
import { matchesSearch } from "@lib/search";
import { FormattedNumberInput } from "../_components/formatted-number-input";
import { AppPage, AppPageHeader, AppToolbar } from "@/components/surface";
import { adjustStock } from "../stock-actions";
import { fetchExpiryAlerts } from "../alert-actions";
import { TableEmptyStateRow } from "../_components/table-empty-state-row";
import type { BranchOption, ExpiryAlertRow } from "../page";

interface WriteOffTarget {
  alert: ExpiryAlertRow;
  quantity: string;
}

const URGENCY_META: Record<string, { label: string; className: string }> = {
  expired: {
    label: "Đã hết hạn",
    className: "bg-destructive/10 text-destructive border-destructive/30",
  },
  critical: {
    label: "Nguy cấp",
    className: "bg-destructive/10 text-destructive border-destructive/30",
  },
  warning: {
    label: "Sắp hết hạn",
    className: "bg-warning/10 text-warning border-warning/30",
  },
};

export function ExpiryListClient({
  initial,
  branches,
  userRole,
  userBranchId,
}: {
  initial: ExpiryAlertRow[];
  branches: BranchOption[];
  userRole: StaffRole;
  userBranchId: number | null;
}) {
  const [alerts, setAlerts] = useState(initial);
  const [search, setSearch] = useState("");
  const [branchFilter, setBranchFilter] = useState<string>(
    userRole === "branch_manager" && userBranchId != null
      ? String(userBranchId)
      : "all",
  );
  const [urgencyFilter, setUrgencyFilter] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [writeOff, setWriteOff] = useState<WriteOffTarget | null>(null);
  const isMobile = useIsMobile();

  const isBranchLocked = userRole === "branch_manager" && userBranchId != null;

  const filtered = useMemo(() => {
    let items = alerts;

    if (branchFilter !== "all") {
      const bid = Number(branchFilter);
      items = items.filter((a) => a.branch_id === bid);
    }

    const q = search.trim();
    if (q) {
      items = items.filter((a) =>
        matchesSearch(
          [a.ingredient_name, a.batch_number, a.grn_number, a.branch_name],
          q,
        ),
      );
    }

    return items;
  }, [alerts, branchFilter, search]);

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

  function openWriteOff(alert: ExpiryAlertRow) {
    setWriteOff({ alert, quantity: "" });
  }

  function handleConfirmWriteOff() {
    if (!writeOff) return;
    const qty = Number(writeOff.quantity);
    if (!qty || qty <= 0) {
      toast.error("Nhập số lượng hợp lệ");
      return;
    }

    const { alert } = writeOff;
    const lotPart = alert.batch_number ? ` lô ${alert.batch_number}` : "";
    const grnPart = alert.grn_number ? ` (GRN ${alert.grn_number})` : "";
    const expiryPart = alert.expiry_date ? ` HSD ${alert.expiry_date}` : "";
    startTransition(async () => {
      const res = await adjustStock({
        branchId: alert.branch_id,
        ingredientId: alert.ingredient_id,
        quantityChange: -qty,
        type: "adjustment",
        reason: `Hết hạn sử dụng — ${alert.ingredient_name}${lotPart}${expiryPart}${grnPart}`,
      });

      if (!res.success) {
        toast.error(res.error ?? "Không thể xóa sổ.");
        return;
      }

      toast.success(`Đã xóa sổ ${qty} ${alert.ingredient_name}`);
      setWriteOff(null);

      const again = await fetchExpiryAlerts(
        branchFilter !== "all" ? Number(branchFilter) : undefined,
      );
      if (again.success) {
        setAlerts((again.data ?? []) as ExpiryAlertRow[]);
      }
    });
  }

  function renderTable(items: ExpiryAlertRow[]) {
    return (
      <Card>
        <CardContent flush>
          {isMobile ? (
            <div className="divide-y">
              {items.length === 0 && (
                <Empty className="border-0 py-10">
                  <EmptyMedia variant="icon">
                    <IconCircleCheck />
                  </EmptyMedia>
                  <EmptyHeader>
                    <EmptyTitle className="text-sm font-semibold">
                      Không có hàng sắp hết hạn
                    </EmptyTitle>
                    <EmptyDescription className="text-xs leading-5">
                      Tất cả nguyên liệu còn trong hạn sử dụng
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )}
              {items.map((alert, idx) => {
                const meta = URGENCY_META[alert.urgency] ?? {
                  label: alert.urgency,
                  className: "bg-muted text-muted-foreground",
                };
                return (
                  <Item
                    key={`${alert.ingredient_id}-${alert.grn_number}-${alert.batch_number ?? ""}-${String(idx)}`}
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
                        {alert.grn_number} · {alert.branch_name}
                      </ItemDescription>
                    </ItemContent>
                    <ItemActions>
                      <Button
                        variant="destructive"
                        size="sm"
                        className="h-7 gap-1.5 text-xs shrink-0"
                        onClick={() => openWriteOff(alert)}
                        disabled={isPending}
                      >
                        <IconTrash className="size-3.5" />
                        Xóa sổ
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
                  <TableHead className="text-xs font-semibold uppercase tracking-wider">
                    {PRODUCT_VI.rawIngredient}
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
                  <TableHead className="text-xs font-semibold uppercase tracking-wider">
                    Phiếu nhập
                  </TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider">
                    {BRANCH_VI.long}
                  </TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider">
                    Hành động
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.length === 0 && (
                  <TableEmptyStateRow
                    colSpan={7}
                    paddingClassName="py-16"
                    icon={
                      <IconCircleCheck className="mx-auto size-10 text-success/40" />
                    }
                    title="Không có hàng sắp hết hạn"
                    description="Tất cả nguyên liệu còn trong hạn sử dụng"
                  />
                )}
                {items.map((alert, idx) => (
                  <TableRow
                    key={`${alert.ingredient_id}-${alert.grn_number}-${alert.batch_number ?? ""}-${String(idx)}`}
                    className="hover:bg-muted/30 transition-colors"
                  >
                    <TableCell className="text-sm font-medium">
                      {alert.ingredient_name}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {alert.batch_number ?? "\u2014"}
                    </TableCell>
                    <TableCell className="text-sm font-mono tabular-nums text-muted-foreground">
                      {formatVNDate(alert.expiry_date)}
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
                        onClick={() => openWriteOff(alert)}
                        disabled={isPending}
                      >
                        <IconTrash className="size-3.5" />
                        Xóa sổ
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <AppPage>
      <AppPageHeader eyebrow="Kho hàng" title="Hạn sử dụng" />
      {/* IconSearch + branch filter */}
      <AppToolbar>
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
              <SelectItem value="all">{BRANCH_VI.selectAll}</SelectItem>
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
      </AppToolbar>

      {/* Urgency filter buttons */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="xs"
          onClick={() =>
            setUrgencyFilter((prev) => (prev === "expired" ? null : "expired"))
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
            setUrgencyFilter((prev) => (prev === "warning" ? null : "warning"))
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
          <TabsTrigger value="all">Tất cả ({displayItems.length})</TabsTrigger>
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
      {/* Write-off AlertDialog */}
      <AlertDialog
        open={writeOff != null}
        onOpenChange={(open) => {
          if (!open) setWriteOff(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận xóa sổ</AlertDialogTitle>
            <AlertDialogDescription>
              {writeOff
                ? `Xóa sổ ${writeOff.alert.ingredient_name} — lô ${writeOff.alert.batch_number ?? "không có mã lô"}. Hành động này sẽ trừ tồn kho.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 px-1">
            <Label htmlFor="writeoff-qty">Số lượng xóa sổ</Label>
            <FormattedNumberInput
              id="writeoff-qty"
              placeholder="Nhập số lượng..."
              value={writeOff?.quantity ?? ""}
              onValueChange={(value) =>
                setWriteOff((prev) =>
                  prev ? { ...prev, quantity: value } : null,
                )
              }
              maxFractionDigits={3}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>
              {ACTIONS_VI.cancel}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmWriteOff}
              disabled={
                isPending ||
                !writeOff?.quantity ||
                Number(writeOff.quantity) <= 0
              }
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isPending ? "Đang xử lý..." : "Xóa sổ"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppPage>
  );
}
