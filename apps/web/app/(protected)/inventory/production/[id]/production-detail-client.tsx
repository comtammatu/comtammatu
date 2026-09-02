"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@comtammatu/ui/components/button";
import { Item } from "@comtammatu/ui/components/item";
import { toast } from "@comtammatu/ui/components/sonner";
import { Alert, AlertDescription, AlertTitle } from "@comtammatu/ui/components/alert";
import { confirm } from "@/components/confirm-dialog";
import { QuantityInput } from "@/components/form/domain-number-inputs";
import { AppDialog } from "@/components/form";
import {
  AppSection,
  DescriptionList,
} from "@/components/surface";
import { StatusBadge } from "@/components/status-badge";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import { ResponsiveActionButton } from "@/components/responsive-action-button";
import {
  formatDateTime,
  formatQty,
  formatSmartQuantityUnit,
  formatVND,
} from "@lib/inventory/format";
import { formatPercent } from "@comtammatu/shared/format";
import { messages } from "@lib/messages";
import { ACTIONS_VI } from "@comtammatu/shared/messages";
import {
  cancelProductionRun,
  completeProductionRun,
  fetchProductionRunById,
  startProductionRun,
  type ProductionRunRow,
} from "../../production-run-actions";
import type { ProductionShortageRow } from "../../production-types";

const detailCopy = messages.inventory.productionDetail;

