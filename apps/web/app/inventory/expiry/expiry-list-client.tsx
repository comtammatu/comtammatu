"use client";

import { useMemo, useState, useTransition } from "react";
import { CheckCircle2, Search, Trash2 } from "lucide-react";
import type { StaffRole } from "@comtammatu/shared/auth";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@comtammatu/ui/components/card";
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
import { Input } from "@comtammatu/ui/components/input";
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
import { adjustStock, fetchExpiryAlerts } from "../actions";
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
    startTransition(async () => {
      const res = await adjustStock({
        branchId: alert.branch_id,
        ingredientId: alert.ingredient_id,
        quantityChange: -qty,
        type: "adjustment",
        reason: `Hết hạn sử dụng — ${alert.ingredient_name}`,
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
      <Card className="overflow-hidden rounded-lg">
        <CardHeader className="gap-4">
          <div className="space-y-1">
            <CardTitle>Danh sách lô cần xử lý</CardTitle>
            <p className="text-sm text-muted-foreground">
              Tìm theo nguyên liệu, lô, phiếu nhập và chi nhánh để thao tác xóa
              sổ nhanh.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <Input
              placeholder="Tìm nguyên liệu, lô hàng, phiếu nhập..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="min-w-0 flex-1 border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
            />
            {!isBranchLocked && (
              <Select value={branchFilter} onValueChange={setBranchFilter}>
                <SelectTrigger className="h-8 w-auto min-w-36 text-sm">
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
            <span className="shrink-0 text-xs text-muted-foreground">
              {items.length} mục
            </span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isMobile ? (
            <div className="divide-y">
              {items.length === 0 && (
                <div className="py-16 text-center">
                  <CheckCircle2 className="mx-auto size-10 text-success/40" />
                  <p className="mt-2 text-sm font-medium text-muted-foreground">
                    Không có hàng sắp hết hạn
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground/70">
                    Tất cả nguyên liệu còn trong hạn sử dụng
                  </p>
                </div>
              )}
              {items.map((alert, idx) => {
                const meta = URGENCY_META[alert.urgency] ?? {
                  label: alert.urgency,
                  className: "bg-muted text-muted-foreground",
                };
                return (
                  <div
                    key={`${alert.ingredient_id}-${alert.grn_number}-${alert.batch_number ?? ""}-${String(idx)}`}
                    className="rounded-lg border bg-muted/30 text-card-foreground flex items-center justify-between gap-3 px-4 py-3"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">
                          {alert.ingredient_name}
                        </span>
                        <Badge
                          className={cn("text-xs shrink-0", meta.className)}
                        >
                          {alert.urgency === "expired"
                            ? "Đã hết hạn"
                            : `${alert.days_remaining} ngày`}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        Lô: {alert.batch_number ?? "—"} · GRN:{" "}
                        {alert.grn_number} · {alert.branch_name}
                      </p>
                    </div>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="h-7 gap-1.5 text-xs shrink-0"
                      onClick={() => openWriteOff(alert)}
                      disabled={isPending}
                    >
                      <Trash2 className="size-3.5" />
                      Xóa sổ
                    </Button>
                  </div>
                );
              })}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
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
                    colSpan={7}
                    paddingClassName="py-16"
                    icon={
                      <CheckCircle2 className="mx-auto size-10 text-success/40" />
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
                    <TableCell className="text-sm tabular-nums text-muted-foreground">
                      {new Date(alert.expiry_date).toLocaleDateString("vi-VN", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                      })}
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
                        <Trash2 className="size-3.5" />
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
    <>
      <div className="space-y-1">
        <p className="text-sm font-medium text-muted-foreground">
          Expiry Policy
        </p>
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight">Hạn sử dụng</h1>
          <p className="text-sm text-muted-foreground">
            Theo dõi hàng sắp hết hạn, khóa lô quá hạn và thao tác xóa sổ trực
            tiếp từ khu vực settings.
          </p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-lg border bg-card p-4 text-card-foreground shadow-sm">
          <p className="inline-flex items-center rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
            Đã hết hạn
          </p>
          <p className="mt-3 text-3xl font-semibold text-destructive">
            {urgencyCounts.expired}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Lô cần khóa và xử lý ngay.
          </p>
        </div>
        <div className="rounded-lg border bg-card p-4 text-card-foreground shadow-sm">
          <p className="inline-flex items-center rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
            Nguy cấp
          </p>
          <p className="mt-3 text-3xl font-semibold text-destructive">
            {urgencyCounts.critical}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Lô còn rất ít ngày sử dụng.
          </p>
        </div>
        <div className="rounded-lg border bg-card p-4 text-card-foreground shadow-sm">
          <p className="inline-flex items-center rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
            Sắp hết hạn
          </p>
          <p className="mt-3 text-3xl font-semibold text-warning">
            {urgencyCounts.warning}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Lô cần được điều phối hoặc tiêu thụ sớm.
          </p>
        </div>
      </div>

      {/* Urgency count badges */}
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
            <Input
              id="writeoff-qty"
              type="number"
              min={1}
              step="any"
              placeholder="Nhập số lượng..."
              value={writeOff?.quantity ?? ""}
              onChange={(e) =>
                setWriteOff((prev) =>
                  prev ? { ...prev, quantity: e.target.value } : null,
                )
              }
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Hủy</AlertDialogCancel>
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
    </>
  );
}
