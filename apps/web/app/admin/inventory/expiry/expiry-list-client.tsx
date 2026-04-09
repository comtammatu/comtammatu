"use client";

import { useMemo, useState, useTransition } from "react";
import { CheckCircle2, Search, Trash2 } from "lucide-react";
import type { StaffRole } from "@comtammatu/shared/auth";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
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
import { adjustStock, fetchExpiryAlerts } from "../actions";
import { TableEmptyStateRow } from "../../components/table-empty-state-row";
import type { BranchOption, ExpiryAlertRow } from "../page";

interface WriteOffTarget {
  alert: ExpiryAlertRow;
  quantity: string;
}

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
  const [isPending, startTransition] = useTransition();
  const [writeOff, setWriteOff] = useState<WriteOffTarget | null>(null);

  const isBranchLocked = userRole === "branch_manager" && userBranchId != null;

  const filtered = useMemo(() => {
    let items = alerts;

    // Branch filter
    if (branchFilter !== "all") {
      const bid = Number(branchFilter);
      items = items.filter((a) => a.branch_id === bid);
    }

    // Search
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

      // Re-fetch alerts
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
      <div className="overflow-hidden rounded-lg border shadow-sm">
        {/* Search + branch filter bar */}
        <div className="flex flex-wrap items-center gap-3 border-b bg-muted/20 px-4 py-3">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <Input
            placeholder="Tìm nguyên liệu, lô hàng, phiếu nhập..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 min-w-0 flex-1 border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0"
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

        <Table>
          <TableHeader>
            <TableRow className="bg-muted/20 hover:bg-muted/20">
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
                className="group transition-colors hover:bg-muted/30"
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
                <TableCell className="text-sm">{alert.branch_name}</TableCell>
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
      </div>
    );
  }

  return (
    <>
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Hạn sử dụng</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Theo dõi nguyên liệu sắp hết hạn và xóa sổ hàng quá hạn.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">Tất cả ({filtered.length})</TabsTrigger>
          <TabsTrigger value="expired">
            Đã hết hạn ({expired.length})
          </TabsTrigger>
          <TabsTrigger value="near">
            Sắp hết hạn ({nearExpiry.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="mt-4">
          {renderTable(filtered)}
        </TabsContent>
        <TabsContent value="expired" className="mt-4">
          {renderTable(expired)}
        </TabsContent>
        <TabsContent value="near" className="mt-4">
          {renderTable(nearExpiry)}
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