export function ProductionDetailClient({
  run: initialRun,
  presentation = "dialog",
  onClose,
  onRunReloaded,
}: {
  run: ProductionRunRow;
  presentation?: "page" | "dialog";
  onClose?: () => void;
  onRunReloaded?: (run: ProductionRunRow) => void;
}) {
  const router = useRouter();
  const [run, setRun] = useState(initialRun);
  const [isPending, startTransition] = useTransition();
  const [actualOutput, setActualOutput] = useState(
    initialRun.actual_quantity == null
      ? String(initialRun.planned_quantity)
      : String(initialRun.actual_quantity),
  );
  const [actualIngredients, setActualIngredients] = useState<
    Record<number, string>
  >(() =>
    Object.fromEntries(
      initialRun.lines.map((line) => [
        line.ingredient_id,
        String(line.actual_quantity ?? line.planned_quantity),
      ]),
    ),
  );
  const [shortages, setShortages] = useState<ProductionShortageRow[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    setRun(initialRun);
    setActualOutput(
      initialRun.actual_quantity == null
        ? String(initialRun.planned_quantity)
        : String(initialRun.actual_quantity),
    );
    setActualIngredients(
      Object.fromEntries(
        initialRun.lines.map((line) => [
          line.ingredient_id,
          String(line.actual_quantity ?? line.planned_quantity),
        ]),
      ),
    );
  }, [initialRun]);

  const actualRows = useMemo(
    () =>
      run.lines.map((line) => ({
        ingredientId: line.ingredient_id,
        actualQuantity: Number(actualIngredients[line.ingredient_id]),
      })),
    [actualIngredients, run.lines],
  );

  async function reloadRun() {
    const result = await fetchProductionRunById(run.id);
    if (result.success && result.data) {
      setRun(result.data);
      onRunReloaded?.(result.data);
    }
    router.refresh();
  }

  function refreshAfter(result: { success: boolean; error?: string }) {
    if (!result.success) {
      setActionError(result.error ?? detailCopy.actionFailed);
      return false;
    }
    setActionError(null);
    void reloadRun();
    return true;
  }

  function handleStart() {
    startTransition(async () => {
      const result = await startProductionRun({
        id: run.id,
        branchId: run.branch_id,
      });
      if (refreshAfter(result)) toast.success(detailCopy.startSuccess);
    });
  }

  async function handleCancel() {
    const accepted = await confirm({
      title: detailCopy.cancelTitle,
      description: detailCopy.cancelDescription,
      confirmText: detailCopy.cancelAction,
      cancelText: detailCopy.backAction,
      variant: "destructive",
    });
    if (!accepted) return;
    startTransition(async () => {
      const result = await cancelProductionRun({
        id: run.id,
        branchId: run.branch_id,
      });
      if (refreshAfter(result)) toast.success(detailCopy.cancelSuccess);
    });
  }

  function handleComplete() {
    const output = Number(actualOutput);
    if (
      !Number.isFinite(output) ||
      output <= 0 ||
      actualRows.some(
        (line) => !Number.isFinite(line.actualQuantity) || line.actualQuantity < 0,
      ) ||
      actualRows.every((line) => line.actualQuantity === 0)
    ) {
      setActionError(detailCopy.invalidActualQuantity);
      return;
    }
    setShortages([]);
    startTransition(async () => {
      const result = await completeProductionRun({
        id: run.id,
        branchId: run.branch_id,
        actualQuantity: output,
        actualIngredients: actualRows,
      });
      if (!result.success) {
        setActionError(result.error ?? detailCopy.completeFailed);
        setShortages(
          result.errorCode === "PRODUCTION_SHORTAGE"
            ? Array.isArray(result.data)
              ? (result.data as ProductionShortageRow[])
              : Array.isArray(result.meta?.shortages)
                ? (result.meta.shortages as ProductionShortageRow[])
                : []
            : [],
        );
        return;
      }
      toast.success(detailCopy.completeSuccess);
      void reloadRun();
    });
  }

  const unit = run.entry_unit_name ?? "";
  const actualSmart = formatSmartQuantityUnit(run.actual_quantity, unit);
  const actualQtyLabel =
    run.actual_quantity == null
      ? "—"
      : `${actualSmart.formattedQty} ${actualSmart.displayUnit}`.trim();

  const plannedSmart = formatSmartQuantityUnit(run.planned_quantity, unit);

  type ProductionLine = ProductionRunRow["lines"][number];

  function getLineMetrics(line: ProductionLine) {
    const planned = Number(line.planned_quantity);
    const currentActual =
      run.status === "in_progress"
        ? Number(actualIngredients[line.ingredient_id])
        : line.actual_quantity;
    const hasActual =
      currentActual != null &&
      Number.isFinite(currentActual) &&
      run.status !== "draft";
    const diff = hasActual ? Number(currentActual) - planned : null;
    const diffPercent = diff != null && planned > 0 ? (diff / planned) * 100 : null;
    return {
      plannedSmart: formatSmartQuantityUnit(
        line.planned_quantity,
        line.entry_unit_name,
      ),
      actualSmart: formatSmartQuantityUnit(
        line.actual_quantity,
        line.entry_unit_name,
      ),
      diff,
      diffPercent,
    };
  }

  function renderActualQuantity(line: ProductionLine) {
    const { actualSmart: actualLine } = getLineMetrics(line);
    if (run.status !== "in_progress") {
      return (
        <span className="font-mono font-medium tabular-nums">
          {line.actual_quantity == null
            ? "—"
            : `${actualLine.formattedQty} ${actualLine.displayUnit}`}
        </span>
      );
    }
    return (
      <div className="flex min-w-36 items-center gap-2">
        <QuantityInput
          value={actualIngredients[line.ingredient_id] ?? ""}
          onValueChange={(value) =>
            setActualIngredients((current) => ({
              ...current,
              [line.ingredient_id]: value,
            }))
          }
          min="0"
          maxFractionDigits={3}
          aria-label={detailCopy.actualQuantityAria(line.ingredient_name)}
        />
        <span className="shrink-0 text-xs text-muted-foreground">
          {line.entry_unit_name}
        </span>
      </div>
    );
  }

  function renderVariance(line: ProductionLine) {
    const { diff, diffPercent } = getLineMetrics(line);
    if (diff == null) {
      return <span className="font-mono text-muted-foreground">—</span>;
    }
    if (Math.abs(diff) < 1e-4) {
      return <span className="font-mono text-muted-foreground">±0%</span>;
    }
    const isOver = diff > 0;
    return (
      <span
        className={
          isOver
            ? "font-mono font-semibold text-destructive"
            : "font-mono font-semibold text-success"
        }
        title={
          isOver
            ? detailCopy.varianceOver(
                formatQty(Math.abs(diff)),
                line.entry_unit_name,
              )
            : detailCopy.varianceSaved(
                formatQty(Math.abs(diff)),
                line.entry_unit_name,
              )
        }
      >
        {isOver ? "+" : ""}
        {diffPercent != null ? formatPercent(diffPercent, 1) : ""}
      </span>
    );
  }

  const lineColumns: DataTableColumn<ProductionLine>[] = [
    {
      key: "ingredient",
      header: detailCopy.ingredientColumn,
      className: "min-w-48",
      render: (line) => <span className="font-medium">{line.ingredient_name}</span>,
    },
    {
      key: "planned",
      header: detailCopy.plannedColumn,
      className: "w-32 text-right",
      render: (line) => {
        const { plannedSmart: plannedLine } = getLineMetrics(line);
        return (
          <span className="block text-right font-mono tabular-nums text-muted-foreground">
            {plannedLine.formattedQty} {plannedLine.displayUnit}
          </span>
        );
      },
    },
    {
      key: "actual",
      header: detailCopy.actualColumn,
      className: "min-w-44 text-right",
      render: (line) => (
        <div className="flex justify-end">{renderActualQuantity(line)}</div>
      ),
    },
    {
      key: "variance",
      header: detailCopy.varianceColumn,
      className: "w-28 text-right",
      render: (line) => <span className="block text-right">{renderVariance(line)}</span>,
    },
    {
      key: "unitCost",
      header: detailCopy.unitCostColumn,
      className: "w-28 text-right",
      render: (line) => (
        <span className="block text-right font-mono text-xs tabular-nums text-muted-foreground">
          {line.unit_cost != null && line.unit_cost > 0
            ? formatVND(line.unit_cost)
            : "—"}
        </span>
      ),
    },
    {
      key: "lineCost",
      header: detailCopy.lineCostColumn,
      className: "w-32 text-right",
      render: (line) => (
        <span className="block text-right font-mono font-medium tabular-nums">
          {line.line_cost != null && line.line_cost > 0
            ? formatVND(line.line_cost)
            : "—"}
        </span>
      ),
    },
  ];

  const body = (
    <div className="flex flex-col gap-5">
      <Item
        variant="outline"
        className="grid shrink-0 grid-cols-2 gap-4 p-4 text-xs sm:grid-cols-3 lg:grid-cols-6"
      >
        <div className="min-w-0">
          <span className="block font-medium text-muted-foreground">
            {detailCopy.kpiLines}
          </span>
          <span className="mt-1 block font-mono text-base font-semibold tabular-nums text-foreground">
            {run.lines.length}
          </span>
        </div>
        <div className="min-w-0">
          <span className="block font-medium text-muted-foreground">
            {detailCopy.kpiPlanned}
          </span>
          <span className="mt-1 block font-mono text-base font-semibold tabular-nums text-foreground">
            {`${plannedSmart.formattedQty} ${plannedSmart.displayUnit}`.trim()}
          </span>
        </div>
        <div className="min-w-0">
          <span className="block font-medium text-muted-foreground">
            {detailCopy.kpiActual}
          </span>
          <span className="mt-1 block font-mono text-base font-semibold tabular-nums text-foreground">
            {actualQtyLabel}
          </span>
        </div>
        <div className="min-w-0">
          <span className="block font-medium text-muted-foreground">
            {detailCopy.kpiBranch}
          </span>
          <span className="mt-1 block truncate text-base font-semibold text-foreground">
            {run.branch_name}
          </span>
        </div>
        <div className="col-span-2 min-w-0 sm:col-span-1">
          <span className="block font-medium text-muted-foreground">
            {detailCopy.kpiFinishedGood}
          </span>
          <span className="mt-1 block break-words text-base font-semibold text-foreground">
            {run.finished_good_name}
          </span>
        </div>
        <div className="col-span-2 min-w-0 sm:col-span-1">
          <span className="block font-medium text-muted-foreground">
            {run.status === "completed"
              ? detailCopy.actualBatchCost
              : detailCopy.plannedBatchCost}
          </span>
          <span className="mt-1 block font-mono text-base font-semibold tabular-nums text-foreground">
            {run.total_cost != null && run.total_cost > 0 ? formatVND(run.total_cost) : "—"}
          </span>
          {run.unit_cost != null && run.unit_cost > 0 ? (
            <span
              className="block text-xs text-muted-foreground font-mono"
              title={detailCopy.unitCostTitle(
                formatVND(run.unit_cost),
                run.entry_unit_name ?? detailCopy.unitFallback,
              )}
            >
              {formatVND(run.unit_cost)} /{" "}
              {run.entry_unit_name ?? detailCopy.unitFallback}
            </span>
          ) : null}
        </div>
      </Item>

      <AppSection title={detailCopy.infoTitle} size="sm">
        <DescriptionList
          className="grid gap-3 sm:grid-cols-2"
          descriptionClassName="font-medium"
          items={[
            {
              term: detailCopy.startedAt,
              description: run.started_at
                ? formatDateTime(run.started_at)
                : "—",
            },
            {
              term: detailCopy.completedAt,
              description: run.completed_at
                ? formatDateTime(run.completed_at)
                : "—",
            },
          ]}
        />
      </AppSection>

      <AppSection
        title={detailCopy.snapshotTitle}
        description={detailCopy.snapshotDescription(run.lines.length)}
        contentFlush
      >
        <DataTable
          columns={lineColumns}
          data={run.lines}
          getRowKey={(line) => line.ingredient_id}
          emptyTitle={detailCopy.sectionLineCount(0)}
          mobileCardRender={(line) => {
            const { plannedSmart: plannedLine } = getLineMetrics(line);
            return (
              <Item variant="outline" className="flex-col items-stretch gap-3">
                <div className="flex items-start justify-between gap-3">
                  <span className="font-medium">{line.ingredient_name}</span>
                  <span className="font-mono font-medium tabular-nums">
                    {line.line_cost != null && line.line_cost > 0
                      ? formatVND(line.line_cost)
                      : "—"}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="block text-xs text-muted-foreground">
                      {detailCopy.plannedColumn}
                    </span>
                    <span className="font-mono tabular-nums">
                      {plannedLine.formattedQty} {plannedLine.displayUnit}
                    </span>
                  </div>
                  <div>
                    <span className="block text-xs text-muted-foreground">
                      {detailCopy.varianceColumn}
                    </span>
                    {renderVariance(line)}
                  </div>
                </div>
                <div>
                  <span className="mb-1 block text-xs text-muted-foreground">
                    {detailCopy.actualColumn}
                  </span>
                  {renderActualQuantity(line)}
                </div>
              </Item>
            );
          }}
        />
        <div className="flex items-center justify-between border-t bg-muted/30 px-3 py-2.5 text-xs font-semibold text-foreground">
          <span>
            {detailCopy.ingredientTotal}{" "}
            {run.status === "completed"
              ? detailCopy.actualSuffix
              : detailCopy.plannedSuffix}
          </span>
          <span className="font-mono text-sm font-semibold tabular-nums text-foreground">
            {run.total_cost != null && run.total_cost > 0
              ? formatVND(run.total_cost)
              : "—"}
          </span>
        </div>
      </AppSection>

      {run.status === "in_progress" ? (
        <AppSection
          title={detailCopy.actualOutputTitle}
          description={detailCopy.actualOutputDescription}
        >
          <div className="flex max-w-sm items-center gap-2">
            <QuantityInput
              aria-label={detailCopy.actualOutputAria}
              value={actualOutput}
              onValueChange={setActualOutput}
              min="0"
              maxFractionDigits={3}
            />
            <span className="text-sm font-medium text-muted-foreground">{run.entry_unit_name}</span>
          </div>
        </AppSection>
      ) : null}

      {actionError ? (
        <Alert variant="destructive">
          <AlertTitle>{detailCopy.actionFailedTitle}</AlertTitle>
          <AlertDescription>{actionError}</AlertDescription>
        </Alert>
      ) : null}
      {shortages.length ? (
        <Alert variant="destructive">
          <AlertTitle>{detailCopy.shortageTitle}</AlertTitle>
          <AlertDescription>
            {shortages.map((row) => (
              <div key={row.ingredient_id}>
                {detailCopy.shortageLine(
                  row.ingredient_name,
                  formatQty(row.needed),
                  formatQty(row.on_hand),
                  row.unit,
                )}
              </div>
            ))}
          </AlertDescription>
        </Alert>
      ) : null}

      {run.status === "completed" ? (
        <AppSection
          title={detailCopy.shipToBranchTitle}
          description={detailCopy.shipToBranchDescription}
          action={
            <Button
              render={
                <Link
                  href={
                    `/inventory/transfers/new?branch=${run.branch_id}&direction=outbound&ingredientId=${run.finished_good_id}` +
                    (run.actual_quantity != null ? `&quantity=${run.actual_quantity}` : "") +
                    (run.entry_unit_id != null ? `&entryUnitId=${run.entry_unit_id}` : "")
                  }
                />
              }
            >
              {detailCopy.shipToBranchAction}
            </Button>
          }
        >
          <p className="text-sm text-muted-foreground">
            {detailCopy.completedTransferHint}
          </p>
        </AppSection>
      ) : null}

      {run.status === "cancelled" && run.cancel_reason ? (
        <AppSection title={detailCopy.cancelReasonTitle}>
          <p className="text-sm">{run.cancel_reason}</p>
        </AppSection>
      ) : null}
    </div>
  );

  const dialogFooter = (
    <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
      <div>
        {run.status === "draft" || run.status === "in_progress" ? (
          <ResponsiveActionButton
            type="button"
            variant="destructive"
            onClick={() => void handleCancel()}
            disabled={isPending}
          >
            {detailCopy.cancelAction}
          </ResponsiveActionButton>
        ) : null}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <ResponsiveActionButton
          type="button"
          variant="outline"
          onClick={onClose}
          disabled={isPending}
        >
          {ACTIONS_VI.close}
        </ResponsiveActionButton>
        {run.status === "draft" ? (
          <ResponsiveActionButton
            type="button"
            onClick={handleStart}
            disabled={isPending}
          >
            {detailCopy.startAction}
          </ResponsiveActionButton>
        ) : run.status === "in_progress" ? (
          <ResponsiveActionButton
            type="button"
            onClick={handleComplete}
            disabled={isPending}
          >
            {detailCopy.completeAction}
          </ResponsiveActionButton>
        ) : null}
      </div>
    </div>
  );

  if (presentation === "dialog") {
    return (
      <AppDialog
        open
        onOpenChange={(next) => {
          if (!next) onClose?.();
        }}
        variant="document"
        title={
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{run.production_number}</span>
            <StatusBadge domain="inventory" value={run.status} />
          </div>
        }
        description={run.finished_good_name}
        footer={dialogFooter}
      >
        {body}
      </AppDialog>
    );
  }

  return body;
}
