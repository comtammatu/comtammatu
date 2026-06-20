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
import { cn } from "@comtammatu/ui";
import { AppEmptyState } from "@/components/surface";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import {
  Item,
  ItemContent,
  ItemHeader,
} from "@comtammatu/ui/components/item";
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

function qtyColumn<T>(
  key: string,
  header: string,
  value: (row: T) => number,
  tone?: "success" | "destructive" | "strong",
): DataTableColumn<T> {
  return {
    key,
    header,
    className: "w-24 text-right",
    render: (row) => (
      <span
        className={cn(
          "font-mono tabular-nums",
          tone === "success" && "text-success",
          tone === "destructive" && "text-destructive",
          tone === "strong" && "font-semibold",
        )}
      >
        {fmt(value(row))}
      </span>
    ),
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

  const detailColumns: DataTableColumn<MovementReportRow>[] = [
    {
      key: "ingredient",
      header: PRODUCT_VI.rawIngredient,
      className: "min-w-44",
      render: (row) => <span className="font-medium">{row.ingredient_name}</span>,
    },
    {
      key: "unit",
      header: stockMovementCopy.unit,
      className: "w-16 text-muted-foreground",
      render: (row) => row.unit,
    },
    qtyColumn<MovementReportRow>(
      "opening",
      stockMovementCopy.openingPeriod,
      (row) => row.opening,
    ),
    qtyColumn<MovementReportRow>(
      "grn_receipt",
      stockMovementCopy.grnReceipt,
      (row) => row.grn_receipt,
      "success",
    ),
    qtyColumn<MovementReportRow>(
      "production_consumption",
      stockMovementCopy.productionConsumption,
      (row) => row.production_consumption,
      "destructive",
    ),
    qtyColumn<MovementReportRow>(
      "production_output",
      stockMovementCopy.productionOutput,
      (row) => row.production_output,
      "success",
    ),
    qtyColumn<MovementReportRow>(
      "transfer_in",
      stockMovementCopy.transferIn,
      (row) => row.transfer_in,
      "success",
    ),
    qtyColumn<MovementReportRow>(
      "transfer_out",
      stockMovementCopy.transferOut,
      (row) => row.transfer_out,
      "destructive",
    ),
    qtyColumn<MovementReportRow>(
      "consumption",
      stockMovementCopy.consumption,
      (row) => row.consumption,
      "destructive",
    ),
    qtyColumn<MovementReportRow>(
      "adjustment",
      stockMovementCopy.adjustment,
      (row) => row.adjustment,
    ),
    qtyColumn<MovementReportRow>(
      "closing",
      stockMovementCopy.closingPeriod,
      (row) => row.closing,
      "strong",
    ),
  ];

  const branchColumns: DataTableColumn<BranchMovementSummaryRow>[] = [
    {
      key: "branch",
      header: BRANCH_VI.long,
      className: "min-w-44",
      render: (row) => <span className="font-medium">{row.branch_name}</span>,
    },
    qtyColumn<BranchMovementSummaryRow>(
      "grn_receipt",
      stockMovementCopy.grnReceipt,
      (row) => row.grn_receipt,
      "success",
    ),
    qtyColumn<BranchMovementSummaryRow>(
      "production_consumption",
      stockMovementCopy.productionConsumption,
      (row) => row.production_consumption,
      "destructive",
    ),
    qtyColumn<BranchMovementSummaryRow>(
      "production_output",
      stockMovementCopy.productionOutput,
      (row) => row.production_output,
      "success",
    ),
    qtyColumn<BranchMovementSummaryRow>(
      "transfer_in",
      stockMovementCopy.transferIn,
      (row) => row.transfer_in,
      "success",
    ),
    qtyColumn<BranchMovementSummaryRow>(
      "transfer_out",
      stockMovementCopy.transferOut,
      (row) => row.transfer_out,
      "destructive",
    ),
    qtyColumn<BranchMovementSummaryRow>(
      "consumption",
      stockMovementCopy.consumption,
      (row) => row.consumption,
      "destructive",
    ),
    qtyColumn<BranchMovementSummaryRow>(
      "adjustment",
      stockMovementCopy.adjustment,
      (row) => row.adjustment,
    ),
  ];
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
    <div className="flex flex-col gap-4">
      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex w-full flex-col gap-1.5 sm:w-44 sm:flex-none">
          <Label htmlFor="startDate">{FORM_VI.fromDate}</Label>
          <Input
            id="startDate"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full sm:w-40"
          />
        </div>
        <div className="flex w-full flex-col gap-1.5 sm:w-44 sm:flex-none">
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
          <div className="flex w-full flex-col gap-1.5 sm:w-48 sm:flex-none">
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

          <TabsContent value="detail">
<DataTable
              columns={detailColumns}
              data={movementRows}
              getRowKey={(row) => row.ingredient_id}
              emptyTitle={stockMovementCopy.emptyTitle}
              emptyDescription={stockMovementCopy.detailEmptyDescription}
              className="md:overflow-x-auto"
              mobileCardRender={(row) => (
                <Item variant="outline" className="flex-col items-stretch">
                  <ItemHeader className="items-start">
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
                  </ItemHeader>
                  <ItemContent className="mt-4 grid grid-cols-2 gap-3 text-sm">
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
                      <p className="mt-1 font-mono">{fmt(row.adjustment)}</p>
                    </div>
                  </ItemContent>
                </Item>
              )}
            />
          </TabsContent>

          <TabsContent value="branch">
<DataTable
              columns={branchColumns}
              data={branchRows}
              getRowKey={(row) => row.branch_id}
              emptyTitle={stockMovementCopy.emptyTitle}
              emptyDescription={stockMovementCopy.branchEmptyDescription}
              className="md:overflow-x-auto"
              mobileCardRender={(row) => (
                <Item variant="outline" className="flex-col items-stretch">
                  <p className="font-medium">{row.branch_name}</p>
                  <ItemContent className="mt-4 grid grid-cols-2 gap-3 text-sm">
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
                      <p className="mt-1 font-mono">{fmt(row.adjustment)}</p>
                    </div>
                  </ItemContent>
                </Item>
              )}
            />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
