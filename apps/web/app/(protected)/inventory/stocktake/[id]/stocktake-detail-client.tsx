"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  ArrowRight as IconArrowRight,
  Ban as IconBan,
  Check as IconCheck,
  CircleCheck as IconCircleCheck,
  CircleX as IconCircleX,
} from "lucide-react";
import { formatVNDateTime } from "@comtammatu/shared/time";
import { formatPercent } from "@comtammatu/shared/format";
import { Button } from "@comtammatu/ui/components/button";
import { Item } from "@comtammatu/ui/components/item";
import { confirm } from "@/components/confirm-dialog";
import { Input } from "@comtammatu/ui/components/input";
import { Progress } from "@comtammatu/ui/components/progress";
import { toast } from "@comtammatu/ui/components/sonner";

import { cn } from "@comtammatu/ui";
import { messages } from "@lib/messages";
import {
  AppBackLink,
  AppPage,
  AppPageHeader,
  AppSection,
  DescriptionList,
} from "@/components/surface";
import { AppPageTabs, TabsContent } from "@/components/app-page-tabs";
import { getStatusBadgeMeta, StatusBadge } from "@/components/status-badge";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import { AuditHistoryList } from "@/components/audit-history-list";
import type { AuditLogRow } from "@/_lib/audit";
import { QuantityInput } from "@/components/form/domain-number-inputs";
import { WasteReasonDropdown } from "../../_components/waste-reason-dropdown";
import { WASTE_REASON_LABELS_VI } from "@comtammatu/shared/labels";
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
const inventoryCommon = messages.inventory.common;

const historySectionTitle = "Lịch sử chỉnh sửa";
const documentTabLabel = "Phiếu kiểm kê";
const historyTabLabel = "Lịch sử";
const summarySectionTitle = "Tổng quan phiên";
const labelCreator = "Người tạo";
const labelCompletedAt = "Hoàn tất lúc";

interface StocktakeSession {
  id: number;
  session_number?: string | null;
  branch_id: number;
  started_at: string | null;
  completed_at: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  created_by: string;
}

function stocktakeCode(session: Pick<StocktakeSession, "id" | "session_number">): string {
  return session.session_number?.trim() || `KK-${session.id}`;
}

interface StocktakeLine {
  id: number;
  session_id: number;
  ingredient_id: number;
  system_quantity: number;
  counted_quantity: number | null;
  variance: number | null;
  variance_reason: string | null;
  reason_code: string | null;
  ingredients: {
    id: number;
    name: string;
    unit: string;
    category: string | null;
  } | null;
}

type WasteReason = keyof typeof WASTE_REASON_LABELS_VI;

