"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  ArrowLeft as IconArrowLeft,
  ArrowRight as IconArrowRight,
  Ban as IconBan,
  Check as IconCheck,
  CircleCheck as IconCircleCheck,
  CircleX as IconCircleX,
} from "lucide-react";
import { formatVNDateTime } from "@comtammatu/shared/time";
import { STOCKTAKE_SESSION_STATUS_LABELS_VI } from "@comtammatu/shared/labels";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { confirm } from "@comtammatu/ui/components/confirm-dialog";
import { Input } from "@comtammatu/ui/components/input";
import { Progress } from "@comtammatu/ui/components/progress";
import { toast } from "@comtammatu/ui/components/sonner";

import { cn } from "@comtammatu/ui";
import { messages } from "@lib/messages";
import { AppPage, AppPageHeader, AppSection, DescriptionList, AppDetailFooter } from "@/components/surface";
import { getStatusBadgeMeta } from "@/components/status-badge";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import { AuditHistoryList } from "../../_components/audit-history-list";
import type { AuditLogRow } from "@/_lib/audit";
import { FormattedNumberInput } from "@/components/form/formatted-number-input";
import { tRoute, tTerm } from "../../_lib/dictionary";
import {
  cancelStocktake,
  completeStocktake,
  fetchStocktakeDetail,
  updateStocktakeLine,
} from "../../actions";

/* ─── Types ─── */

import { ACTIONS_VI, FORM_VI } from "@comtammatu/shared/messages";

const stocktakeCopy = messages.inventory.stocktake;
const stocktakeDetailCopy = stocktakeCopy.detail;
import { Item, ItemGroup } from "@comtammatu/ui/components/item";
const inventoryCommon = messages.inventory.common;

const eyebrowLabel = "Kho hàng";
const historySectionTitle = "Lịch sử chỉnh sửa";
const summarySectionTitle = "Tổng quan phiên";
const labelCreator = "Người tạo";
const labelCompletedAt = "Hoàn tất lúc";

interface StocktakeSession {
  id: number;
  branch_id: number;
  started_at: string | null;
  completed_at: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  created_by: string;
}

interface StocktakeLine {
  id: number;
  session_id: number;
  ingredient_id: number;
  system_quantity: number;
  counted_quantity: number | null;
  variance: number | null;
  variance_reason: string | null;
  ingredients: {
    id: number;
    name: string;
    unit: string;
    category: string | null;
  } | null;
}

