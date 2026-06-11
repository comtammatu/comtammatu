"use client";

import { useState, useTransition } from "react";
import { BRANCH_VI, FORM_VI, PRODUCT_VI } from "@comtammatu/shared/messages";
import { addVNDateDays, getVNDateString } from "@comtammatu/shared/time";
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
import { AppEmptyState } from "@/components/surface";
import {
  fetchBranchMovementSummary,
  fetchStockMovementReport,
} from "@/_actions/inventory";
import type {
  BranchMovementSummaryRow,
  MovementReportRow,
} from "@/_actions/inventory";
import { messages } from "@lib/messages";

const stockMovementCopy = messages.admin.reports.stockMovement;

interface StockMovementClientProps {
  branches: { id: number; name: string }[];
  userBranchId: number | null;
}

function defaultDateRange() {
  const endDate = getVNDateString();
  return {
    startDate: addVNDateDays(endDate, -7),
    endDate,
  };
}

function fmt(n: number) {
  if (n === 0) return messages.inventory.common.noValue;
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
        setError(movRes.error ?? stockMovementCopy.loadError);
        return;
      }
      setMovementRows(movRes.data ?? []);
      setBranchRows(brRes.success ? (brRes.data ?? []) : []);
      setLoaded(true);
    });
  }

  function setPreset(days: number) {
    const endDate = getVNDateString();
    setStartDate(addVNDateDays(endDate, -days));
    setEndDate(endDate);
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
                <SelectValue
                  placeholder={stockMovementCopy.allBranchesPlaceholder}
                />
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
            {stockMovementCopy.dayPreset(7)}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPreset(14)}
            className="flex-1 text-xs sm:flex-none"
          >
            {stockMovementCopy.dayPreset(14)}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPreset(30)}
            className="flex-1 text-xs sm:flex-none"
          >
            {stockMovementCopy.dayPreset(30)}
          </Button>
        </div>
        <Button
          onClick={load}
          disabled={isPending}
          className="w-full sm:w-auto"
        >
          {isPending ? stockMovementCopy.loading : stockMovementCopy.viewReport}
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {!loaded && !error && (
        <AppEmptyState title={stockMovementCopy.choosePeriodTitle} />
      )}

      {loaded && (
        <Tabs defaultValue="detail">
          <TabsList variant="toolbar">
            <TabsTrigger value="detail">
              {stockMovementCopy.detailTab(movementRows.length)}
            </TabsTrigger>
            <TabsTrigger value="branch">
              {stockMovementCopy.branchTab(branchRows.length)}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="detail" className="mt-4">
            {movementRows.length === 0 ? (
              <AppEmptyState
                title={stockMovementCopy.emptyTitle}
                description={stockMovementCopy.detailEmptyDescription}
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
                            {stockMovementCopy.closing}
                          </p>
                          <p className="font-mono font-semibold">
                            {fmt(row.closing)}
                          </p>
                        </div>
                      </div>
                      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <p className="text-muted-foreground">
                            {stockMovementCopy.opening}
                          </p>
                          <p className="mt-1 font-mono">{fmt(row.opening)}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">
                            {stockMovementCopy.grnReceipt}
                          </p>
                          <p className="mt-1 font-mono text-success">
                            {fmt(row.grn_receipt)}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">
                            {stockMovementCopy.productionConsumption}
                          </p>
                          <p className="mt-1 font-mono text-destructive">
                            {fmt(row.production_consumption)}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">
                            {stockMovementCopy.productionOutput}
                          </p>
                          <p className="mt-1 font-mono text-success">
                            {fmt(row.production_output)}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">
                            {stockMovementCopy.transferIn}
                          </p>
                          <p className="mt-1 font-mono text-success">
                            {fmt(row.transfer_in)}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">
                            {stockMovementCopy.transferOut}
                          </p>
                          <p className="mt-1 font-mono text-destructive">
                            {fmt(row.transfer_out)}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">
                            {stockMovementCopy.consumption}
                          </p>
                          <p className="mt-1 font-mono text-destructive">
                            {fmt(row.consumption)}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">
                            {stockMovementCopy.adjustment}
                          </p>
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
                        <TableHead className="min-w-44">
                          {PRODUCT_VI.rawIngredient}
                        </TableHead>
                        <TableHead className="w-16">
                          {stockMovementCopy.unit}
                        </TableHead>
                        <TableHead className="w-24 text-right">
                          {stockMovementCopy.openingPeriod}
                        </TableHead>
                        <TableHead className="w-24 text-right">
                          {stockMovementCopy.grnReceipt}
                        </TableHead>
                        <TableHead className="w-24 text-right">
                          {stockMovementCopy.productionConsumption}
                        </TableHead>
                        <TableHead className="w-24 text-right">
                          {stockMovementCopy.productionOutput}
                        </TableHead>
                        <TableHead className="w-24 text-right">
                          {stockMovementCopy.transferIn}
                        </TableHead>
                        <TableHead className="w-24 text-right">
                          {stockMovementCopy.transferOut}
                        </TableHead>
                        <TableHead className="w-24 text-right">
                          {stockMovementCopy.consumption}
                        </TableHead>
                        <TableHead className="w-24 text-right">
                          {stockMovementCopy.adjustment}
                        </TableHead>
                        <TableHead className="w-24 text-right">
                          {stockMovementCopy.closingPeriod}
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
              <AppEmptyState
                title={stockMovementCopy.emptyTitle}
                description={stockMovementCopy.branchEmptyDescription}
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
                          <p className="text-muted-foreground">
                            {stockMovementCopy.grnReceipt}
                          </p>
                          <p className="mt-1 font-mono text-success">
                            {fmt(row.grn_receipt)}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">
                            {stockMovementCopy.productionConsumption}
                          </p>
                          <p className="mt-1 font-mono text-destructive">
                            {fmt(row.production_consumption)}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">
                            {stockMovementCopy.productionOutput}
                          </p>
                          <p className="mt-1 font-mono text-success">
                            {fmt(row.production_output)}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">
                            {stockMovementCopy.transferIn}
                          </p>
                          <p className="mt-1 font-mono text-success">
                            {fmt(row.transfer_in)}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">
                            {stockMovementCopy.transferOut}
                          </p>
                          <p className="mt-1 font-mono text-destructive">
                            {fmt(row.transfer_out)}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">
                            {stockMovementCopy.consumption}
                          </p>
                          <p className="mt-1 font-mono text-destructive">
                            {fmt(row.consumption)}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">
                            {stockMovementCopy.adjustment}
                          </p>
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
                        <TableHead className="min-w-44">
                          {BRANCH_VI.long}
                        </TableHead>
                        <TableHead className="w-24 text-right">
                          {stockMovementCopy.grnReceipt}
                        </TableHead>
                        <TableHead className="w-24 text-right">
                          {stockMovementCopy.productionConsumption}
                        </TableHead>
                        <TableHead className="w-24 text-right">
                          {stockMovementCopy.productionOutput}
                        </TableHead>
                        <TableHead className="w-24 text-right">
                          {stockMovementCopy.transferIn}
                        </TableHead>
                        <TableHead className="w-24 text-right">
                          {stockMovementCopy.transferOut}
                        </TableHead>
                        <TableHead className="w-24 text-right">
                          {stockMovementCopy.consumption}
                        </TableHead>
                        <TableHead className="w-24 text-right">
                          {stockMovementCopy.adjustment}
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
