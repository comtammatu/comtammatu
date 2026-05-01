"use client";

import { useState, useTransition } from "react";
import { BRANCH_VI, FORM_VI, PRODUCT_VI } from "@comtammatu/shared/messages";
import { Button } from "@comtammatu/ui/components/button";
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@comtammatu/ui/components/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
import { EmptyStatePanel } from "../../components/empty-state-panel";
import {
  fetchStockMovementReport,
  fetchBranchMovementSummary,
} from "../../../inventory/report-actions";
import type {
  MovementReportRow,
  BranchMovementSummaryRow,
} from "../../../inventory/report-actions";

interface StockMovementClientProps {
  branches: { id: number; name: string }[];
  userBranchId: number | null;
}

function defaultDateRange() {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 7);
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

function fmt(n: number) {
  if (n === 0) return "—";
  return n.toLocaleString("vi-VN", { maximumFractionDigits: 2 });
}

export function StockMovementClient({
  branches,
  userBranchId,
}: StockMovementClientProps) {
  const defaults = defaultDateRange();
  const [startDate, setStartDate] = useState(defaults.startDate);
  const [endDate, setEndDate] = useState(defaults.endDate);
  const [branchId, setBranchId] = useState<string>(
    userBranchId ? String(userBranchId) : "all",
  );
  const [movementRows, setMovementRows] = useState<MovementReportRow[]>([]);
  const [branchRows, setBranchRows] = useState<BranchMovementSummaryRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function load() {
    setError(null);
    startTransition(async () => {
      const brId = branchId === "all" ? undefined : Number(branchId);
      const [movRes, brRes] = await Promise.all([
        fetchStockMovementReport({ startDate, endDate, branchId: brId }),
        fetchBranchMovementSummary({ startDate, endDate }),
      ]);

      if (!movRes.success) {
        setError(movRes.error ?? "Lỗi tải báo cáo");
        return;
      }
      setMovementRows(movRes.data ?? []);
      setBranchRows(brRes.success ? (brRes.data ?? []) : []);
      setLoaded(true);
    });
  }

  function setPreset(days: number) {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days);
    setStartDate(start.toISOString().slice(0, 10));
    setEndDate(end.toISOString().slice(0, 10));
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-full space-y-1.5 sm:w-44 sm:flex-none">
          <Label htmlFor="startDate">{FORM_VI.fromDate}</Label>
          <Input
            id="startDate"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full sm:w-40"
          />
        </div>
        <div className="w-full space-y-1.5 sm:w-44 sm:flex-none">
          <Label htmlFor="endDate">{FORM_VI.toDate}</Label>
          <Input
            id="endDate"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full sm:w-40"
          />
        </div>
        {!userBranchId && (
          <div className="w-full space-y-1.5 sm:w-48 sm:flex-none">
            <Label>{BRANCH_VI.long}</Label>
            <Select value={branchId} onValueChange={setBranchId}>
              <SelectTrigger className="w-full sm:w-44">
                <SelectValue placeholder="Tất cả" />
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
          </div>
        )}
        <div className="flex w-full gap-1.5 sm:w-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPreset(7)}
            className="flex-1 text-xs sm:flex-none"
          >
            7 ngày
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPreset(14)}
            className="flex-1 text-xs sm:flex-none"
          >
            14 ngày
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPreset(30)}
            className="flex-1 text-xs sm:flex-none"
          >
            30 ngày
          </Button>
        </div>
        <Button
          onClick={load}
          disabled={isPending}
          className="w-full sm:w-auto"
        >
          {isPending ? "Đang tải..." : "Xem báo cáo"}
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {!loaded && !error && (
        <EmptyStatePanel
          className="py-12"
          title="Chọn kỳ báo cáo"
        />
      )}

      {loaded && (
        <Tabs defaultValue="detail">
          <TabsList variant="toolbar">
            <TabsTrigger value="detail">
              Chi tiết ({movementRows.length})
            </TabsTrigger>
            <TabsTrigger value="branch">
              Theo chi nhánh ({branchRows.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="detail" className="mt-4">
            {movementRows.length === 0 ? (
              <EmptyStatePanel
                className="py-12"
                title="Không có dữ liệu"
                description="Không có biến động tồn kho trong kỳ đã chọn."
              />
            ) : (
              <>
                <div className="space-y-3 md:hidden">
                  {movementRows.map((row) => (
                    <div
                      key={row.ingredient_id}
                      className="rounded-lg border border-border/70 bg-background p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium">{row.ingredient_name}</p>
                          <p className="text-sm text-muted-foreground">
                            {row.unit}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">
                            Tồn cuối
                          </p>
                          <p className="font-mono font-semibold">
                            {fmt(row.closing)}
                          </p>
                        </div>
                      </div>
                      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <p className="text-muted-foreground">Tồn đầu</p>
                          <p className="mt-1 font-mono">{fmt(row.opening)}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Nhập (GRN)</p>
                          <p className="mt-1 font-mono text-success">
                            {fmt(row.grn_receipt)}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">SX tiêu hao</p>
                          <p className="mt-1 font-mono text-destructive">
                            {fmt(row.production_consumption)}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">SX nhập</p>
                          <p className="mt-1 font-mono text-success">
                            {fmt(row.production_output)}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Chuyển vào</p>
                          <p className="mt-1 font-mono text-success">
                            {fmt(row.transfer_in)}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Chuyển ra</p>
                          <p className="mt-1 font-mono text-destructive">
                            {fmt(row.transfer_out)}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Tiêu thụ</p>
                          <p className="mt-1 font-mono text-destructive">
                            {fmt(row.consumption)}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Điều chỉnh</p>
                          <p className="mt-1 font-mono">
                            {fmt(row.adjustment)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="hidden overflow-x-auto rounded-md border md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-44">{PRODUCT_VI.rawIngredient}</TableHead>
                        <TableHead className="w-16">ĐV</TableHead>
                        <TableHead className="w-24 text-right">
                          Tồn đầu kỳ
                        </TableHead>
                        <TableHead className="w-24 text-right">
                          Nhập (GRN)
                        </TableHead>
                        <TableHead className="w-24 text-right">
                          SX tiêu hao
                        </TableHead>
                        <TableHead className="w-24 text-right">
                          SX nhập
                        </TableHead>
                        <TableHead className="w-24 text-right">
                          Chuyển vào
                        </TableHead>
                        <TableHead className="w-24 text-right">
                          Chuyển ra
                        </TableHead>
                        <TableHead className="w-24 text-right">
                          Tiêu thụ
                        </TableHead>
                        <TableHead className="w-24 text-right">
                          Điều chỉnh
                        </TableHead>
                        <TableHead className="w-24 text-right">
                          Tồn cuối kỳ
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {movementRows.map((row) => (
                        <TableRow key={row.ingredient_id}>
                          <TableCell className="font-medium">
                            {row.ingredient_name}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {row.unit}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {fmt(row.opening)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-success">
                            {fmt(row.grn_receipt)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-destructive">
                            {fmt(row.production_consumption)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-success">
                            {fmt(row.production_output)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-success">
                            {fmt(row.transfer_in)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-destructive">
                            {fmt(row.transfer_out)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-destructive">
                            {fmt(row.consumption)}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {fmt(row.adjustment)}
                          </TableCell>
                          <TableCell className="text-right font-mono font-semibold">
                            {fmt(row.closing)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </TabsContent>

          <TabsContent value="branch" className="mt-4">
            {branchRows.length === 0 ? (
              <EmptyStatePanel
                className="py-12"
                title="Không có dữ liệu"
                description="Không có biến động tồn kho theo chi nhánh trong kỳ đã chọn."
              />
            ) : (
              <>
                <div className="space-y-3 md:hidden">
                  {branchRows.map((row) => (
                    <div
                      key={row.branch_id}
                      className="rounded-lg border border-border/70 bg-background p-4"
                    >
                      <p className="font-medium">{row.branch_name}</p>
                      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <p className="text-muted-foreground">Nhập (GRN)</p>
                          <p className="mt-1 font-mono text-success">
                            {fmt(row.grn_receipt)}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">SX tiêu hao</p>
                          <p className="mt-1 font-mono text-destructive">
                            {fmt(row.production_consumption)}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">SX nhập</p>
                          <p className="mt-1 font-mono text-success">
                            {fmt(row.production_output)}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Chuyển vào</p>
                          <p className="mt-1 font-mono text-success">
                            {fmt(row.transfer_in)}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Chuyển ra</p>
                          <p className="mt-1 font-mono text-destructive">
                            {fmt(row.transfer_out)}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Tiêu thụ</p>
                          <p className="mt-1 font-mono text-destructive">
                            {fmt(row.consumption)}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Điều chỉnh</p>
                          <p className="mt-1 font-mono">
                            {fmt(row.adjustment)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="hidden overflow-x-auto rounded-md border md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-44">{BRANCH_VI.long}</TableHead>
                        <TableHead className="w-24 text-right">
                          Nhập (GRN)
                        </TableHead>
                        <TableHead className="w-24 text-right">
                          SX tiêu hao
                        </TableHead>
                        <TableHead className="w-24 text-right">
                          SX nhập
                        </TableHead>
                        <TableHead className="w-24 text-right">
                          Chuyển vào
                        </TableHead>
                        <TableHead className="w-24 text-right">
                          Chuyển ra
                        </TableHead>
                        <TableHead className="w-24 text-right">
                          Tiêu thụ
                        </TableHead>
                        <TableHead className="w-24 text-right">
                          Điều chỉnh
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {branchRows.map((row) => (
                        <TableRow key={row.branch_id}>
                          <TableCell className="font-medium">
                            {row.branch_name}
                          </TableCell>
                          <TableCell className="text-right font-mono text-success">
                            {fmt(row.grn_receipt)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-destructive">
                            {fmt(row.production_consumption)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-success">
                            {fmt(row.production_output)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-success">
                            {fmt(row.transfer_in)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-destructive">
                            {fmt(row.transfer_out)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-destructive">
                            {fmt(row.consumption)}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {fmt(row.adjustment)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
