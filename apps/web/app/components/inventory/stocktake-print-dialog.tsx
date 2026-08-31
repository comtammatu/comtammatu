"use client";

import { useMemo, useRef, useState } from "react";
import { Printer as IconPrinter } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import { AppDialog } from "@/components/form";
import { formatVNDateTime, getVNDateString } from "@comtammatu/shared/time";
import { messages } from "@lib/messages";
import { printDocumentElement } from "@lib/printing/print-document";
import { formatQty } from "@lib/inventory/format";
import {
  formatQuantityInLargestUnits,
  formatQuantityUnitBreakdown,
  type QuantityUnitFormatRow,
} from "@lib/inventory/quantity-unit-format";

const copy = messages.inventory.stocktakePrint;

export interface StocktakePrintSession {
  id: number;
  sessionNumber?: string | null;
  branchId?: number;
  branchName?: string;
  startedAt?: string | null;
  completedAt?: string | null;
  createdAt?: string;
  createdByName?: string;
  status: string;
  notes?: string | null;
  currentRound?: number;
}

export interface StocktakePrintLine {
  id: number;
  ingredientId: number;
  ingredientName: string;
  sku?: string | null;
  category?: string | null;
  unit: string;
  systemQuantity?: number | null;
  countedQuantity?: number | null;
  variance?: number | null;
  varianceReason?: string | null;
  reasonCode?: string | null;
}

export interface StocktakeCountUnitOption {
  unitId: number;
  code: string;
  label: string;
  isBase: boolean;
  toBaseFactor: number;
}

interface StocktakePrintDialogProps {
  session: StocktakePrintSession;
  lines: StocktakePrintLine[];
  unitOptionsByIngredient?: Record<number, StocktakeCountUnitOption[]>;
  buttonSize?: "default" | "sm" | "touch" | "touch-lg" | "icon";
  buttonVariant?: "default" | "outline" | "secondary" | "ghost";
  buttonLabel?: string;
  className?: string;
  defaultMode?: "count_sheet" | "reconciliation";
  defaultPaper?: "a4" | "thermal";
}

function getSessionCode(session: StocktakePrintSession): string {
  return session.sessionNumber?.trim() || `KK-${session.id}`;
}

export function toQuantityUnitFormatRows(
  units: StocktakeCountUnitOption[] | undefined,
  baseUnitCode: string,
): QuantityUnitFormatRow[] {
  const active = (units ?? []).filter(
    (u) => (u.code || u.label) && Number(u.toBaseFactor) > 0,
  );
  if (active.length === 0) {
    return [
      {
        unit_code: baseUnitCode,
        to_base_factor: 1,
        is_base: true,
        is_active: true,
        sort_order: 0,
      },
    ];
  }
  return active.map((u, idx) => ({
    unit_code: u.label?.trim() || u.code,
    to_base_factor: u.toBaseFactor,
    is_base: u.isBase,
    is_active: true,
    sort_order: idx,
  }));
}

export function getIngredientUnits(
  ingredientId: number,
  baseUnitCode: string,
  unitOptionsByIngredient: Record<number, StocktakeCountUnitOption[]>,
): StocktakeCountUnitOption[] {
  const options = unitOptionsByIngredient[ingredientId] ?? [];
  if (options.length === 0) {
    return [
      {
        unitId: 0,
        code: baseUnitCode,
        label: baseUnitCode,
        isBase: true,
        toBaseFactor: 1,
      },
    ];
  }
  return [...options].sort((a, b) => {
    if (a.isBase !== b.isBase) return a.isBase ? 1 : -1;
    return b.toBaseFactor - a.toBaseFactor;
  });
}

export function formatPackSpecification(
  units: StocktakeCountUnitOption[],
  baseUnitCode: string,
): string {
  const nonBaseUnits = units.filter((u) => !u.isBase && u.toBaseFactor > 1);
  if (nonBaseUnits.length === 0) return baseUnitCode || "—";
  return nonBaseUnits
    .map((u) => `1 ${u.label} = ${formatQty(u.toBaseFactor)} ${baseUnitCode}`)
    .join(", ");
}

