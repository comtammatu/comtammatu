"use client";

import React, { useState, useTransition } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
import { Button } from "@comtammatu/ui/components/button";
import { Badge } from "@comtammatu/ui/components/badge";
import { Card, CardContent } from "@comtammatu/ui/components/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@comtammatu/ui/components/dialog";
import {
  Lock as IconLock,
  Plus as IconPlus,
  FileSearch as IconFileSearch,
} from "lucide-react";
import {
  ACTIONS_VI,
  ERRORS_VI,
  FORM_VI,
  STATES_VI,
} from "@comtammatu/shared/messages";
import { AppToolbar } from "@/components/surface";
import { TableEmptyStateRow } from "@/components/table-empty-state-row";
import { messages } from "@lib/messages";
import {
  openFiscalPeriod,
  closeFiscalPeriod,
  fetchReconciliation,
} from "../period-actions";
import type { FiscalPeriodRow, ReconciliationItem } from "./page";

interface Props {
  periods: FiscalPeriodRow[];
}

const STATUS_LABEL: Record<string, string> =
  messages.finance.periods.statusLabels;

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
  open: "default",
  closing: "secondary",
  closed: "outline",
};

function formatPeriod(month: number, year: number) {
  return `T${String(month).padStart(2, "0")}/${year}`;
}

