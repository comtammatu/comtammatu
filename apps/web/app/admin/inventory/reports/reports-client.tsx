"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Card, CardContent } from "@comtammatu/ui/components/card";
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
import {
  fetchStockMovementReport,
  fetchBranchMovementSummary,
  fetchApAging,
  fetchConsumptionVariance,
} from "../report-actions";
import type {
  MovementReportRow,
  BranchMovementSummaryRow,
  ApAgingRow,
  ConsumptionVarianceRow,
} from "../report-actions";
import { TableEmptyStateRow } from "../../components/table-empty-state-row";

/* ─── Helpers ─── */

function defaultDateRange() {
  const today = new Date();
  const end = today.toISOString().slice(0, 10);
  const start = new Date(today);
  start.setDate(start.getDate() - 30);
  return { start: start.toISOString().slice(0, 10), end };
}

function fmtNum(n: number) {
  return n.toLocaleString("vi-VN", { maximumFractionDigits: 2 });
}

function fmtMoney(n: number) {
  return `${n.toLocaleString("vi-VN")} \u20AB`;
}

/* ─── Component ─── */

interface BranchOption {
  id: number;
  name: string;
}

export function ReportsClient({
  branches,
  defaultBranchId,
}: {
  branches: BranchOption[];
  defaultBranchId: number | null;
}) {
  const defaults = defaultDateRange();
  const [startDate, setStartDate] = useState(defaults.start);
  const [endDate, setEndDate] = useState(defaults.end);
  const [branchId, setBranchId] = useState(
    defaultBranchId ? String(defaultBranchId) : "_all",
  );
  const [isPending, startTransition] = useTransition();
  const isMobile = useIsMobile();

  // Data states
  const [movementRows, setMovementRows] = useState<MovementReportRow[]>([]);
  const [branchSummary, setBranchSummary] = useState<
    BranchMovementSummaryRow[]
  >([]);
  const [apAgingRows, setApAgingRows] = useState<ApAgingRow[]>([]);
  const [varianceRows, setVarianceRows] = useState<ConsumptionVarianceRow[]>(
    [],
  );
  const [activeTab, setActiveTab] = useState("movement");
  const [loaded, setLoaded] = useState<Record<string, boolean>>({});

  function loadReport(tab: string) {
    startTransition(async () => {
      try {
        if (tab === "movement") {
          const bId = branchId !== "_all" ? Number(branchId) : undefined;
          const res = await fetchStockMovementReport({
            startDate,
            endDate,
            branchId: bId,
          });
          if (!res.success) {
            toast.error(res.error ?? "Không thể tải báo cáo");
            return;
          }
          setMovementRows((res.data ?? []) as MovementReportRow[]);
        } else if (tab === "branch") {
          const res = await fetchBranchMovementSummary({
            startDate,
            endDate,
          });
          if (!res.success) {
            toast.error(res.error ?? "Không thể tải báo cáo");
            return;
          }
          setBranchSummary((res.data ?? []) as BranchMovementSummaryRow[]);
        } else if (tab === "ap-aging") {
          const res = await fetchApAging();
          if (!res.success) {
            toast.error(res.error ?? "Không thể tải báo cáo");
            return;
          }
          setApAgingRows((res.data ?? []) as ApAgingRow[]);
        } else if (tab === "variance") {
          const bId = branchId !== "_all" ? Number(branchId) : undefined;
          const res = await fetchConsumptionVariance({
            startDate,
            endDate,
            branchId: bId,
          });
          if (!res.success) {
            toast.error(res.error ?? "Không thể tải báo cáo");
            return;
          }
          setVarianceRows((res.data ?? []) as ConsumptionVarianceRow[]);
        }
        setLoaded((prev) => ({ ...prev, [tab]: true }));
      } catch {
        toast.error("Lỗi khi tải báo cáo");
      }
    });
  }

  function handleTabChange(tab: string) {
    setActiveTab(tab);
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div
            className={cn(
              "flex items-end gap-4",
              isMobile ? "flex-col items-stretch" : "flex-wrap",
            )}
          >
            <div className="space-y-1.5">
              <Label htmlFor="startDate">Từ ngày</Label>
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className={isMobile ? "w-full" : "w-40"}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="endDate">Đến ngày</Label>
              <Input
                id="endDate"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className={isMobile ? "w-full" : "w-40"}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Chi nhánh</Label>
              <Select value={branchId} onValueChange={setBranchId}>
                <SelectTrigger className={isMobile ? "w-full" : "w-48"}>
                  <SelectValue placeholder="Tất cả" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">Tất cả chi nhánh</SelectItem>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={String(b.id)}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              type="button"
              onClick={() => loadReport(activeTab)}
              disabled={isPending || !startDate || !endDate}
              className={isMobile ? "w-full" : ""}
            >
              {isPending ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Đang tải...
                </>
              ) : (
                "Xem báo cáo"
              )}
            </Button>
            {activeTab === "ap-aging" && (
              <p className="text-xs text-muted-foreground self-end pb-0.5">
                Công nợ NCC không lọc theo ngày / chi nhánh — hiển thị tất cả
                hoá đơn chưa thanh toán.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="movement">Biến động tồn kho</TabsTrigger>
          <TabsTrigger value="branch">Theo chi nhánh</TabsTrigger>
          <TabsTrigger value="ap-aging">Công nợ NCC</TabsTrigger>
          <TabsTrigger value="variance">Chênh lệch tiêu hao</TabsTrigger>
        </TabsList>

        {/* Stock movement report */}
        <TabsContent value="movement" className="mt-4">
          {!loaded["movement"] ? (
            <EmptyReportState />
          ) : isMobile ? (
            <div className="rounded-lg border shadow-sm overflow-hidden divide-y">
              {movementRows.length === 0 && (
                <div className="py-16 text-center">
                  <p className="text-sm font-medium text-muted-foreground">
                    Không có dữ liệu
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground/70">
                    Chọn khoảng thời gian và nhấn Xem báo cáo
                  </p>
                </div>
              )}
              {movementRows.map((r) => (
                <div key={r.ingredient_id} className="px-4 py-3 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium truncate">
                      {r.ingredient_name}
                    </span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {r.unit}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs font-mono tabular-nums">
                    <span>{fmtNum(r.opening)}</span>
                    <span className="text-muted-foreground">→</span>
                    <span className="font-semibold">{fmtNum(r.closing)}</span>
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                    {r.grn_receipt > 0 && (
                      <span className="text-success">
                        +{fmtNum(r.grn_receipt)} nhập
                      </span>
                    )}
                    {r.consumption < 0 && (
                      <span className="text-destructive">
                        {fmtNum(r.consumption)} tiêu hao
                      </span>
                    )}
                    {r.transfer_in > 0 && (
                      <span className="text-success">
                        +{fmtNum(r.transfer_in)} chuyển vào
                      </span>
                    )}
                    {r.transfer_out < 0 && (
                      <span className="text-destructive">
                        {fmtNum(r.transfer_out)} chuyển ra
                      </span>
                    )}
                    {r.adjustment !== 0 && (
                      <span>
                        {r.adjustment > 0 ? "+" : ""}
                        {fmtNum(r.adjustment)} điều chỉnh
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border shadow-sm overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/20 hover:bg-muted/20">
                    <TableHead className="text-xs font-semibold uppercase tracking-wider">
                      Nguyên liệu
                    </TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider">
                      ĐVT
                    </TableHead>
                    <TableHead className="text-right text-xs font-semibold uppercase tracking-wider">
                      Đầu kỳ
                    </TableHead>
                    <TableHead className="text-right text-xs font-semibold uppercase tracking-wider">
                      Nhập (GRN)
                    </TableHead>
                    <TableHead className="hidden md:table-cell text-right text-xs font-semibold uppercase tracking-wider">
                      Chuyển vào
                    </TableHead>
                    <TableHead className="hidden md:table-cell text-right text-xs font-semibold uppercase tracking-wider">
                      Chuyển ra
                    </TableHead>
                    <TableHead className="text-right text-xs font-semibold uppercase tracking-wider">
                      Tiêu hao
                    </TableHead>
                    <TableHead className="hidden lg:table-cell text-right text-xs font-semibold uppercase tracking-wider">
                      Điều chỉnh
                    </TableHead>
                    <TableHead className="text-right text-xs font-semibold uppercase tracking-wider">
                      Cuối kỳ
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {movementRows.length === 0 && (
                    <TableEmptyStateRow
                      colSpan={9}
                      paddingClassName="py-16"
                      title="Không có dữ liệu"
                      description="Chọn khoảng thời gian và nhấn Xem báo cáo"
                    />
                  )}
                  {movementRows.map((r) => (
                    <TableRow
                      key={r.ingredient_id}
                      className="hover:bg-muted/30 transition-colors"
                    >
                      <TableCell className="font-medium">
                        {r.ingredient_name}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {r.unit}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {fmtNum(r.opening)}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums text-success">
                        {r.grn_receipt > 0 ? `+${fmtNum(r.grn_receipt)}` : "—"}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-right font-mono tabular-nums text-success">
                        {r.transfer_in > 0 ? `+${fmtNum(r.transfer_in)}` : "—"}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-right font-mono tabular-nums text-destructive">
                        {r.transfer_out < 0 ? fmtNum(r.transfer_out) : "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums text-destructive">
                        {r.consumption < 0 ? fmtNum(r.consumption) : "—"}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-right font-mono tabular-nums text-muted-foreground">
                        {r.adjustment !== 0 ? fmtNum(r.adjustment) : "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums font-semibold">
                        {fmtNum(r.closing)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* Branch summary */}
        <TabsContent value="branch" className="mt-4">
          {!loaded["branch"] ? (
            <EmptyReportState />
          ) : isMobile ? (
            <div className="rounded-lg border shadow-sm overflow-hidden divide-y">
              {branchSummary.length === 0 && (
                <div className="py-16 text-center">
                  <p className="text-sm font-medium text-muted-foreground">
                    Không có dữ liệu
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground/70">
                    Chọn khoảng thời gian và nhấn Xem báo cáo
                  </p>
                </div>
              )}
              {branchSummary.map((r) => (
                <div key={r.branch_id} className="px-4 py-3 space-y-1.5">
                  <p className="text-sm font-medium">{r.branch_name}</p>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs font-mono tabular-nums">
                    {r.grn_receipt > 0 && (
                      <span className="text-success">
                        +{fmtNum(r.grn_receipt)} nhập
                      </span>
                    )}
                    {r.transfer_in > 0 && (
                      <span className="text-success">
                        +{fmtNum(r.transfer_in)} chuyển vào
                      </span>
                    )}
                    {r.transfer_out < 0 && (
                      <span className="text-destructive">
                        {fmtNum(r.transfer_out)} chuyển ra
                      </span>
                    )}
                    {r.consumption < 0 && (
                      <span className="text-destructive">
                        {fmtNum(r.consumption)} tiêu hao
                      </span>
                    )}
                    {r.adjustment !== 0 && (
                      <span className="text-muted-foreground">
                        {r.adjustment > 0 ? "+" : ""}
                        {fmtNum(r.adjustment)} điều chỉnh
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border shadow-sm overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/20 hover:bg-muted/20">
                    <TableHead className="text-xs font-semibold uppercase tracking-wider">
                      Chi nhánh
                    </TableHead>
                    <TableHead className="text-right text-xs font-semibold uppercase tracking-wider">
                      Nhập (GRN)
                    </TableHead>
                    <TableHead className="text-right text-xs font-semibold uppercase tracking-wider">
                      Chuyển vào
                    </TableHead>
                    <TableHead className="text-right text-xs font-semibold uppercase tracking-wider">
                      Chuyển ra
                    </TableHead>
                    <TableHead className="text-right text-xs font-semibold uppercase tracking-wider">
                      Tiêu hao
                    </TableHead>
                    <TableHead className="text-right text-xs font-semibold uppercase tracking-wider">
                      Điều chỉnh
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {branchSummary.length === 0 && (
                    <TableEmptyStateRow
                      colSpan={6}
                      paddingClassName="py-16"
                      title="Không có dữ liệu"
                      description="Chọn khoảng thời gian và nhấn Xem báo cáo"
                    />
                  )}
                  {branchSummary.map((r) => (
                    <TableRow
                      key={r.branch_id}
                      className="hover:bg-muted/30 transition-colors"
                    >
                      <TableCell className="font-medium">
                        {r.branch_name}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums text-success">
                        {r.grn_receipt > 0 ? `+${fmtNum(r.grn_receipt)}` : "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums text-success">
                        {r.transfer_in > 0 ? `+${fmtNum(r.transfer_in)}` : "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums text-destructive">
                        {r.transfer_out < 0 ? fmtNum(r.transfer_out) : "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums text-destructive">
                        {r.consumption < 0 ? fmtNum(r.consumption) : "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums text-muted-foreground">
                        {r.adjustment !== 0 ? fmtNum(r.adjustment) : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* AP Aging */}
        <TabsContent value="ap-aging" className="mt-4">
          {!loaded["ap-aging"] ? (
            <EmptyReportState />
          ) : isMobile ? (
            <div className="rounded-lg border shadow-sm overflow-hidden divide-y">
              {apAgingRows.length === 0 && (
                <div className="py-16 text-center">
                  <p className="text-sm font-medium text-muted-foreground">
                    Không có công nợ
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground/70">
                    Tất cả hóa đơn đã thanh toán
                  </p>
                </div>
              )}
              {apAgingRows.map((r) => {
                const hasOverdue =
                  r.buckets.days_61_90.total > 0 ||
                  r.buckets.days_over_90.total > 0;
                return (
                  <div key={r.supplier_id} className="px-4 py-3 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium truncate">
                        {r.supplier_name}
                      </span>
                      <span className="text-sm font-mono tabular-nums font-semibold shrink-0">
                        {fmtMoney(r.total_outstanding)}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {r.buckets.days_1_30.total > 0 && (
                        <Badge className="text-xs bg-warning/10 text-warning border-warning/30">
                          1-30d: {fmtMoney(r.buckets.days_1_30.total)}
                        </Badge>
                      )}
                      {r.buckets.days_31_60.total > 0 && (
                        <Badge className="text-xs bg-warning/10 text-warning border-warning/30">
                          31-60d: {fmtMoney(r.buckets.days_31_60.total)}
                        </Badge>
                      )}
                      {r.buckets.days_61_90.total > 0 && (
                        <Badge className="text-xs bg-destructive/10 text-destructive border-destructive/30">
                          61-90d: {fmtMoney(r.buckets.days_61_90.total)}
                        </Badge>
                      )}
                      {r.buckets.days_over_90.total > 0 && (
                        <Badge className="text-xs bg-destructive/10 text-destructive border-destructive/30">
                          &gt;90d: {fmtMoney(r.buckets.days_over_90.total)}
                        </Badge>
                      )}
                      {!hasOverdue &&
                        r.buckets.days_1_30.total === 0 &&
                        r.buckets.days_31_60.total === 0 && (
                          <span className="text-xs text-muted-foreground">
                            Chưa đến hạn
                          </span>
                        )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-lg border shadow-sm overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/20 hover:bg-muted/20">
                    <TableHead className="text-xs font-semibold uppercase tracking-wider">
                      Nhà cung cấp
                    </TableHead>
                    <TableHead className="text-right text-xs font-semibold uppercase tracking-wider">
                      Chưa đến hạn
                    </TableHead>
                    <TableHead className="text-right text-xs font-semibold uppercase tracking-wider">
                      1-30 ngày
                    </TableHead>
                    <TableHead className="text-right text-xs font-semibold uppercase tracking-wider">
                      31-60 ngày
                    </TableHead>
                    <TableHead className="hidden md:table-cell text-right text-xs font-semibold uppercase tracking-wider">
                      61-90 ngày
                    </TableHead>
                    <TableHead className="hidden md:table-cell text-right text-xs font-semibold uppercase tracking-wider">
                      &gt;90 ngày
                    </TableHead>
                    <TableHead className="text-right text-xs font-semibold uppercase tracking-wider">
                      Tổng
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {apAgingRows.length === 0 && (
                    <TableEmptyStateRow
                      colSpan={7}
                      paddingClassName="py-16"
                      title="Không có công nợ"
                      description="Tất cả hóa đơn đã thanh toán"
                    />
                  )}
                  {apAgingRows.map((r) => (
                    <TableRow
                      key={r.supplier_id}
                      className="hover:bg-muted/30 transition-colors"
                    >
                      <TableCell className="font-medium">
                        {r.supplier_name}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {r.buckets.current.total > 0
                          ? fmtMoney(r.buckets.current.total)
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums text-warning">
                        {r.buckets.days_1_30.total > 0
                          ? fmtMoney(r.buckets.days_1_30.total)
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums text-warning">
                        {r.buckets.days_31_60.total > 0
                          ? fmtMoney(r.buckets.days_31_60.total)
                          : "—"}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-right font-mono tabular-nums text-destructive">
                        {r.buckets.days_61_90.total > 0
                          ? fmtMoney(r.buckets.days_61_90.total)
                          : "—"}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "hidden md:table-cell text-right font-mono tabular-nums",
                          r.buckets.days_over_90.total > 0
                            ? "text-destructive font-semibold"
                            : "",
                        )}
                      >
                        {r.buckets.days_over_90.total > 0
                          ? fmtMoney(r.buckets.days_over_90.total)
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums font-semibold">
                        {fmtMoney(r.total_outstanding)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* Consumption Variance */}
        <TabsContent value="variance" className="mt-4">
          {!loaded["variance"] ? (
            <EmptyReportState />
          ) : isMobile ? (
            <div className="rounded-lg border shadow-sm overflow-hidden divide-y">
              {varianceRows.length === 0 && (
                <div className="py-16 text-center">
                  <p className="text-sm font-medium text-muted-foreground">
                    Không có dữ liệu
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground/70">
                    Chọn chi nhánh và nhấn Xem báo cáo
                  </p>
                </div>
              )}
              {varianceRows.map((r) => {
                const flagMeta = FLAG_META[r.flag] ?? {
                  label: r.flag,
                  className: "bg-muted text-muted-foreground",
                };
                return (
                  <div
                    key={r.ingredient_id}
                    className={cn(
                      "px-4 py-3 space-y-1.5",
                      r.flag === "critical" && "bg-destructive/5",
                      r.flag === "warning" && "bg-warning/5",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium truncate">
                        {r.ingredient_name}
                      </span>
                      <Badge className={cn("text-xs shrink-0", flagMeta.className)}>
                        {flagMeta.label}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 text-xs font-mono tabular-nums">
                      <span>
                        LT: {fmtNum(r.theoretical)} {r.unit}
                      </span>
                      <span>TT: {fmtNum(r.actual)}</span>
                      <span
                        className={cn(
                          r.variance > 0
                            ? "text-destructive"
                            : r.variance < 0
                              ? "text-success"
                              : "",
                        )}
                      >
                        {r.variance > 0 ? "+" : ""}
                        {fmtNum(r.variance)} (
                        {r.variance_pct > 0 ? "+" : ""}
                        {fmtNum(r.variance_pct)}%)
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-lg border shadow-sm overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/20 hover:bg-muted/20">
                    <TableHead className="text-xs font-semibold uppercase tracking-wider">
                      Nguyên liệu
                    </TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider">
                      ĐVT
                    </TableHead>
                    <TableHead className="text-right text-xs font-semibold uppercase tracking-wider">
                      Lý thuyết
                    </TableHead>
                    <TableHead className="text-right text-xs font-semibold uppercase tracking-wider">
                      Thực tế
                    </TableHead>
                    <TableHead className="text-right text-xs font-semibold uppercase tracking-wider">
                      Chênh lệch
                    </TableHead>
                    <TableHead className="text-right text-xs font-semibold uppercase tracking-wider">
                      %
                    </TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider">
                      Mức độ
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {varianceRows.length === 0 && (
                    <TableEmptyStateRow
                      colSpan={7}
                      paddingClassName="py-16"
                      title="Không có dữ liệu"
                      description="Chọn chi nhánh và nhấn Xem báo cáo"
                    />
                  )}
                  {varianceRows.map((r) => {
                    const flagMeta = FLAG_META[r.flag] ?? {
                      label: r.flag,
                      className: "bg-muted text-muted-foreground",
                    };
                    return (
                      <TableRow
                        key={r.ingredient_id}
                        className={cn(
                          "hover:bg-muted/30 transition-colors",
                          r.flag === "critical" && "bg-destructive/5",
                          r.flag === "warning" && "bg-warning/5",
                        )}
                      >
                        <TableCell className="font-medium">
                          {r.ingredient_name}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {r.unit}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums">
                          {fmtNum(r.theoretical)}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums">
                          {fmtNum(r.actual)}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-right font-mono tabular-nums",
                            r.variance > 0
                              ? "text-destructive"
                              : r.variance < 0
                                ? "text-success"
                                : "",
                          )}
                        >
                          {r.variance > 0 ? "+" : ""}
                          {fmtNum(r.variance)}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-right font-mono tabular-nums",
                            r.flag === "critical"
                              ? "text-destructive font-semibold"
                              : r.flag === "warning"
                                ? "text-warning"
                                : "",
                          )}
                        >
                          {r.variance_pct > 0 ? "+" : ""}
                          {fmtNum(r.variance_pct)}%
                        </TableCell>
                        <TableCell>
                          <Badge className={cn("text-xs", flagMeta.className)}>
                            {flagMeta.label}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ─── Shared UI ─── */

const FLAG_META: Record<string, { label: string; className: string }> = {
  ok: {
    label: "Bình thường",
    className: "bg-success/10 text-success border-success/30",
  },
  warning: {
    label: "Cảnh báo",
    className: "bg-warning/10 text-warning border-warning/30",
  },
  critical: {
    label: "Nghiêm trọng",
    className: "bg-destructive/10 text-destructive border-destructive/30",
  },
};

function EmptyReportState() {
  return (
    <Card>
      <CardContent className="py-16 text-center">
        <p className="text-sm font-medium text-muted-foreground">
          Nhấn &quot;Xem báo cáo&quot; để tải dữ liệu
        </p>
        <p className="mt-1 text-xs text-muted-foreground/70">
          Chọn khoảng thời gian và chi nhánh, sau đó nhấn nút xem
        </p>
      </CardContent>
    </Card>
  );
}
