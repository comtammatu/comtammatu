"use client";

import { useMemo, useState } from "react";
import { Printer as IconPrinter } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import { AppDialog } from "@/components/form";
import { formatVNDateTime, getVNDateString } from "@comtammatu/shared/time";
import { messages } from "@lib/messages";
import { formatQty } from "@lib/inventory/format";
import type { StockIngredient } from "@lib/inventory/stock-on-hand-model";
import type { IngredientUnitRow } from "@lib/inventory/types";

const copy = messages.inventory.stockOnHandPrint;

export interface StockOnHandPrintDialogProps {
  branchId?: number;
  branchName?: string;
  ingredients: StockIngredient[];
  buttonSize?: "default" | "sm" | "touch" | "touch-lg" | "icon" | "field";
  buttonVariant?: "default" | "outline" | "secondary" | "ghost";
  buttonLabel?: string;
  className?: string;
  defaultMode?: "count_sheet" | "reconciliation";
  defaultPaper?: "a4" | "thermal";
}

export function formatStockConversionHint(
  units: IngredientUnitRow[] | undefined,
  baseUnit: string,
): string {
  if (!units || units.length === 0) return "—";
  const nonBaseUnits = units.filter((u) => !u.is_base && u.to_base_factor > 1);
  if (nonBaseUnits.length === 0) return "—";
  return nonBaseUnits
    .map((u) => `1 ${u.unit_name || u.unit_code} = ${u.to_base_factor} ${baseUnit}`)
    .join(", ");
}