export function formatConversionHint(
  units: StocktakeCountUnitOption[],
  baseUnitCode: string,
): string {
  const nonBaseUnits = units.filter((u) => !u.isBase && u.toBaseFactor > 1);
  if (nonBaseUnits.length === 0) return "—";
  return nonBaseUnits
    .map((u) => `1 ${u.label} = ${formatQty(u.toBaseFactor)} ${baseUnitCode}`)
    .join(", ");
}

export function StocktakePrintDialog({
  session,
  lines,
  unitOptionsByIngredient = {},
  buttonSize = "default",
  buttonVariant = "outline",
  buttonLabel,
  className,
  defaultMode,
  defaultPaper = "a4",
}: StocktakePrintDialogProps) {
  const [open, setOpen] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);
  const initialMode =
    defaultMode ??
    (session.status === "completed" ? "reconciliation" : "count_sheet");
  const [mode, setMode] = useState<"count_sheet" | "reconciliation">(
    initialMode,
  );
  const [paper, setPaper] = useState<"a4" | "thermal">(defaultPaper);

  const sessionCode = getSessionCode(session);
  const branchDisplayName =
    session.branchName || copy.branchFallback(session.branchId);
  const nowIso = getVNDateString();
  const printTimeStr = formatVNDateTime(nowIso);
  const currentRound = session.currentRound ?? 1;

  const matchedCount = useMemo(
    () =>
      lines.filter(
        (l) =>
          l.variance === 0 ||
          (l.countedQuantity != null &&
            l.systemQuantity != null &&
            l.countedQuantity === l.systemQuantity),
      ).length,
    [lines],
  );

  const varianceLines = useMemo(
    () =>
      lines.filter((l) => {
        if (l.variance != null) return l.variance !== 0;
        if (l.countedQuantity != null && l.systemQuantity != null) {
          return l.countedQuantity !== l.systemQuantity;
        }
        return false;
      }),
    [lines],
  );

  const handlePrint = () => {
    printDocumentElement(printRef.current);
  };

  return (
    <>
      <Button
        variant={buttonVariant}
        size={buttonSize}
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
        description={copy.previewDescription(sessionCode)}
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
            <div ref={printRef}>
              {paper === "a4" ? (
                <A4DocumentView
                  session={session}
                  sessionCode={sessionCode}
                  branchDisplayName={branchDisplayName}
                  lines={lines}
                  unitOptionsByIngredient={unitOptionsByIngredient}
                  mode={mode}
                  currentRound={currentRound}
                  printTimeStr={printTimeStr}
                  matchedCount={matchedCount}
                  varianceCount={varianceLines.length}
                />
              ) : (
                <ThermalDocumentView
                  session={session}
                  sessionCode={sessionCode}
                  branchDisplayName={branchDisplayName}
                  lines={lines}
                  unitOptionsByIngredient={unitOptionsByIngredient}
                  mode={mode}
                  currentRound={currentRound}
                  printTimeStr={printTimeStr}
                  matchedCount={matchedCount}
                  varianceCount={varianceLines.length}
                />
              )}
            </div>
          </div>
        </div>
      </AppDialog>
    </>
  );
}

/* ─── A4 Document Sheet ─── */

