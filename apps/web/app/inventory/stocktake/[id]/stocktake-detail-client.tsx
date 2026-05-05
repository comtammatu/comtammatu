"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft as IconArrowLeft, Ban as IconBan, Check as IconCheck, CircleCheck as IconCircleCheck, ClipboardCheck as IconClipboardCheck, CircleX as IconCircleX } from "lucide-react";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Input } from "@comtammatu/ui/components/input";
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
import { Card, CardContent } from "@comtammatu/ui/components/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@comtammatu/ui/components/empty";
import { Progress } from "@comtammatu/ui/components/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
import { toast } from "@comtammatu/ui/components/sonner";

import { useIsMobile } from "@comtammatu/ui/hooks/use-mobile";
import { cn } from "@comtammatu/ui";
import { messages } from "@lib/messages";
import { InventoryHeader } from "../../_components/inventory-header";
import { FormattedNumberInput } from "../../_components/formatted-number-input";
import { TableEmptyStateRow } from "../../_components/table-empty-state-row";
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
    purchase_unit: string | null;
    category: string | null;
  } | null;
}

const STATUS_META: Record<string, { label: string; className: string }> = {
  in_progress: {
    label: stocktakeDetailCopy.status.inProgress,
    className: "bg-warning/10 text-warning border-warning/30",
  },
  completed: {
    label: stocktakeDetailCopy.status.completed,
    className: "bg-success/10 text-success border-success/30",
  },
  cancelled: {
    label: stocktakeDetailCopy.status.cancelled,
    className: "bg-muted text-muted-foreground",
  },
};

export function StocktakeDetailClient({
  session: initialSession,
  lines: initialLines,
  routeBase = "/inventory/stocktake",
}: {
  session: StocktakeSession;
  lines: StocktakeLine[];
  routeBase?: string;
  inventoryBasePath?: string;
}) {
  const isMobile = useIsMobile();
  const [isPending, startTransition] = useTransition();
  const [session, setSession] = useState<StocktakeSession>(initialSession);
  const [lines, setLines] = useState<StocktakeLine[]>(initialLines);
  const [savedLines, setSavedLines] = useState<Set<number>>(new Set());
  const [completeDialogOpen, setCompleteDialogOpen] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);

  const meta = STATUS_META[session.status] ?? {
    label: session.status,
    className: "bg-muted text-muted-foreground",
  };

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
    stocktakeDetailCopy.createdAt(
      new Date(session.created_at).toLocaleDateString("vi-VN", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
    ),
    session.completed_at
      ? stocktakeDetailCopy.completedAt(
          new Date(session.completed_at).toLocaleDateString("vi-VN", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          }),
        )
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

  function handleComplete() {
    startTransition(async () => {
      const res = await completeStocktake(session.id);
      if (!res.success) {
        toast.error(res.error ?? stocktakeDetailCopy.completeFailed);
        setCompleteDialogOpen(false);
        return;
      }
      toast.success(stocktakeDetailCopy.completeOk);
      setCompleteDialogOpen(false);
      refreshData();
    });
  }

  function handleCancel() {
    startTransition(async () => {
      const res = await cancelStocktake(session.id);
      if (!res.success) {
        toast.error(res.error ?? stocktakeDetailCopy.cancelFailed);
        setCancelDialogOpen(false);
        return;
      }
      toast.success(stocktakeDetailCopy.cancelOk);
      setCancelDialogOpen(false);
      refreshData();
    });
  }

  return (
    <>
      <InventoryHeader
        title={stocktakeDetailCopy.title}
        actions={
          <Link
            href={`${routeBase}?branchId=${session.branch_id}`}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
          >
            <IconArrowLeft className="size-4" /> {tRoute("/inventory/stocktake")}
          </Link>
        }
      />
      <div className="flex-1 overflow-auto p-4">
      <div className="mx-auto max-w-7xl space-y-6">

      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1">
          <p className="text-sm font-medium text-muted-foreground">
            {stocktakeDetailCopy.controlLabel}
          </p>
          <div className="space-y-1">
            <h1 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
              {`KK-${session.id}`}
            </h1>
            <p className="text-sm text-muted-foreground">{headerDescription}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge className={cn("text-xs", meta.className)}>{meta.label}</Badge>
          {session.status === "in_progress" ? (
            <>
              <Button
                variant="outline"
                onClick={() => setCancelDialogOpen(true)}
                disabled={isPending}
              >
                <IconBan className="mr-2 size-4" />
                {stocktakeDetailCopy.cancelAction}
              </Button>
              <Button
                onClick={() => setCompleteDialogOpen(true)}
                disabled={isPending}
              >
                <IconCircleCheck className="mr-2 size-4" />
                {stocktakeDetailCopy.completeAction}
              </Button>
            </>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: stocktakeDetailCopy.metrics.status,
            value: meta.label,
          },
          {
            label: stocktakeDetailCopy.metrics.counted,
            value: `${countedCount}/${lines.length}`,
          },
          {
            label: stocktakeDetailCopy.metrics.progress,
            value: `${progressPct}%`,
          },
          {
            label: stocktakeDetailCopy.metrics.varianceLines,
            value: String(varianceCount).padStart(2, "0"),
          },
        ].map((item) => (
          <Card key={item.label}><CardContent>
            <Badge variant="secondary">
              {item.label}
            </Badge>
            <p className="mt-3 text-xl font-semibold">{item.value}</p>
          </CardContent></Card>
        ))}
      </div>

      {/* Progress (in_progress only) */}
      {session.status === "in_progress" && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 text-sm">
              <IconClipboardCheck className="size-4 text-muted-foreground" />
              <span className="text-muted-foreground">
                {stocktakeDetailCopy.progressText(
                  countedCount,
                  lines.length,
                  progressPct,
                )}
              </span>
              <Progress value={progressPct} className="h-2 max-w-48 flex-1" />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Cancelled state */}
      {session.status === "cancelled" && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-2 py-10 text-center">
            <IconCircleX className="size-8 text-muted-foreground" />
            <p className="text-base font-semibold">
              {stocktakeDetailCopy.cancelledTitle}
            </p>
            <p className="text-sm text-muted-foreground">
              {stocktakeDetailCopy.cancelledDescription}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Counting phase (in_progress) */}
      {session.status === "in_progress" && (
        <CountingPhase
          lines={lines}
          savedLines={savedLines}
          isPending={isPending}
          isMobile={isMobile}
          onLineBlur={handleLineBlur}
          onReasonBlur={handleReasonBlur}
        />
      )}

      {/* Results phase (completed) */}
      {session.status === "completed" && (
        <ResultsPhase lines={lines} isMobile={isMobile} />
      )}
      </div>
      </div>

      {/* Complete confirm dialog */}
      <AlertDialog
        open={completeDialogOpen}
        onOpenChange={setCompleteDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {stocktakeDetailCopy.completeDialogTitle}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {stocktakeDetailCopy.completeDialogDescription}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>{ACTIONS_VI.cancel}</AlertDialogCancel>
            <AlertDialogAction onClick={handleComplete} disabled={isPending}>
              {isPending
                ? stocktakeDetailCopy.processing
                : stocktakeDetailCopy.completeResultAction}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel confirm dialog */}
      <AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {stocktakeDetailCopy.cancelDialogTitle}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {stocktakeDetailCopy.cancelDialogDescription}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>{ACTIONS_VI.back}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancel}
              disabled={isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isPending
                ? stocktakeDetailCopy.processing
                : stocktakeDetailCopy.confirmCancelAction}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/* ─── CountingPhase ─── */