export function StockOnHandPrintDialog({
  branchId,
  branchName,
  ingredients,
  buttonSize = "default",
  buttonVariant = "outline",
  buttonLabel,
  className,
  defaultMode = "reconciliation",
  defaultPaper = "a4",
}: StockOnHandPrintDialogProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"count_sheet" | "reconciliation">(
    defaultMode,
  );
  const [paper, setPaper] = useState<"a4" | "thermal">(defaultPaper);

  const branchDisplayName =
    branchName || copy.branchFallback(branchId);
  const nowIso = getVNDateString();
  const printTimeStr = formatVNDateTime(nowIso);

  const inStockCount = useMemo(
    () => ingredients.filter((item) => item.status === "normal").length,
    [ingredients],
  );
  const lowStockCount = useMemo(
    () => ingredients.filter((item) => item.status === "low").length,
    [ingredients],
  );
  const outOfStockCount = useMemo(
    () => ingredients.filter((item) => item.status === "out").length,
    [ingredients],
  );

  const handlePrint = () => {
    window.print();
  };

  return (
    <>
      <Button
        variant={buttonVariant}
        size={buttonSize === "field" ? "default" : buttonSize}
        type="button"
        className={className}
        onClick={() => setOpen(true)}
      >
        <IconPrinter className="size-4" />
        {buttonLabel ?? copy.printButtonShort}
      </Button>

      <AppDialog
        open={open}
        onOpenChange={setOpen}
        title={copy.previewTitle}
        description={copy.previewDescription(branchDisplayName)}
        footer={
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              {copy.close}
            </Button>
            <Button type="button" variant="default" onClick={handlePrint}>
              <IconPrinter className="size-4" />
              {copy.printNow}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          {/* Print Controls Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3 text-xs print:hidden">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-muted-foreground">
                {copy.formLabel}
              </span>
              <div className="inline-flex gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant={mode === "count_sheet" ? "default" : "outline"}
                  onClick={() => setMode("count_sheet")}
                >
                  {copy.modeCountSheet}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={mode === "reconciliation" ? "default" : "outline"}
                  onClick={() => setMode("reconciliation")}
                >
                  {copy.modeReconciliation}
                </Button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-muted-foreground">
                {copy.paperLabel}
              </span>
              <div className="inline-flex gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant={paper === "a4" ? "default" : "outline"}
                  onClick={() => setPaper("a4")}
                >
                  {copy.paperSizeA4}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={paper === "thermal" ? "default" : "outline"}
                  onClick={() => setPaper("thermal")}
                >
                  {copy.paperSizeThermal}
                </Button>
              </div>
            </div>
          </div>

          {/* Document Preview Container */}
          <div className="max-h-96 overflow-y-auto p-4">
            {paper === "a4" ? (
              <StockA4DocumentView
                branchDisplayName={branchDisplayName}
                ingredients={ingredients}
                mode={mode}
                printTimeStr={printTimeStr}
                inStockCount={inStockCount}
                lowStockCount={lowStockCount}
                outOfStockCount={outOfStockCount}
              />
            ) : (
              <StockThermalDocumentView
                branchDisplayName={branchDisplayName}
                ingredients={ingredients}
                mode={mode}
                printTimeStr={printTimeStr}
                inStockCount={inStockCount}
                lowStockCount={lowStockCount}
                outOfStockCount={outOfStockCount}
              />
            )}
          </div>
        </div>
      </AppDialog>
    </>
  );
}

/* ─── A4 Document View ─── */

function StockA4DocumentView({
  branchDisplayName,
  ingredients,
  mode,
  printTimeStr,
  inStockCount,
  lowStockCount,
  outOfStockCount,
}: {
  branchDisplayName: string;
  ingredients: StockIngredient[];
  mode: "count_sheet" | "reconciliation";
  printTimeStr: string;
  inStockCount: number;
  lowStockCount: number;
  outOfStockCount: number;
}) {
  const isCountSheet = mode === "count_sheet";
  const formCode = isCountSheet
    ? copy.formCodeCountSheet
    : copy.formCodeReconciliation;
  const title = isCountSheet
    ? copy.countSheetTitle
    : copy.reconciliationTitle;
  const subtitle = isCountSheet
    ? copy.countSheetSubtitle
    : copy.reconciliationSubtitle;

  const countSheetColumns = useMemo<DataTableColumn<StockIngredient>[]>(
    () => [
      {
        key: "no",
        header: copy.colNo,
        className: "w-10 text-center",
        render: (_item, idx) => idx + 1,
      },
      {
        key: "item",
        header: copy.colItem,
        className: "min-w-40",
        render: (item) => (
          <div>
            <p className="font-semibold">{item.name}</p>
            {item.sku ? (
              <p className="font-mono text-xs text-muted-foreground">
                {item.sku}
              </p>
            ) : null}
          </div>
        ),
      },
      {
        key: "category",
        header: copy.colCategory,
        className: "w-28 text-xs text-muted-foreground",
        render: (item) => item.category || "—",
      },
      {
        key: "unit",
        header: copy.colBaseUnit,
        className: "w-20 text-center font-medium",
        render: (item) => item.unit,
      },
      {
        key: "pack",
        header: copy.colPackUnit,
        className: "w-36 text-xs text-muted-foreground",
        render: (item) => formatStockConversionHint(item.units, item.unit),
      },
      {
        key: "counted",
        header: copy.countedManualHeader(copy.colCountedQty),
        className: "w-48",
        render: (item) => {
          const nonBaseUnits = (item.units ?? []).filter(
            (u) => !u.is_base && u.to_base_factor > 1,
          );
          const unitLabels = nonBaseUnits
            .map((u) => u.unit_name || u.unit_code)
            .join(" / ");
          return (
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between border-b border-dotted border-border pb-1 text-xs">
                <span className="text-muted-foreground">
                  {copy.quantityEntryLabel}
                </span>
                <span className="text-muted-foreground">
                  {copy.countUnitEntry(unitLabels || item.unit)}
                </span>
              </div>
              <div className="text-right text-xs text-muted-foreground">
                = ............ {item.unit}
              </div>
            </div>
          );
        },
      },
      {
        key: "notes",
        header: copy.colNotes,
        className: "w-32 text-xs text-muted-foreground",
        render: () => " ",
      },
    ],
    [],
  );

  const reconciliationColumns = useMemo<DataTableColumn<StockIngredient>[]>(
    () => [
      {
        key: "no",
        header: copy.colNo,
        className: "w-10 text-center",
        render: (_item, idx) => idx + 1,
      },
      {
        key: "item",
        header: copy.colItem,
        className: "min-w-40",
        render: (item) => (
          <div>
            <p className="font-semibold">{item.name}</p>
            {item.sku ? (
              <p className="font-mono text-xs text-muted-foreground">
                {item.sku}
              </p>
            ) : null}
          </div>
        ),
      },
      {
        key: "category",
        header: copy.colCategory,
        className: "w-28 text-xs text-muted-foreground",
        render: (item) => item.category || "—",
      },
      {
        key: "unit",
        header: copy.colBaseUnit,
        className: "w-20 text-center font-medium",
        render: (item) => item.unit,
      },
      {
        key: "system",
        header: copy.colSystemQty,
        className: "w-28 text-right font-mono font-semibold tabular-nums",
        render: (item) => `${formatQty(item.qty)} ${item.unit}`,
      },
      {
        key: "counted",
        header: copy.countedManualHeader(copy.colCountedQty),
        className: "w-36 text-center text-xs text-muted-foreground",
        render: (item) => `............ ${item.unit}`,
      },
      {
        key: "notes",
        header: copy.colNotes,
        className: "min-w-32 text-xs text-muted-foreground",
        render: () => " ",
      },
    ],
    [],
  );

  return (
    <div
      id="stock-on-hand-print-sheet"
      className="stock-print-sheet mx-auto w-full bg-card p-4 text-card-foreground shadow-xs"
    >
      {/* Header */}
      <div className="flex items-start justify-between border-b border-border pb-3 text-xs leading-relaxed">
        <div>
          <p className="font-semibold uppercase tracking-wider">{copy.companyName}</p>
          <p className="font-semibold text-foreground">
            {copy.brandTitle} — {copy.brandSlogan}
          </p>
          <p className="mt-1">
            <span className="font-medium text-muted-foreground">{copy.branchLabel}</span>{" "}
            <span className="font-semibold">{branchDisplayName}</span>
          </p>
        </div>
        <div className="text-right">
          <p className="font-mono text-muted-foreground">{formCode}</p>
          <p className="text-muted-foreground">
            {copy.printedTime} {printTimeStr}
          </p>
        </div>
      </div>

      {/* Main Title */}
      <div className="my-5 text-center">
        <h1 className="text-lg font-semibold uppercase tracking-wide sm:text-xl">
          {title}
        </h1>
        <p className="mt-1 text-xs font-medium uppercase text-muted-foreground">
          {subtitle}
        </p>
      </div>

      {/* Metadata Grid */}
      <div className="mb-4 grid grid-cols-2 gap-x-6 gap-y-2 bg-muted p-3 text-xs">
        <div>
          <span className="text-muted-foreground">{copy.creatorLabel}</span>{" "}
          <span className="font-semibold">{copy.defaultCreatorName}</span>
        </div>
        <div>
          <span className="text-muted-foreground">{copy.printedTime}</span>{" "}
          <span className="font-mono">{printTimeStr}</span>
        </div>
      </div>

      {/* Table */}
      <DataTable
        columns={isCountSheet ? countSheetColumns : reconciliationColumns}
        data={ingredients}
        getRowKey={(item) => String(item.id)}
      />

      {/* Summary */}
      <div className="mt-3 border-t border-border pt-2 text-xs font-semibold">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>{copy.totalItems(ingredients.length)}</span>
          {!isCountSheet ? (
            <div className="flex items-center gap-3 text-xs font-normal">
              <span className="font-medium text-success">
                {copy.inStockItems(inStockCount)}
              </span>
              {lowStockCount > 0 ? (
                <span className="font-medium text-warning">
                  {copy.lowStockItems(lowStockCount)}
                </span>
              ) : null}
              {outOfStockCount > 0 ? (
                <span className="font-medium text-destructive">
                  {copy.outOfStockItems(outOfStockCount)}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {/* Signatures */}
      <div className="mt-8 pt-4">
        <div className="grid grid-cols-3 gap-4 text-center text-xs">
          <div>
            <p className="font-semibold uppercase tracking-wider">{copy.signCreator}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{copy.signHint}</p>
            <div className="h-16" />
            <p className="border-t border-dotted border-border pt-1 text-xs text-muted-foreground">
              {copy.signHint}
            </p>
          </div>
          <div>
            <p className="font-semibold uppercase tracking-wider">{copy.signHeadChef}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{copy.signHint}</p>
            <div className="h-16" />
            <p className="border-t border-dotted border-border pt-1 text-xs text-muted-foreground">
              {copy.signHint}
            </p>
          </div>
          <div>
            <p className="font-semibold uppercase tracking-wider">{copy.signManager}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{copy.signHint}</p>
            <div className="h-16" />
            <p className="border-t border-dotted border-border pt-1 text-xs text-muted-foreground">
              {copy.signHint}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Thermal Document View ─── */

function StockThermalDocumentView({
  branchDisplayName,
  ingredients,
  mode,
  printTimeStr,
  inStockCount,
  lowStockCount,
  outOfStockCount,
}: {
  branchDisplayName: string;
  ingredients: StockIngredient[];
  mode: "count_sheet" | "reconciliation";
  printTimeStr: string;
  inStockCount: number;
  lowStockCount: number;
  outOfStockCount: number;
}) {
  const isCountSheet = mode === "count_sheet";

  return (
    <div
      id="stock-on-hand-thermal-sheet"
      className="stock-thermal-sheet mx-auto w-full max-w-xs bg-background p-3 font-mono text-xs text-foreground shadow-xs"
    >
      {/* Header */}
      <div className="text-center">
        <p className="text-sm font-semibold tracking-wider">{copy.companyName}</p>
        <p className="text-xs font-semibold">{copy.brandTitle}</p>
        <p className="text-xs text-muted-foreground">{copy.brandSlogan}</p>
        <div className="my-1.5 border-b border-dashed border-border" />
        <p className="text-xs font-semibold uppercase">
          {isCountSheet ? copy.modeCountSheet : copy.modeReconciliation}
        </p>
      </div>

      <div className="my-2 border-b border-dashed border-border" />

      {/* Meta */}
      <div className="flex flex-col gap-1 text-xs">
        <div className="flex justify-between">
          <span className="text-muted-foreground">{copy.thermalWarehouseLabel}</span>
          <span className="font-semibold">{branchDisplayName}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">{copy.thermalTimeLabel}</span>
          <span>{printTimeStr}</span>
        </div>
      </div>

      <div className="my-2 border-b border-dashed border-border" />

      {/* Items List */}
      <div className="flex flex-col gap-2">
        {ingredients.map((item, idx) => {
          const conversionHint = formatStockConversionHint(item.units, item.unit);

          return (
            <div key={item.id ?? idx} className="text-2xs">
              <div className="flex justify-between gap-1 font-semibold">
                <span className="truncate">
                  {idx + 1}. {item.name}
                </span>
                <span className="shrink-0 text-right">
                  {isCountSheet ? (
                    <span className="text-3xs">[.......] {item.unit}</span>
                  ) : (
                    <span className="font-mono tabular-nums">
                      {copy.thermalSystemQuantity(formatQty(item.qty), item.unit)}
                    </span>
                  )}
                </span>
              </div>
              {conversionHint !== "—" ? (
                <p className="text-3xs text-muted-foreground">
                  ({conversionHint})
                </p>
              ) : null}
              {!isCountSheet ? (
                <div className="text-right text-3xs text-muted-foreground">
                  {copy.thermalActualLabel(item.unit)}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="my-2 border-b border-dashed border-border" />

      {/* Summary */}
      <div className="flex flex-col gap-1 text-2xs">
        <div className="flex justify-between">
          <span>{copy.totalItems(ingredients.length)}</span>
          {!isCountSheet ? (
            <span className="font-semibold">
              {copy.thermalSummary(inStockCount, lowStockCount, outOfStockCount)}
            </span>
          ) : null}
        </div>
      </div>

      <div className="my-3 border-b border-dashed border-border" />

      {/* Signatures */}
      <div className="grid grid-cols-2 gap-2 pt-1 text-center text-3xs">
        <div>
          <p className="font-semibold">{copy.thermalCreatorSign}</p>
          <p className="text-muted-foreground">{copy.signSimpleHint}</p>
          <div className="h-10" />
        </div>
        <div>
          <p className="font-semibold">{copy.thermalStorekeeperSign}</p>
          <p className="text-muted-foreground">{copy.signSimpleHint}</p>
          <div className="h-10" />
        </div>
      </div>

      <div className="pt-2 text-center text-3xs text-muted-foreground">
        <p>{copy.footerSystem}</p>
      </div>
    </div>
  );
}