function A4DocumentView({
  session,
  sessionCode,
  branchDisplayName,
  lines,
  unitOptionsByIngredient,
  mode,
  currentRound,
  printTimeStr,
  matchedCount,
  varianceCount,
}: {
  session: StocktakePrintSession;
  sessionCode: string;
  branchDisplayName: string;
  lines: StocktakePrintLine[];
  unitOptionsByIngredient: Record<number, StocktakeCountUnitOption[]>;
  mode: "count_sheet" | "reconciliation";
  currentRound: number;
  printTimeStr: string;
  matchedCount: number;
  varianceCount: number;
}) {
  const isCountSheet = mode === "count_sheet";
  const formCode = isCountSheet
    ? copy.formCodeCountSheet
    : copy.formCodeReconciliation;
  const title = isCountSheet ? copy.countSheetTitle : copy.reconciliationTitle;
  const subtitle = isCountSheet
    ? copy.countSheetSubtitle(currentRound)
    : copy.reconciliationSubtitle;

  const countSheetColumns = useMemo<DataTableColumn<StocktakePrintLine>[]>(
    () => [
      {
        key: "no",
        header: copy.colNo,
        className: "w-10 text-center",
        render: (_line, idx) => idx + 1,
      },
      {
        key: "item",
        header: copy.colItem,
        className: "min-w-40",
        render: (line) => (
          <div>
            <p className="font-semibold">{line.ingredientName}</p>
            {line.sku ? (
              <p className="font-mono text-xs text-muted-foreground">
                {line.sku}
              </p>
            ) : null}
          </div>
        ),
      },
      {
        key: "unit",
        header: copy.colBaseUnit,
        className: "w-20 text-center font-medium",
        render: (line) => line.unit,
      },
      {
        key: "pack",
        header: copy.colPackUnit,
        className: "w-44 text-xs text-muted-foreground",
        render: (line) => {
          const units = unitOptionsByIngredient[line.ingredientId] ?? [];
          return formatPackSpecification(units, line.unit);
        },
      },
      {
        key: "counted",
        header: copy.countedManualHeader(copy.colCountedQty),
        className: "w-52",
        render: (line) => {
          const units = getIngredientUnits(
            line.ingredientId,
            line.unit,
            unitOptionsByIngredient,
          );
          return (
            <div className="flex flex-col gap-1 text-xs">
              {units.map((u) => (
                <div
                  key={u.unitId || u.code}
                  className="flex items-center justify-between border-b border-dotted border-border/80 pb-0.5"
                >
                  <span className="font-mono text-muted-foreground">[ ........... ]</span>
                  <span className="font-medium text-foreground">{u.label}</span>
                </div>
              ))}
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
    [unitOptionsByIngredient],
  );

  const reconciliationColumns = useMemo<DataTableColumn<StocktakePrintLine>[]>(
    () => [
      {
        key: "no",
        header: copy.colNo,
        className: "w-10 text-center",
        render: (_line, idx) => idx + 1,
      },
      {
        key: "item",
        header: copy.colItem,
        className: "min-w-40",
        render: (line) => (
          <div>
            <p className="font-semibold">{line.ingredientName}</p>
            {line.sku ? (
              <p className="font-mono text-xs text-muted-foreground">
                {line.sku}
              </p>
            ) : null}
          </div>
        ),
      },
      {
        key: "unit",
        header: copy.colBaseUnit,
        className: "w-20 text-center font-medium",
        render: (line) => line.unit,
      },
      {
        key: "system",
        header: copy.colSystemQty,
        className: "w-28 text-right font-mono text-xs tabular-nums",
        render: (line) => {
          const units = unitOptionsByIngredient[line.ingredientId] ?? [];
          const fmtUnits = toQuantityUnitFormatRows(units, line.unit);
          const systemQty = line.systemQuantity ?? 0;
          const { big, base } = formatQuantityUnitBreakdown(
            systemQty,
            fmtUnits,
            formatQty,
          );
          if (big) {
            return (
              <div className="flex flex-col items-end">
                <span className="font-semibold text-foreground">{big}</span>
                <span className="text-3xs text-muted-foreground">({base})</span>
              </div>
            );
          }
          return (
            <span>
              {formatQty(systemQty)} {line.unit}
            </span>
          );
        },
      },
      {
        key: "actual",
        header: copy.colActualQty,
        className: "w-28 text-right font-mono text-xs font-semibold tabular-nums",
        render: (line) => {
          if (line.countedQuantity == null) return "—";
          const units = unitOptionsByIngredient[line.ingredientId] ?? [];
          const fmtUnits = toQuantityUnitFormatRows(units, line.unit);
          const countedQty = line.countedQuantity;
          const { big, base } = formatQuantityUnitBreakdown(
            countedQty,
            fmtUnits,
            formatQty,
          );
          if (big) {
            return (
              <div className="flex flex-col items-end">
                <span className="font-semibold text-foreground">{big}</span>
                <span className="text-3xs text-muted-foreground font-normal">
                  ({base})
                </span>
              </div>
            );
          }
          return (
            <span>
              {formatQty(countedQty)} {line.unit}
            </span>
          );
        },
      },
      {
        key: "variance",
        header: copy.colVariance,
        className: "w-28 text-right font-mono text-xs font-semibold tabular-nums",
        render: (line) => {
          const variance =
            line.variance ??
            (line.countedQuantity != null
              ? line.countedQuantity - (line.systemQuantity ?? 0)
              : null);
          if (variance == null) return "—";
          if (variance === 0) {
            return <span className="text-muted-foreground">0 {line.unit}</span>;
          }
          const units = unitOptionsByIngredient[line.ingredientId] ?? [];
          const fmtUnits = toQuantityUnitFormatRows(units, line.unit);
          const formatted = formatQuantityInLargestUnits(
            variance,
            fmtUnits,
            formatQty,
          );
          const sign = variance > 0 ? "+" : "";
          return (
            <span className={variance < 0 ? "text-destructive" : ""}>
              {`${sign}${formatted}`}
            </span>
          );
        },
      },
      {
        key: "reason",
        header: copy.colVarianceReason,
        className: "min-w-36 text-xs",
        render: (line) => {
          const variance =
            line.variance ??
            (line.countedQuantity != null
              ? line.countedQuantity - (line.systemQuantity ?? 0)
              : null);
          if (variance === 0) {
            return (
              <span className="text-muted-foreground">{copy.matchedExact}</span>
            );
          }
          return (
            <span>
              {line.varianceReason ||
                (line.reasonCode
                  ? copy.reasonCode(line.reasonCode)
                  : copy.missingVarianceReason)}
            </span>
          );
        },
      },
    ],
    [unitOptionsByIngredient],
  );

  return (
    <div
      id="stocktake-print-sheet"
      className="stocktake-print-sheet stocktake-a4-sheet mx-auto w-full bg-card p-4 text-card-foreground shadow-xs"
    >
      {/* Header Organization & Meta */}
      <div className="flex items-start justify-between border-b border-border pb-3 text-xs leading-relaxed">
        <div>
          <p className="font-semibold uppercase tracking-wider">
            {copy.companyName}
          </p>
          <p className="font-semibold text-foreground">
            {copy.brandTitle} — {copy.brandSlogan}
          </p>
          <p className="mt-1">
            <span className="font-medium text-muted-foreground">
              {copy.branchLabel}
            </span>{" "}
            <span className="font-semibold">{branchDisplayName}</span>
          </p>
        </div>
        <div className="text-right">
          <p className="font-mono text-muted-foreground">{formCode}</p>
          <p className="font-mono font-semibold">
            {copy.sessionLabel} {sessionCode}
          </p>
          <p className="text-muted-foreground">
            {copy.printedTime} {printTimeStr}
          </p>
        </div>
      </div>

      {/* Main Form Title */}
      <div className="my-5 text-center">
        <h1 className="text-lg font-semibold uppercase tracking-wide sm:text-xl">
          {title}
        </h1>
        <p className="mt-1 text-xs font-medium uppercase text-muted-foreground">
          {subtitle}
        </p>
      </div>

      {/* Session Metadata Grid */}
      <div className="mb-4 grid grid-cols-2 gap-x-6 gap-y-2 bg-muted p-3 text-xs">
        <div>
          <span className="text-muted-foreground">{copy.creatorLabel}</span>{" "}
          <span className="font-semibold">
            {session.createdByName || copy.defaultCreatorName}
          </span>
        </div>
        <div>
          <span className="text-muted-foreground">{copy.startedTime}</span>{" "}
          <span className="font-mono">
            {session.startedAt || session.createdAt
              ? formatVNDateTime(session.startedAt ?? session.createdAt ?? "")
              : "—"}
          </span>
        </div>
        <div>
          <span className="text-muted-foreground">{copy.roundLabel}</span>{" "}
          <span className="font-semibold">{copy.roundValue(currentRound)}</span>
        </div>
        <div>
          <span className="text-muted-foreground">{copy.completedTime}</span>{" "}
          <span className="font-mono">
            {session.completedAt
              ? formatVNDateTime(session.completedAt)
              : copy.inProgress}
          </span>
        </div>
        {session.notes ? (
          <div className="col-span-2 border-t border-border pt-1 text-muted-foreground">
            <span className="font-medium">{copy.notesLabel}</span>{" "}
            {session.notes}
          </div>
        ) : null}
      </div>

      {/* Main Table */}
      <DataTable
        columns={isCountSheet ? countSheetColumns : reconciliationColumns}
        data={lines}
        getRowKey={(line) => String(line.id)}
      />

      {/* Summary Section */}
      <div className="mt-3 border-t border-border pt-2 text-xs font-semibold">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>{copy.totalItems(lines.length)}</span>
          {!isCountSheet ? (
            <div className="flex items-center gap-4 text-xs font-normal">
              <span className="font-medium text-muted-foreground">
                {copy.matchedItems(matchedCount)}
              </span>
              <span className="font-medium text-foreground">
                {copy.varianceItems(varianceCount)}
              </span>
            </div>
          ) : null}
        </div>
      </div>

      {/* Signature Block */}
      <div className="stocktake-signatures stocktake-print-avoid-break mt-8 pt-4">
        <div className="grid grid-cols-3 gap-4 text-center text-xs">
          <div>
            <p className="font-semibold uppercase tracking-wider">
              {copy.signCounter}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {copy.signHint}
            </p>
            <div className="h-16" />
            <p className="border-t border-dotted border-border pt-1 text-xs text-muted-foreground">
              {copy.signHint}
            </p>
          </div>
          <div>
            <p className="font-semibold uppercase tracking-wider">
              {copy.signHeadChef}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {copy.signHint}
            </p>
            <div className="h-16" />
            <p className="border-t border-dotted border-border pt-1 text-xs text-muted-foreground">
              {copy.signHint}
            </p>
          </div>
          <div>
            <p className="font-semibold uppercase tracking-wider">
              {copy.signManager}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {copy.signHint}
            </p>
            <div className="h-16" />
            <p className="border-t border-dotted border-border pt-1 text-xs text-muted-foreground">
              {copy.signHint}
            </p>
          </div>
        </div>
        <div className="mt-6 border-t border-border pt-2 text-center text-xs text-muted-foreground">
          <p>
            {copy.footerSystem} • {printTimeStr}
          </p>
        </div>
      </div>
    </div>
  );
}

/* ─── Thermal Receipt View (80mm) ─── */

function ThermalDocumentView({
  session,
  sessionCode,
  branchDisplayName,
  lines,
  unitOptionsByIngredient,
  mode,
  currentRound,
  printTimeStr,
  matchedCount,
  varianceCount,
}: {
  session: StocktakePrintSession;
  sessionCode: string;
  branchDisplayName: string;
  lines: StocktakePrintLine[];
  unitOptionsByIngredient: Record<number, StocktakeCountUnitOption[]>;
  mode: "count_sheet" | "reconciliation";
  currentRound: number;
  printTimeStr: string;
  matchedCount: number;
  varianceCount: number;
}) {
  const isCountSheet = mode === "count_sheet";

  return (
    <div
      id="stocktake-print-sheet"
      className="stocktake-print-sheet stocktake-thermal-sheet mx-auto w-full max-w-xs bg-background p-3 font-mono text-xs text-foreground shadow-xs"
    >
      {/* Header */}
      <div className="text-center">
        <p className="text-sm font-semibold tracking-wider">
          {copy.companyName}
        </p>
        <p className="text-xs font-semibold">{copy.brandTitle}</p>
        <p className="text-xs text-muted-foreground">{copy.brandSlogan}</p>
        <div className="my-1.5 border-b border-dashed border-border" />
        <p className="text-xs font-semibold uppercase">
          {isCountSheet ? copy.modeCountSheet : copy.modeReconciliation}
        </p>
        <p className="text-xs font-semibold">{sessionCode}</p>
      </div>

      <div className="my-2 border-b border-dashed border-border" />

      {/* Meta */}
      <div className="flex flex-col gap-1 text-xs">
        <div className="flex justify-between">
          <span className="text-muted-foreground">
            {copy.thermalWarehouseLabel}
          </span>
          <span className="font-semibold">{branchDisplayName}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">
            {copy.thermalRoundLabel}
          </span>
          <span>{copy.roundValue(currentRound)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">{copy.thermalTimeLabel}</span>
          <span>{printTimeStr}</span>
        </div>
        {session.createdByName ? (
          <div className="flex justify-between">
            <span className="text-muted-foreground">{copy.creatorLabel}</span>
            <span>{session.createdByName}</span>
          </div>
        ) : null}
      </div>

      <div className="my-2 border-b border-dashed border-border" />

      {/* Items List */}
      <div className="flex flex-col gap-2">
        {lines.map((item, idx) => {
          const packUnits = unitOptionsByIngredient[item.ingredientId] ?? [];
          const units = getIngredientUnits(
            item.ingredientId,
            item.unit,
            unitOptionsByIngredient,
          );
          const conversionHint = formatPackSpecification(packUnits, item.unit);
          const fmtUnits = toQuantityUnitFormatRows(packUnits, item.unit);

          const systemQty = item.systemQuantity ?? 0;
          const countedQty = item.countedQuantity;
          const variance =
            item.variance ??
            (countedQty != null ? countedQty - systemQty : null);

          const systemFormatted = formatQuantityInLargestUnits(
            systemQty,
            fmtUnits,
            formatQty,
          );
          const countedFormatted =
            countedQty != null
              ? formatQuantityInLargestUnits(countedQty, fmtUnits, formatQty)
              : null;
          const varianceFormatted =
            variance != null
              ? (variance > 0 ? "+" : "") +
                formatQuantityInLargestUnits(variance, fmtUnits, formatQty)
              : null;

          return (
            <div key={item.id ?? idx} className="text-2xs">
              <div className="flex justify-between gap-1 font-semibold">
                <span className="truncate">
                  {idx + 1}. {item.ingredientName}
                </span>
                <span className="shrink-0 text-right">
                  {!isCountSheet && varianceFormatted != null ? (
                    <span className="font-mono tabular-nums">
                      {varianceFormatted}
                    </span>
                  ) : null}
                </span>
              </div>
              {conversionHint && conversionHint !== item.unit ? (
                <p className="text-3xs text-muted-foreground">
                  ({conversionHint})
                </p>
              ) : null}
              {isCountSheet ? (
                <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-3xs font-mono">
                  {units.map((u) => (
                    <span
                      key={u.unitId || u.code}
                      className="inline-flex items-center gap-1"
                    >
                      <span>[.....]</span>
                      <span className="font-medium text-foreground">
                        {u.label}
                      </span>
                    </span>
                  ))}
                </div>
              ) : countedQty != null ? (
                <div className="flex justify-between text-3xs text-muted-foreground">
                  <span>
                    {copy.thermalSystemQuantity(
                      systemFormatted,
                      "",
                    )}
                  </span>
                  <span>
                    {copy.thermalCountedQuantity(
                      countedFormatted ?? "",
                      "",
                    )}
                  </span>
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
          <span>{copy.totalItems(lines.length)}</span>
          {!isCountSheet ? (
            <span className="font-semibold">
              {copy.thermalSummary(matchedCount, varianceCount)}
            </span>
          ) : null}
        </div>
      </div>

      <div className="my-3 border-b border-dashed border-border" />

      {/* Signatures */}
      <div className="grid grid-cols-2 gap-2 pt-1 text-center text-3xs">
        <div>
          <p className="font-semibold">{copy.thermalCounterSign}</p>
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