export function StocktakeDetailClient({
  session: initialSession,
  lines: initialLines,
  routeBase = "/inventory/stocktake",
  wasteBasePath = "/inventory/waste/new",
  embedded = false,
  auditLogs = [],
}: {
  session: StocktakeSession;
  lines: StocktakeLine[];
  routeBase?: string;
  inventoryBasePath?: string;
  wasteBasePath?: string;
  embedded?: boolean;
  auditLogs?: AuditLogRow[];
}) {
  const [isPending, startTransition] = useTransition();
  const [session, setSession] = useState<StocktakeSession>(initialSession);
  const [lines, setLines] = useState<StocktakeLine[]>(initialLines);
  const [savedLines, setSavedLines] = useState<Set<number>>(new Set());

  const statusLabel =
    (STOCKTAKE_SESSION_STATUS_LABELS_VI as Record<string, string>)[
      session.status
    ] ?? session.status;
  const statusBadge = getStatusBadgeMeta("inventory", session.status);

  const countedCount = useMemo(
    () => lines.filter((l) => l.counted_quantity != null).length,
    [lines],
  );

  const progressPct =
    lines.length > 0 ? Math.round((countedCount / lines.length) * 100) : 0;
  const varianceCount = useMemo(
    () => lines.filter((line) => (line.variance ?? 0) !== 0).length,
    [lines],
  );
  const headerDescription = [
    stocktakeDetailCopy.createdAt(formatVNDateTime(session.created_at)),
    session.completed_at
      ? stocktakeDetailCopy.completedAt(formatVNDateTime(session.completed_at))
      : null,
    session.notes ? stocktakeDetailCopy.notes(session.notes) : null,
  ]
    .filter(Boolean)
    .join(" • ");

  const refreshData = useCallback(() => {
    startTransition(async () => {
      const res = await fetchStocktakeDetail(session.id);
      if (res.success && res.data) {
        const d = res.data as {
          session: StocktakeSession;
          lines: StocktakeLine[];
        };
        setSession(d.session);
        setLines(d.lines);
      }
    });
  }, [session.id, startTransition]);

  function handleLineBlur(lineId: number, value: string) {
    const num = Number(value);
    if (value !== "" && Number.isFinite(num) && num >= 0) {
      const currentLine = lines.find((l) => l.id === lineId);
      if (currentLine && currentLine.counted_quantity !== num) {
        startTransition(async () => {
          const res = await updateStocktakeLine({
            lineId,
            countedQuantity: num,
            varianceReason: currentLine.variance_reason ?? undefined,
          });
          if (!res.success) {
            toast.error(res.error ?? stocktakeDetailCopy.updateFailed);
          } else {
            setSavedLines((prev) => new Set(prev).add(lineId));
            refreshData();
          }
        });
      }
    }
  }

  function handleReasonBlur(lineId: number, reason: string) {
    const currentLine = lines.find((l) => l.id === lineId);
    if (!currentLine || currentLine.counted_quantity == null) return;
    if (currentLine.variance_reason === reason) return;

    startTransition(async () => {
      const res = await updateStocktakeLine({
        lineId,
        countedQuantity: currentLine.counted_quantity ?? 0,
        varianceReason: reason || undefined,
      });
      if (!res.success) {
        toast.error(res.error ?? stocktakeDetailCopy.updateFailed);
      } else {
        setSavedLines((prev) => new Set(prev).add(lineId));
        refreshData();
      }
    });
  }

  async function handleComplete() {
    const ok = await confirm({
      title: stocktakeDetailCopy.completeDialogTitle,
      description: stocktakeDetailCopy.completeDialogDescription,
      confirmText: stocktakeDetailCopy.completeResultAction,
      cancelText: ACTIONS_VI.cancel,
    });

    if (!ok) return;

    startTransition(async () => {
      const res = await completeStocktake(session.id);
      if (!res.success) {
        toast.error(res.error ?? stocktakeDetailCopy.completeFailed);
        return;
      }
      toast.success(stocktakeDetailCopy.completeOk);
      refreshData();
    });
  }

  async function handleCancel() {
    const ok = await confirm({
      title: stocktakeDetailCopy.cancelDialogTitle,
      description: stocktakeDetailCopy.cancelDialogDescription,
      confirmText: stocktakeDetailCopy.confirmCancelAction,
      cancelText: ACTIONS_VI.back,
      variant: "destructive",
    });

    if (!ok) return;

    startTransition(async () => {
      const res = await cancelStocktake(session.id);
      if (!res.success) {
        toast.error(res.error ?? stocktakeDetailCopy.cancelFailed);
        return;
      }
      toast.success(stocktakeDetailCopy.cancelOk);
      refreshData();
    });
  }

  const stocktakeActions =
    session.status === "in_progress" ? (
      <>
        <Button
          variant="outline"
          size={embedded ? "touch" : "default"}
          onClick={handleCancel}
          disabled={isPending}
        >
          <IconBan className="mr-2 size-4" />
          {stocktakeDetailCopy.cancelAction}
        </Button>
        <Button
          size={embedded ? "touch" : "default"}
          onClick={handleComplete}
          disabled={isPending}
        >
          <IconCircleCheck className="mr-2 size-4" />
          {stocktakeDetailCopy.completeAction}
        </Button>
      </>
    ) : null;

  const summarySection = (
    <AppSection title={summarySectionTitle} size="sm">
      <DescriptionList
        className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm"
        descriptionClassName="font-semibold text-right"
        items={[
          {
            term: stocktakeDetailCopy.metrics.status,
            description: (
              <Badge variant={statusBadge.variant}>
                {statusBadge.label}
              </Badge>
            ),
          },
          {
            term: stocktakeDetailCopy.metrics.counted,
            description: `${countedCount}/${lines.length}`,
          },
          {
            term: stocktakeDetailCopy.metrics.progress,
            description: (
              <div className="flex items-center justify-end gap-2">
                <span className="tabular-nums">{progressPct}%</span>
                <Progress value={progressPct} className="h-1.5 w-16" />
              </div>
            ),
          },
          {
            term: stocktakeDetailCopy.metrics.varianceLines,
            description: (
              <span
                className={cn(
                  "tabular-nums",
                  varianceCount > 0 ? "text-warning font-bold" : "text-muted-foreground"
                )}
              >
                {varianceCount}
              </span>
            ),
          },
          {
            term: stocktakeCopy.startedAt,
            description: formatVNDateTime(session.started_at ?? session.created_at),
          },
          ...(session.completed_at
            ? [
                {
                  term: labelCompletedAt,
                  description: formatVNDateTime(session.completed_at),
                },
              ]
            : []),
          {
            term: labelCreator,
            description: session.created_by,
          },
        ]}
      />
      {session.notes ? (
        <div className="mt-3 border-t pt-2.5 text-xs text-muted-foreground">
          <p className="font-semibold text-foreground mb-1">{FORM_VI.notes}</p>
          <p className="whitespace-pre-wrap">{session.notes}</p>
        </div>
      ) : null}
    </AppSection>
  );

  const mainContent = (
    <div className="flex flex-col gap-4">
      {/* Cancelled state */}
      {session.status === "cancelled" && (
        <AppSection contentClassName="items-center justify-center gap-2 py-6 text-center">
          <IconCircleX className="size-8 text-muted-foreground" />
          <p className="text-base font-semibold">
            {stocktakeDetailCopy.cancelledTitle}
          </p>
          <p className="text-sm text-muted-foreground">
            {stocktakeDetailCopy.cancelledDescription}
          </p>
        </AppSection>
      )}

      {/* Counting phase (in_progress) */}
      {session.status === "in_progress" && (
        <CountingPhase
          lines={lines}
          savedLines={savedLines}
          isPending={isPending}
          onLineBlur={handleLineBlur}
          onReasonBlur={handleReasonBlur}
        />
      )}

      {/* Results phase (completed) */}
      {session.status === "completed" && (
        <ResultsPhase
          lines={lines}
          varianceCount={varianceCount}
          wasteHref={`${wasteBasePath}?branchId=${session.branch_id}`}
          embedded={embedded}
        />
      )}
    </div>
  );

  const historySection = (
    <AppSection
      title={historySectionTitle}
      size="sm"
      collapsible
      defaultOpen={false}
    >
      <AuditHistoryList logs={auditLogs} />
    </AppSection>
  );

  if (embedded) {
    return (
      <div className="flex w-full flex-col gap-3">
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="icon" className="shrink-0">
            <Link
              href={`${routeBase}?branchId=${session.branch_id}`}
              aria-label={ACTIONS_VI.back}
            >
              <IconArrowLeft className="size-4" />
            </Link>
          </Button>
          <div className="min-w-0 flex-1">
            <p className="truncate font-mono text-sm font-semibold">
              {`KK-${session.id}`}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {headerDescription}
            </p>
          </div>
          <Badge variant={statusBadge.variant} className="shrink-0">
            {statusLabel}
          </Badge>
        </div>
        {summarySection}
        {mainContent}
        {historySection}
        {stocktakeActions ? (
          <AppDetailFooter
            sticky
            trailing={
              <div className="flex gap-2">
                {stocktakeActions}
              </div>
            }
          />
        ) : null}
      </div>
    );
  }

  return (
    <AppPage width="xwide" density="compact">
      <AppPageHeader
        eyebrow={eyebrowLabel}
        title={`KK-${session.id}`}
        description={headerDescription}
        badge={{
          children: statusLabel,
          variant: statusBadge.variant,
        }}
        breadcrumb={
          <Link
            href={`${routeBase}?branchId=${session.branch_id}`}
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:underline"
          >
            <IconArrowLeft className="size-4" /> {tRoute("/inventory/stocktake")}
          </Link>
        }
        actions={stocktakeActions}
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] items-start">
        <div className="flex flex-col gap-4">
          {mainContent}
          {historySection}
        </div>
        <div className="flex flex-col gap-4 lg:sticky lg:top-4">
          {summarySection}
        </div>
      </div>
    </AppPage>
  );
}