function CountingPhase({
  lines,
  savedLines,
  isPending,
  isMobile,
  onLineBlur,
  onReasonBlur,
}: {
  lines: StocktakeLine[];
  savedLines: Set<number>;
  isPending: boolean;
  isMobile: boolean;
  onLineBlur: (lineId: number, value: string) => void;
  onReasonBlur: (lineId: number, reason: string) => void;
}) {
  if (isMobile) {
    return (
      <Card className="overflow-hidden rounded-lg">
        <CardContent className="p-0">
          {lines.length === 0 ? (
            <Empty className="py-8">
              <EmptyHeader>
                <EmptyTitle className="text-sm font-semibold">
                  {stocktakeDetailCopy.emptyCountTitle}
                </EmptyTitle>
                <EmptyDescription className="text-xs leading-5">
                  {stocktakeDetailCopy.emptyCountDescription}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="-m-4 divide-y md:-m-5">
              {lines.map((line) => (
                <div key={line.id} className="space-y-2 px-4 py-3 md:px-5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">
                      {line.ingredients?.name ?? `#${line.ingredient_id}`}
                    </span>
                    {savedLines.has(line.id) && (
                      <span className="inline-flex shrink-0 items-center gap-1 text-xs text-success">
                        <IconCheck className="size-3" />
                        {stocktakeDetailCopy.saved}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {line.ingredients?.purchase_unit ??
                      line.ingredients?.unit ??
                      inventoryCommon.noValue}
                  </p>
                  <div className="flex items-center gap-2">
                    <FormattedNumberInput
                      key={`stocktake-mobile-${line.id}-${line.counted_quantity ?? ""}`}
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
                      onBlur={(e) =>
                        onReasonBlur(line.id, e.target.value.trim())
                      }
                      disabled={isPending}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden rounded-lg">
      <CardContent className="p-0">
        <div className="-m-4 md:-m-5">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/20 hover:bg-muted/20">
                <TableHead className="text-xs font-semibold uppercase tracking-wider">
                  {tTerm("ingredient")}
                </TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider">
                  {FORM_VI.unit}
                </TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider">
                  {stocktakeDetailCopy.countedQtyPlaceholder}
                </TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider">
                  {stocktakeDetailCopy.varianceReason}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.length === 0 && (
                <TableEmptyStateRow
                  colSpan={4}
                  paddingClassName="py-14"
                  title={stocktakeDetailCopy.emptyCountTitle}
                  description={stocktakeDetailCopy.emptyCountDescription}
                />
              )}
              {lines.map((line) => (
                <TableRow key={line.id}>
                  <TableCell className="text-sm font-medium">
                    <div className="flex items-center gap-2">
                      {line.ingredients?.name ?? `#${line.ingredient_id}`}
                      {savedLines.has(line.id) && (
                        <span className="inline-flex items-center gap-0.5 text-xs text-success">
                          <IconCheck className="size-3" />
                          {stocktakeDetailCopy.saved}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {line.ingredients?.purchase_unit ??
                      line.ingredients?.unit ??
                      inventoryCommon.noValue}
                  </TableCell>
                  <TableCell>
                    <FormattedNumberInput
                      key={`stocktake-desktop-${line.id}-${line.counted_quantity ?? ""}`}
                      defaultValue={
                        line.counted_quantity != null
                          ? String(line.counted_quantity)
                          : ""
                      }
                      placeholder="0"
                      className="h-8 w-24 tabular-nums"
                      onValueBlur={(value) => onLineBlur(line.id, value)}
                      maxFractionDigits={3}
                      disabled={isPending}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="text"
                      defaultValue={line.variance_reason ?? ""}
                      placeholder={stocktakeDetailCopy.optionalReasonPlaceholder}
                      className="h-8 w-48 text-sm"
                      onBlur={(e) =>
                        onReasonBlur(line.id, e.target.value.trim())
                      }
                      disabled={isPending}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
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
  if (ratio < 0.01) return "bg-success/5";
  if (ratio < 0.05) return "bg-warning/5";
  return "bg-destructive/5";
}

function ResultsPhase({
  lines,
  isMobile,
}: {
  lines: StocktakeLine[];
  isMobile: boolean;
}) {
  return (
    <div className="space-y-3">
      {/* Variance legend */}
      <div className="flex flex-wrap items-center gap-4 text-xs">
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

      {isMobile ? (
        <Card className="overflow-hidden rounded-lg">
          <CardContent className="p-0">
            {lines.length === 0 ? (
              <Empty className="py-8">
                <EmptyHeader>
                  <EmptyTitle className="text-sm font-semibold">
                    {stocktakeDetailCopy.results.emptyTitle}
                  </EmptyTitle>
                  <EmptyDescription className="text-xs leading-5">
                    {stocktakeDetailCopy.results.emptyDescription}
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <div className="-m-4 divide-y md:-m-5">
                {lines.map((line) => {
                  const varianceColor = getVarianceColor(line);
                  const variance = line.variance ?? 0;
                  return (
                    <div
                      key={line.id}
                      className={cn(
                        "space-y-1 px-4 py-3 md:px-5",
                        getVarianceBg(line),
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium">
                          {line.ingredients?.name ?? `#${line.ingredient_id}`}
                        </span>
                        <span
                          className={cn(
                            "shrink-0 font-mono text-sm font-medium tabular-nums",
                            varianceColor,
                          )}
                        >
                          {variance > 0 && "+"}
                          {variance}
                        </span>
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
                })}
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden rounded-lg">
          <CardContent className="p-0">
            <div className="-m-4 md:-m-5">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/20 hover:bg-muted/20">
                    <TableHead className="text-xs font-semibold uppercase tracking-wider">
                      {tTerm("ingredient")}
                    </TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider">
                      {FORM_VI.unit}
                    </TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider">
                      {stocktakeDetailCopy.results.systemQty}
                    </TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider">
                      {stocktakeDetailCopy.results.countedQty}
                    </TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider">
                      {stocktakeDetailCopy.results.variance}
                    </TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider">
                      {FORM_VI.reason}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.length === 0 && (
                    <TableEmptyStateRow
                      colSpan={6}
                      paddingClassName="py-14"
                      title={stocktakeDetailCopy.results.emptyTitle}
                      description={stocktakeDetailCopy.results.emptyDescription}
                    />
                  )}
                  {lines.map((line) => {
                    const varianceColor = getVarianceColor(line);
                    const variance = line.variance ?? 0;

                    return (
                      <TableRow key={line.id} className={getVarianceBg(line)}>
                        <TableCell className="text-sm font-medium">
                          {line.ingredients?.name ?? `#${line.ingredient_id}`}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {line.ingredients?.purchase_unit ??
                            line.ingredients?.unit ??
                            inventoryCommon.noValue}
                        </TableCell>
                        <TableCell className="text-sm tabular-nums">
                          {line.system_quantity}
                        </TableCell>
                        <TableCell className="text-sm tabular-nums">
                          {line.counted_quantity ?? inventoryCommon.noValue}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-sm font-medium tabular-nums",
                            varianceColor,
                          )}
                        >
                          {variance > 0 && "+"}
                          {variance}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {line.variance_reason ?? inventoryCommon.noValue}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