export function StocktakeDetailClient({
  session: initialSession,
  lines: initialLines,
  routeBase = "/inventory/stocktake",
  reportsBasePath = "/inventory/reports",
  auditLogs = [],
}: {
  session: StocktakeSession;
  lines: StocktakeLine[];
  routeBase?: string;
  inventoryBasePath?: string;
  reportsBasePath?: string;
  auditLogs?: AuditLogRow[];
}) {
  const [isPending, startTransition] = useTransition();
  const [session, setSession] = useState<StocktakeSession>(initialSession);
  const [lines, setLines] = useState<StocktakeLine[]>(initialLines);
  const [savedLines, setSavedLines] = useState<Set<number>>(new Set());

  const statusBadge = getStatusBadgeMeta("inventory", session.status);
  const statusLabel = statusBadge.label;

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
  const headerMeta = [
    stocktakeDetailCopy.createdAt(formatVNDateTime(session.created_at)),
    session.completed_at
      ? stocktakeDetailCopy.completedAt(formatVNDateTime(session.completed_at))
      : null,
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
            reasonCode: (currentLine.reason_code as WasteReason | null) ?? null,
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

  function handleReasonCodeChange(lineId: number, reasonCode: WasteReason) {
    const currentLine = lines.find((l) => l.id === lineId);
    if (!currentLine || currentLine.counted_quantity == null) return;
    if (currentLine.reason_code === reasonCode) return;

    startTransition(async () => {
      const res = await updateStocktakeLine({
        lineId,
        countedQuantity: currentLine.counted_quantity ?? 0,
        varianceReason: currentLine.variance_reason ?? undefined,
        reasonCode,
      });
      if (!res.success) {
        toast.error(res.error ?? stocktakeDetailCopy.updateFailed);
      } else {
        setSavedLines((prev) => new Set(prev).add(lineId));
        setLines((prev) =>
          prev.map((line) =>
            line.id === lineId ? { ...line, reason_code: reasonCode } : line,
          ),
        );
      }
    });
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
        reasonCode: (currentLine.reason_code as WasteReason | null) ?? null,
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
    const missingReason = lines.some((line) => {
      if (line.counted_quantity == null) return false;
      const variance =
        line.variance ?? line.counted_quantity - line.system_quantity;
      return variance !== 0 && !line.reason_code;
    });
    if (missingReason) {
      toast.error(stocktakeDetailCopy.reasonCodeRequired);
      return;
    }

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
          onClick={handleCancel}
          disabled={isPending}
        >
          <IconBan className="mr-2 size-4" />
          {stocktakeDetailCopy.cancelAction}
        </Button>
        <Button
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
            term: labelCreator,
            description: session.created_by,
          },
          ...(session.completed_at
            ? [
                {
                  term: labelCompletedAt,
                  description: formatVNDateTime(session.completed_at),
                },
              ]
            : []),
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

  const kpiStrip = (
    <Item
      variant="outline"
      className="grid shrink-0 grid-cols-2 gap-4 p-4 text-xs sm:grid-cols-3 lg:grid-cols-5"
    >
      <div className="min-w-0">
        <span className="block font-medium text-muted-foreground">
          {stocktakeDetailCopy.kpiLines}
        </span>
        <span className="mt-1 block font-mono text-base font-semibold tabular-nums text-foreground">
          {lines.length}
        </span>
      </div>
      <div className="min-w-0">
        <span className="block font-medium text-muted-foreground">
          {stocktakeDetailCopy.kpiCounted}
        </span>
        <span className="mt-1 block font-mono text-base font-semibold tabular-nums text-foreground">
          {countedCount}/{lines.length}
        </span>
      </div>
      <div className="min-w-0">
        <span className="block font-medium text-muted-foreground">
          {stocktakeDetailCopy.kpiProgress}
        </span>
        <span className="mt-1 flex items-center gap-2 font-mono text-base font-semibold tabular-nums text-foreground">
          {formatPercent(progressPct, 0)}
          <Progress value={progressPct} className="h-1.5 w-16" />
        </span>
      </div>
      <div className="min-w-0">
        <span className="block font-medium text-muted-foreground">
          {stocktakeDetailCopy.kpiVariance}
        </span>
        <span
          className={cn(
            "mt-1 block font-mono text-base font-semibold tabular-nums",
            varianceCount > 0 ? "text-warning" : "text-foreground",
          )}
        >
          {varianceCount}
        </span>
      </div>
      <div className="min-w-0">
        <span className="block font-medium text-muted-foreground">
          {stocktakeDetailCopy.kpiStarted}
        </span>
        <span className="mt-1 block font-mono text-base font-semibold tabular-nums text-foreground">
          {formatVNDateTime(session.started_at ?? session.created_at)}
        </span>
      </div>
    </Item>
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
          onReasonCodeChange={handleReasonCodeChange}
        />
      )}

      {/* Results phase (completed) */}
      {session.status === "completed" && (
        <ResultsPhase
          lines={lines}
          varianceCount={varianceCount}
          reviewHref={`${reportsBasePath}?branch=${session.branch_id}`}
        />
      )}
    </div>
  );

  const historyPane = (
    <AppSection title={historySectionTitle} size="sm">
      <AuditHistoryList logs={auditLogs} />
    </AppSection>
  );

  const documentPane = (
    <div className="flex flex-col gap-6">
      {kpiStrip}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] items-start">
        <div className="flex flex-col gap-4">{mainContent}</div>
        <div className="flex flex-col gap-4 lg:sticky lg:top-4">
          {summarySection}
        </div>
      </div>
    </div>
  );

  const tabs = (
    <AppPageTabs
      items={[
        { value: "document", label: documentTabLabel },
        {
          value: "history",
          label: historyTabLabel,
          count: auditLogs.length,
        },
      ]}
      defaultValue="document"
      stickyList
    >
      <TabsContent value="document" className="mt-4">
        {documentPane}
      </TabsContent>
      <TabsContent value="history" className="mt-4">
        {historyPane}
      </TabsContent>
    </AppPageTabs>
  );

  return (
    <AppPage width="xwide" density="compact">
      <AppPageHeader
        title={
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{stocktakeCode(session)}</span>
            <StatusBadge
              domain="inventory"
              value={session.status}
              label={statusLabel}
            />
          </div>
        }
        meta={headerMeta}
        breadcrumb={
          <AppBackLink href={`${routeBase}?branch=${session.branch_id}`}>
            {tRoute("/inventory/stocktake")}
          </AppBackLink>
        }
        actions={stocktakeActions}
      />
      {tabs}
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
  onReasonCodeChange,
}: {
  lines: StocktakeLine[];
  savedLines: Set<number>;
  isPending: boolean;
  onLineBlur: (lineId: number, value: string) => void;
  onReasonBlur: (lineId: number, reason: string) => void;
  onReasonCodeChange: (lineId: number, reasonCode: WasteReason) => void;
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
        <QuantityInput
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
        <div className="flex min-w-56 flex-col gap-1">
          <WasteReasonDropdown
            value={(line.reason_code as WasteReason | null) ?? ""}
            onChange={(value) => onReasonCodeChange(line.id, value)}
            disabled={isPending || line.counted_quantity == null}
            size="sm"
            className="h-8 w-full"
          />
          <Input
            type="text"
            defaultValue={line.variance_reason ?? ""}
            placeholder={stocktakeDetailCopy.optionalReasonPlaceholder}
            className="h-8 w-full text-sm"
            onBlur={(e) => onReasonBlur(line.id, e.target.value.trim())}
            disabled={isPending || line.counted_quantity == null}
          />
        </div>
      ),
    },
  ];

  return (
    <AppSection
      className="overflow-hidden"
      contentFlush
      description={stocktakeDetailCopy.sectionLineCount(lines.length)}
    >
      <DataTable
        columns={countingColumns}
        data={lines}
        getRowKey={(line) => line.id}
        emptyTitle={stocktakeDetailCopy.emptyCountTitle}
        emptyDescription={stocktakeDetailCopy.emptyCountDescription}
        emptyMode="no-data"
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
              <QuantityInput
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
            </div>
            <WasteReasonDropdown
              value={(line.reason_code as WasteReason | null) ?? ""}
              onChange={(value) => onReasonCodeChange(line.id, value)}
              disabled={isPending || line.counted_quantity == null}
              size="sm"
            />
            <Input
              type="text"
              defaultValue={line.variance_reason ?? ""}
              placeholder={stocktakeDetailCopy.reasonPlaceholder}
              className="h-8 text-sm"
              onBlur={(e) => onReasonBlur(line.id, e.target.value.trim())}
              disabled={isPending || line.counted_quantity == null}
            />
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
  reviewHref,
}: {
  lines: StocktakeLine[];
  varianceCount: number;
  reviewHref: string;
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
          return (
            <span className="text-sm font-mono text-muted-foreground">—</span>
          );
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
          {line.reason_code
            ? WASTE_REASON_LABELS_VI[
                line.reason_code as keyof typeof WASTE_REASON_LABELS_VI
              ] ?? line.reason_code
            : inventoryCommon.noValue}
          {line.variance_reason ? ` — ${line.variance_reason}` : ""}
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
          {stocktakeDetailCopy.results.nextActionDescription(varianceCount)}
        </p>
      </div>
      <Button
        size="sm"
        render={<Link href={reviewHref} />}
      >
        {stocktakeDetailCopy.results.nextActionCta}
        <IconArrowRight className="size-4" />
      </Button>
    </AppSection>
  );

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
                    <span className="shrink-0 font-mono text-sm text-muted-foreground">
                      —
                    </span>
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