/* ─── CountingPhase ─── */

function CountingPhase({
  lines,
  savedLines,
  isPending,
  onLineBlur,
  onReasonBlur,
}: {
  lines: StocktakeLine[];
  savedLines: Set<number>;
  isPending: boolean;
  onLineBlur: (lineId: number, value: string) => void;
  onReasonBlur: (lineId: number, reason: string) => void;
}) {
  const countingColumns: DataTableColumn<StocktakeLine>[] = [
    {
      key: "ingredient",
      header: tTerm("ingredient"),
      render: (line) => (
        <div className="flex items-center gap-2 text-sm font-medium">
          {line.ingredients?.name ?? `#${line.ingredient_id}`}
          {savedLines.has(line.id) && (
            <span className="inline-flex items-center gap-2 text-xs text-success">
              <IconCheck className="size-3" />
              {stocktakeDetailCopy.saved}
            </span>
          )}
        </div>
      ),
    },
    {
      key: "unit",
      header: FORM_VI.unit,
      render: (line) => (
        <span className="text-sm text-muted-foreground">
          {line.ingredients?.unit ?? inventoryCommon.noValue}
        </span>
      ),
    },
    {
      key: "counted",
      header: stocktakeDetailCopy.countedQtyPlaceholder,
      render: (line) => (
        <FormattedNumberInput
          key={`stocktake-desktop-${line.id}`}
          defaultValue={
            line.counted_quantity != null ? String(line.counted_quantity) : ""
          }
          placeholder="0"
          className="h-8 w-24 tabular-nums"
          onValueBlur={(value) => onLineBlur(line.id, value)}
          maxFractionDigits={3}
          disabled={isPending}
        />
      ),
    },
    {
      key: "reason",
      header: stocktakeDetailCopy.varianceReason,
      render: (line) => (
        <Input
          type="text"
          defaultValue={line.variance_reason ?? ""}
          placeholder={stocktakeDetailCopy.optionalReasonPlaceholder}
          className="h-8 w-48 text-sm"
          onBlur={(e) => onReasonBlur(line.id, e.target.value.trim())}
          disabled={isPending}
        />
      ),
    },
  ];

  return (
    <AppSection className="overflow-hidden" contentFlush>
      <DataTable
        columns={countingColumns}
        data={lines}
        getRowKey={(line) => line.id}
        emptyTitle={stocktakeDetailCopy.emptyCountTitle}
        emptyDescription={stocktakeDetailCopy.emptyCountDescription}
        emptyMode="no-data"
        className="gap-2 max-md:divide-y"
        mobileCardRender={(line) => (
          <div className="flex flex-col gap-2 px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-sm font-medium">
                {line.ingredients?.name ?? `#${line.ingredient_id}`}
              </span>
              {savedLines.has(line.id) && (
                <span className="inline-flex shrink-0 items-center gap-2 text-xs text-success">
                  <IconCheck className="size-3" />
                  {stocktakeDetailCopy.saved}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {line.ingredients?.unit ?? inventoryCommon.noValue}
            </p>
            <div className="flex items-center gap-2">
              <FormattedNumberInput
                key={`stocktake-mobile-${line.id}`}
                defaultValue={
                  line.counted_quantity != null
                    ? String(line.counted_quantity)
                    : ""
                }
                placeholder={stocktakeDetailCopy.countedQtyPlaceholder}
                className="h-8 flex-1 tabular-nums"
                onValueBlur={(value) => onLineBlur(line.id, value)}
                maxFractionDigits={3}
                disabled={isPending}
              />
              <Input
                type="text"
                defaultValue={line.variance_reason ?? ""}
                placeholder={stocktakeDetailCopy.reasonPlaceholder}
                className="h-8 flex-1 text-sm"
                onBlur={(e) => onReasonBlur(line.id, e.target.value.trim())}
                disabled={isPending}
              />
            </div>
          </div>
        )}
      />
    </AppSection>
  );
}

/* ─── ResultsPhase ─── */

function getVarianceColor(line: StocktakeLine): string {
  if (line.variance == null || line.system_quantity === 0) return "";
  const ratio = Math.abs(line.variance) / line.system_quantity;
  if (ratio < 0.01) return "text-success";
  if (ratio < 0.05) return "text-warning";
  return "text-destructive";
}

function getVarianceBg(line: StocktakeLine): string {
  if (line.variance == null || line.system_quantity === 0) return "";
  const ratio = Math.abs(line.variance) / line.system_quantity;
  if (ratio < 0.01) return "bg-success/10";
  if (ratio < 0.05) return "bg-warning/10";
  return "bg-destructive/10";
}

function ResultsPhase({
  lines,
  varianceCount,
  wasteHref,
  embedded = false,
}: {
  lines: StocktakeLine[];
  varianceCount: number;
  wasteHref: string;
  embedded?: boolean;
}) {
  const resultColumns: DataTableColumn<StocktakeLine>[] = [
    {
      key: "ingredient",
      header: tTerm("ingredient"),
      render: (line) => (
        <span className="text-sm font-medium">
          {line.ingredients?.name ?? `#${line.ingredient_id}`}
        </span>
      ),
    },
    {
      key: "unit",
      header: FORM_VI.unit,
      render: (line) => (
        <span className="text-sm text-muted-foreground">
          {line.ingredients?.unit ?? inventoryCommon.noValue}
        </span>
      ),
    },
    {
      key: "system",
      header: stocktakeDetailCopy.results.systemQty,
      render: (line) => (
        <span className="text-sm font-mono tabular-nums">
          {line.system_quantity}
        </span>
      ),
    },
    {
      key: "counted",
      header: stocktakeDetailCopy.results.countedQty,
      render: (line) => (
        <span className="text-sm font-mono tabular-nums">
          {line.counted_quantity ?? inventoryCommon.noValue}
        </span>
      ),
    },
    {
      key: "variance",
      header: stocktakeDetailCopy.results.variance,
      render: (line) => {
        if (line.counted_quantity == null) {
          return <span className="text-sm font-mono text-muted-foreground">—</span>;
        }
        const variance = line.variance ?? 0;
        return (
          <span
            className={cn(
              "text-sm font-medium font-mono tabular-nums",
              getVarianceColor(line),
            )}
          >
            {variance > 0 && "+"}
            {variance}
          </span>
        );
      },
    },
    {
      key: "reason",
      header: FORM_VI.reason,
      render: (line) => (
        <span className="text-sm text-muted-foreground">
          {line.variance_reason ?? inventoryCommon.noValue}
        </span>
      ),
    },
  ];

  const legend = (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="text-muted-foreground font-medium">
        {stocktakeDetailCopy.results.legendTitle}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="size-2.5 rounded-full bg-success" />
        {stocktakeDetailCopy.results.good}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="size-2.5 rounded-full bg-warning" />
        {stocktakeDetailCopy.results.review}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="size-2.5 rounded-full bg-destructive" />
        {stocktakeDetailCopy.results.severe}
      </span>
    </div>
  );

  const nextAction = varianceCount > 0 && (
    <AppSection
      tone="warning"
      contentClassName="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center"
    >
      <div className="flex flex-col gap-1">
        <p className="text-sm font-semibold">
          {stocktakeDetailCopy.results.nextActionTitle}
        </p>
        <p className="text-sm text-muted-foreground">
          {stocktakeDetailCopy.results.nextActionDescription(
            varianceCount,
          )}
        </p>
      </div>
      <Button asChild size={embedded ? "touch" : "sm"}>
        <Link href={wasteHref}>
          {stocktakeDetailCopy.results.nextActionCta}
          <IconArrowRight className="size-4" />
        </Link>
      </Button>
    </AppSection>
  );

  if (embedded) {
    return (
      <div className="flex flex-col gap-3">
        {legend}
        {nextAction}
        <ItemGroup className="gap-2">
          {lines.map((line) => {
            const varianceColor = getVarianceColor(line);
            const variance = line.variance ?? 0;
            const varianceBg = getVarianceBg(line);
            return (
              <Item
                key={line.id}
                variant="outline"
                className={cn(
                  "flex-col items-stretch gap-1.5 bg-card p-3",
                  varianceBg,
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="truncate text-sm font-semibold text-foreground">
                    {line.ingredients?.name ?? `#${line.ingredient_id}`}
                  </span>
                  {line.counted_quantity == null ? (
                    <span className="font-mono text-sm text-muted-foreground">—</span>
                  ) : (
                    <span className={cn("font-mono text-sm font-bold tabular-nums", varianceColor)}>
                      {variance > 0 && "+"}
                      {variance}
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>
                    {stocktakeDetailCopy.results.systemShort}:{" "}
                    <span className="font-mono text-foreground font-medium">{line.system_quantity}</span>
                    {" · "}
                    {stocktakeDetailCopy.results.countedShort}:{" "}
                    <span className="font-mono text-foreground font-medium">
                      {line.counted_quantity ?? "—"}
                    </span>
                  </span>
                  {line.variance_reason ? (
                    <span className="truncate italic">{line.variance_reason}</span>
                  ) : null}
                </div>
              </Item>
            );
          })}
        </ItemGroup>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {legend}
      {nextAction}
      <AppSection className="overflow-hidden" contentFlush>
        <DataTable
          columns={resultColumns}
          data={lines}
          getRowKey={(line) => line.id}
          emptyTitle={stocktakeDetailCopy.results.emptyTitle}
          emptyDescription={stocktakeDetailCopy.results.emptyDescription}
          emptyMode="no-data"
          rowClassName={(line) => getVarianceBg(line)}
          className="gap-2 max-md:divide-y"
          mobileCardRender={(line) => {
            const varianceColor = getVarianceColor(line);
            const variance = line.variance ?? 0;
            return (
              <div
                className={cn(
                  "flex flex-col gap-2 px-4 py-3",
                  getVarianceBg(line),
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium">
                    {line.ingredients?.name ?? `#${line.ingredient_id}`}
                  </span>
                  {line.counted_quantity == null ? (
                    <span className="shrink-0 font-mono text-sm text-muted-foreground">—</span>
                  ) : (
                    <span
                      className={cn(
                        "shrink-0 font-mono text-sm font-medium tabular-nums",
                        varianceColor,
                      )}
                    >
                      {variance > 0 && "+"}
                      {variance}
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                  <span>
                    {stocktakeDetailCopy.results.systemShort}:{" "}
                    {line.system_quantity} ·{" "}
                    {stocktakeDetailCopy.results.countedShort}:{" "}
                    {line.counted_quantity ?? inventoryCommon.noValue}
                  </span>
                  <span className="truncate text-right">
                    {line.variance_reason ?? ""}
                  </span>
                </div>
              </div>
            );
          }}
        />
      </AppSection>
    </div>
  );
}