export function PeriodsClient({ periods: initial }: Props) {
  const [periods, setPeriods] = useState(initial);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Close dialog state
  const [closeTarget, setCloseTarget] = useState<FiscalPeriodRow | null>(null);

  // Reconciliation dialog state
  const [reconTarget, setReconTarget] = useState<{
    year: number;
    month: number;
  } | null>(null);
  const [reconData, setReconData] = useState<ReconciliationItem[] | null>(null);
  const [reconLoading, setReconLoading] = useState(false);

  function handleOpenCurrent() {
    setError(null);
    const now = new Date();
    startTransition(async () => {
      const res = await openFiscalPeriod({
        year: now.getFullYear(),
        month: now.getMonth() + 1,
      });
      if (!res.success) {
        setError(res.error ?? ERRORS_VI.unknown);
        return;
      }
      const newPeriod = res.data as FiscalPeriodRow;
      setPeriods((prev) => {
        const idx = prev.findIndex((p) => p.id === newPeriod.id);
        if (idx >= 0) {
          // Upsert returned existing — merge updated data
          const updated = [...prev];
          updated[idx] = { ...prev[idx]!, ...newPeriod };
          return updated;
        }
        return [newPeriod, ...prev];
      });
    });
  }

  function handleClose(period: FiscalPeriodRow) {
    setCloseTarget(period);
  }

  function confirmClose() {
    if (!closeTarget) return;
    setError(null);
    startTransition(async () => {
      const res = await closeFiscalPeriod({
        year: closeTarget.period_year,
        month: closeTarget.period_month,
      });
      if (!res.success) {
        setError(res.error ?? ERRORS_VI.unknown);
        setCloseTarget(null);
        return;
      }

      const result = res.data as {
        period_id: number;
        status: string;
        has_discrepancies: boolean;
        reconciliation: ReconciliationItem[];
      };

      setPeriods((prev) =>
        prev.map((p) =>
          p.id === closeTarget.id
            ? {
                ...p,
                status: "closed",
                closed_at: new Date().toISOString(),
                notes: result.has_discrepancies
                  ? (p.notes ?? "") + " [Có chênh lệch]"
                  : p.notes,
              }
            : p,
        ),
      );

      // Show reconciliation results
      setReconTarget({
        year: closeTarget.period_year,
        month: closeTarget.period_month,
      });
      setReconData(result.reconciliation);
      setCloseTarget(null);
    });
  }

  function handleViewRecon(year: number, month: number) {
    setReconLoading(true);
    setReconTarget({ year, month });
    setReconData(null);

    fetchReconciliation({ year, month }).then((res) => {
      setReconLoading(false);
      if (res.success) {
        setReconData((res.data ?? []) as ReconciliationItem[]);
      }
    });
  }

  return (
    <>
      <AppToolbar className="justify-between">
        <div className="space-y-1">
          <p className="text-sm font-medium">{messages.finance.periods.title}</p>
          <p className="text-xs text-muted-foreground">
            {messages.finance.periods.description}
          </p>
        </div>
        <Button onClick={handleOpenCurrent} size="sm" disabled={isPending}>
          <IconPlus className="mr-1.5 size-4" />
          {messages.finance.periods.openCurrent}
        </Button>
      </AppToolbar>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Card className="overflow-hidden">
        <CardContent className="overflow-x-auto px-4 sm:px-5">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-32">
                  {messages.finance.periods.period}
                </TableHead>
                <TableHead className="w-28">{FORM_VI.status}</TableHead>
                <TableHead>{messages.finance.periods.closedDate}</TableHead>
                <TableHead>{FORM_VI.notes}</TableHead>
                <TableHead className="w-48 text-right">
                  {FORM_VI.action}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {periods.length === 0 ? (
                  <TableEmptyStateRow
                    colSpan={5}
                    title={messages.finance.periods.emptyTitle}
                    description={messages.finance.periods.emptyDescription}
                  />
              ) : (
                periods.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium tabular-nums">
                      {formatPeriod(p.period_month, p.period_year)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[p.status] ?? "secondary"}>
                        {STATUS_LABEL[p.status] ?? p.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {p.closed_at
                        ? new Date(p.closed_at).toLocaleDateString("vi-VN")
                        : "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                      {p.notes ?? "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            handleViewRecon(p.period_year, p.period_month)
                          }
                        >
                          <IconFileSearch className="mr-1 size-3.5" />
                          {messages.finance.periods.reconcile}
                        </Button>
                        {p.status === "open" && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleClose(p)}
                            disabled={isPending}
                          >
                            <IconLock className="mr-1 size-3.5" />
                            {messages.finance.periods.closePeriod}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Close confirmation dialog */}
      <Dialog
        open={closeTarget !== null}
        onOpenChange={() => setCloseTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {messages.finance.periods.closeDialogTitle}
            </DialogTitle>
            <DialogDescription>
              {messages.finance.periods.closeDialogDescription(
                closeTarget
                  ? formatPeriod(closeTarget.period_month, closeTarget.period_year)
                  : "",
              )}
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {messages.finance.periods.closeIntro}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCloseTarget(null)}>
              {ACTIONS_VI.cancel}
            </Button>
            <Button onClick={confirmClose} disabled={isPending}>
              {messages.finance.periods.closePeriod}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reconciliation results dialog */}
      <Dialog
        open={reconTarget !== null}
        onOpenChange={() => {
          setReconTarget(null);
          setReconData(null);
        }}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {messages.finance.periods.reconTitle(
                reconTarget
                  ? formatPeriod(reconTarget.month, reconTarget.year)
                  : "",
              )}
            </DialogTitle>
          </DialogHeader>
          {reconLoading ? (
            <p className="py-6 text-center text-muted-foreground">
              {STATES_VI.loading}
            </p>
          ) : reconData ? (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{messages.finance.periods.item}</TableHead>
                    <TableHead className="w-32 text-right">
                      {messages.finance.periods.sourceDocument}
                    </TableHead>
                    <TableHead className="w-32 text-right">
                      {messages.finance.periods.gl}
                    </TableHead>
                    <TableHead className="w-28 text-right">
                      {messages.finance.periods.difference}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reconData.map((item, i) => {
                    const hasDiff = Math.abs(item.difference) > 1;
                    return (
                      <TableRow key={i}>
                        <TableCell className="text-sm">
                          {item.category}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {Number(item.subledger_total).toLocaleString("vi-VN")}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {Number(item.gl_total).toLocaleString("vi-VN")}
                        </TableCell>
                        <TableCell
                          className={`text-right tabular-nums font-medium ${hasDiff ? "text-destructive" : "text-success"}`}
                        >
                          {hasDiff
                            ? Number(item.difference).toLocaleString("vi-VN")
                            : "0"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="py-6 text-center text-muted-foreground">
              {messages.finance.periods.noData}
            </p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setReconTarget(null);
                setReconData(null);
              }}
            >
              {ACTIONS_VI.close}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
