"use client";

import { KpiCard } from "@/components/kpi/kpi-card";

import { useState, useTransition } from "react";
import {
  TriangleAlert as IconAlertTriangle,
  ChevronRight as IconChevronRight,
  CircleCheck as IconCircleCheck,
} from "lucide-react";
import { BRANCH_VI, FORM_VI } from "@comtammatu/shared/messages";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@comtammatu/ui/components/card";
import { Input } from "@comtammatu/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@comtammatu/ui/components/sheet";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@comtammatu/ui/components/empty";
import { Spinner } from "@comtammatu/ui/components/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@comtammatu/ui/components/tabs";
import { formatVND } from "@comtammatu/shared/format";
import { fetchReconciliationByDay } from "../actions";
import { messages } from "@lib/messages";
import { formatVNDateTime } from "@/_lib/format-datetime";
import { AppToolbar } from "@/components/surface";
import {
  fetchReconciliation,
  fetchReconciliationDrilldown,
  type ReconciliationCategory,
  type ReconciliationCategoryRow,
  type ReconciliationDrilldownRow,
  type ReconciliationReport,
} from "../reconciliation-actions";

const reconciliationCopy = messages.finance.reconciliation;

interface ReconcileByDayRow {
  date: string;
  revenue_paid: number;
  gl_credit: number;
  diff: number;
}

const TOLERANCE_VND = 1;

type DesyncRow = {
  payment_id: number;
  order_id: number;
  branch_id: number | null;
  amount: number;
  payment_method: string | null;
  payment_paid_at: string | null;
  order_payment_status: string | null;
  age_minutes: number | null;
};

interface BranchOption {
  id: number;
  name: string;
}

export interface ReconciliationClientProps {
  branches: BranchOption[];
  desync: DesyncRow[];
  defaultStartDate: string;
  defaultEndDate: string;
}

interface DrilldownState {
  open: boolean;
  category: ReconciliationCategory | null;
  side: "subledger" | "gl";
  rows: ReconciliationDrilldownRow[];
  loading: boolean;
  error: string | null;
}

const initialDrilldown: DrilldownState = {
  open: false,
  category: null,
  side: "subledger",
  rows: [],
  loading: false,
  error: null,
};

export function ReconciliationClient({
  branches,
  desync,
  defaultStartDate,
  defaultEndDate,
}: ReconciliationClientProps) {
  const [branchId, setBranchId] = useState<number | null>(null);
  const [startDate, setStartDate] = useState(defaultStartDate);
  const [endDate, setEndDate] = useState(defaultEndDate);
  const [report, setReport] = useState<ReconciliationReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, startTransition] = useTransition();
  // Separate transitions per action so the run/by-day/drilldown buttons
  // don't share a pending flag (clicking one wouldn't disable the others).
  // Manual loading state is kept for now — fine-grained UI signals.
  const [, startByDayTransition] = useTransition();
  const [, startDrilldownTransition] = useTransition();
  const [drilldown, setDrilldown] = useState<DrilldownState>(initialDrilldown);
  const [byDayRows, setByDayRows] = useState<ReconcileByDayRow[]>([]);
  const [byDayLoading, setByDayLoading] = useState(false);
  const [byDayError, setByDayError] = useState<string | null>(null);

  const branchName = (id: number | null) =>
    id == null
      ? messages.finance.common.noValue
      : (branches.find((b) => b.id === id)?.name ??
        messages.finance.common.branchFallback(id));

  function handleRun() {
    setError(null);
    startTransition(async () => {
      const res = await fetchReconciliation({
        branchId,
        startDate,
        endDate,
      });
      if (!res.success) {
        setError(res.error ?? reconciliationCopy.errors.loadData);
        setReport(null);
        return;
      }
      setReport(res.data as ReconciliationReport);
    });
  }

  function loadByDay() {
    setByDayLoading(true);
    setByDayError(null);
    // startTransition marks the post-await state updates as low-priority,
    // keeping date-input typing and other urgent UI updates unblocked
    // during the fetch.
    startByDayTransition(async () => {
      const res = await fetchReconciliationByDay(branchId, startDate, endDate);
      setByDayLoading(false);
      if (!res.success) {
        setByDayError(res.error ?? reconciliationCopy.errors.loadByDay);
        setByDayRows([]);
        return;
      }
      setByDayRows((res.data as ReconcileByDayRow[]) ?? []);
    });
  }

  function openDrilldown(
    category: ReconciliationCategory,
    side: "subledger" | "gl",
  ) {
    setDrilldown({
      open: true,
      category,
      side,
      rows: [],
      loading: true,
      error: null,
    });

    startDrilldownTransition(async () => {
      const res = await fetchReconciliationDrilldown({
        branchId,
        startDate,
        endDate,
        category,
        side,
      });

      setDrilldown((prev) => ({
        ...prev,
        loading: false,
        rows: res.success ? (res.data as ReconciliationDrilldownRow[]) : [],
        error: res.success
          ? null
          : (res.error ?? reconciliationCopy.errors.loadDrilldown),
      }));
    });
  }

  const summary = report
    ? summarize(report.categories)
    : { totalDiff: 0, exceptions: 0 };

  return (
    <Tabs defaultValue="period" className="space-y-4">
      <TabsList className="h-auto w-full justify-start gap-2 overflow-x-auto p-2">
        <TabsTrigger value="period">
          {reconciliationCopy.tabs.period}
        </TabsTrigger>
        <TabsTrigger value="by-day">
          {reconciliationCopy.tabs.byDay}
        </TabsTrigger>
        <TabsTrigger value="desync">
          {reconciliationCopy.tabs.desync(desync.length)}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="period" className="mt-0 space-y-4">
        <AppToolbar className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
          <div className="space-y-1.5">
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {BRANCH_VI.long}
            </label>
            <Select
              value={branchId == null ? "all" : String(branchId)}
              onValueChange={(v) => setBranchId(v === "all" ? null : Number(v))}
            >
              <SelectTrigger>
                <SelectValue placeholder={BRANCH_VI.selectAll} />
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
          <div className="space-y-1.5">
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {FORM_VI.fromDate}
            </label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {FORM_VI.toDate}
            </label>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
          <Button onClick={handleRun} disabled={isLoading} className="self-end">
            {isLoading ? <Spinner /> : null}
            {reconciliationCopy.actions.run}
          </Button>
        </AppToolbar>

        {error ? (
          <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        {report ? (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <KpiCard
                label={reconciliationCopy.summary.range}
                value={`${report.start_date} → ${report.end_date}`}
                hint={branchName(report.branch_id)}
              />
              <KpiCard
                label={reconciliationCopy.summary.totalDifference}
                value={formatVND(summary.totalDiff)}
                hint={reconciliationCopy.summary.tolerance(
                  formatVND(TOLERANCE_VND),
                )}
                tone={
                  Math.abs(summary.totalDiff) > TOLERANCE_VND
                    ? "warning"
                    : "neutral"
                }
              />
              <KpiCard
                label={reconciliationCopy.summary.exceptionCount}
                value={`${summary.exceptions} / ${report.categories.length}`}
                hint={
                  summary.exceptions === 0
                    ? reconciliationCopy.summary.matchedAll
                    : reconciliationCopy.summary.needsReview
                }
                tone={summary.exceptions > 0 ? "warning" : "neutral"}
              />
            </div>

            <Card>
              <CardHeader>
                <CardTitle>
                  {reconciliationCopy.table.categoryDetailTitle}
                </CardTitle>
              </CardHeader>
              <CardContent flush scroll>
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                      <TableHead className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        {reconciliationCopy.table.group}
                      </TableHead>
                      <TableHead className="text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        {reconciliationCopy.table.subledger}
                      </TableHead>
                      <TableHead className="text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        {reconciliationCopy.table.gl}
                      </TableHead>
                      <TableHead className="text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        {reconciliationCopy.table.difference}
                      </TableHead>
                      <TableHead className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        {FORM_VI.status}
                      </TableHead>
                      <TableHead className="text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        {reconciliationCopy.table.drilldown}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.categories.map((cat) => (
                      <CategoryRow
                        key={cat.category}
                        cat={cat}
                        branchActive={report.branch_id != null}
                        onDrill={openDrilldown}
                      />
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </>
        ) : (
          <Empty className="py-8">
            <EmptyHeader>
              <EmptyTitle className="text-sm font-semibold">
                {reconciliationCopy.emptyResultTitle}
              </EmptyTitle>
              <EmptyDescription className="text-xs leading-5">
                {reconciliationCopy.emptyResultDescription}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </TabsContent>

      <TabsContent value="by-day" className="mt-0 space-y-4">
        <AppToolbar className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
          <div className="space-y-1.5">
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {BRANCH_VI.acronym}
            </label>
            <Select
              value={branchId == null ? "all" : String(branchId)}
              onValueChange={(value) =>
                setBranchId(value === "all" ? null : Number(value))
              }
            >
              <SelectTrigger>
                <SelectValue />
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
          <div className="space-y-1.5">
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {FORM_VI.fromDate}
            </label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {FORM_VI.toDate}
            </label>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
          <Button onClick={loadByDay} disabled={byDayLoading}>
            {byDayLoading
              ? messages.finance.common.loading
              : reconciliationCopy.actions.runByDay}
          </Button>
        </AppToolbar>

        <ByDayTable
          rows={byDayRows}
          loading={byDayLoading}
          error={byDayError}
        />
      </TabsContent>

      <TabsContent value="desync" className="mt-0">
        <DesyncTable rows={desync} branchName={branchName} />
      </TabsContent>

      <Sheet
        open={drilldown.open}
        onOpenChange={(open) => setDrilldown((prev) => ({ ...prev, open }))}
      >
        <SheetContent side="right" className="w-full sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>
              {reconciliationCopy.drilldown.title(
                drilldown.category ? labelForCategory(drilldown.category) : "",
              )}
            </SheetTitle>
            <SheetDescription>
              {drilldown.side === "subledger"
                ? reconciliationCopy.drilldown.subledgerDescription
                : reconciliationCopy.drilldown.glDescription}
            </SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-4">
            {drilldown.loading ? (
              <div className="flex justify-center py-10 text-muted-foreground">
                <Spinner className="size-5" />
              </div>
            ) : drilldown.error ? (
              <p className="py-10 text-center text-sm text-destructive">
                {drilldown.error}
              </p>
            ) : drilldown.rows.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                {reconciliationCopy.emptyRange}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      {reconciliationCopy.table.reference}
                    </TableHead>
                    <TableHead className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      {FORM_VI.date}
                    </TableHead>
                    <TableHead className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      {BRANCH_VI.long}
                    </TableHead>
                    <TableHead className="text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      {reconciliationCopy.table.amount}
                    </TableHead>
                    <TableHead className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      {reconciliationCopy.table.description}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {drilldown.rows.map((row) => (
                    <TableRow key={`${row.ref_id}-${row.ref_date}`}>
                      <TableCell className="font-mono text-xs">
                        {row.ref_label}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {formatVNDateTime(row.ref_date)}
                      </TableCell>
                      <TableCell className="text-sm">
                        {branchName(row.branch_id)}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatVND(Number(row.amount))}
                      </TableCell>
                      <TableCell className="max-w-sm text-xs text-muted-foreground">
                        <span className="line-clamp-2 break-words">
                          {row.description ?? messages.finance.common.noValue}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </Tabs>
  );
}

function summarize(rows: ReconciliationCategoryRow[]) {
  let totalDiff = 0;
  let exceptions = 0;
  for (const row of rows) {
    if (row.difference == null) continue;
    const d = Number(row.difference);
    totalDiff += Math.abs(d);
    if (Math.abs(d) > TOLERANCE_VND) exceptions += 1;
  }
  return { totalDiff, exceptions };
}

function labelForCategory(c: ReconciliationCategory): string {
  switch (c) {
    case "sales":
      return reconciliationCopy.categoryLabels.sales;
    case "cogs":
      return reconciliationCopy.categoryLabels.cogs;
    case "inventory_in":
      return reconciliationCopy.categoryLabels.inventoryIn;
    case "payroll":
      return reconciliationCopy.categoryLabels.payroll;
    case "ap_payment":
      return reconciliationCopy.categoryLabels.apPayment;
  }
}

function CategoryRow({
  cat,
  branchActive,
  onDrill,
}: {
  cat: ReconciliationCategoryRow;
  branchActive: boolean;
  onDrill: (category: ReconciliationCategory, side: "subledger" | "gl") => void;
}) {
  const tenantWideOnly = !cat.branch_scoped && branchActive;
  const diff = cat.difference == null ? null : Number(cat.difference);
  const isException = diff != null && Math.abs(diff) > TOLERANCE_VND;

  return (
    <TableRow>
      <TableCell className="font-medium">
        <div>{cat.label}</div>
        <div className="text-xs text-muted-foreground">{cat.category}</div>
      </TableCell>
      <TableCell className="text-right">
        {cat.subledger_total == null
          ? messages.finance.common.noValue
          : formatVND(Number(cat.subledger_total))}
      </TableCell>
      <TableCell className="text-right">
        {cat.gl_total == null
          ? messages.finance.common.noValue
          : formatVND(Number(cat.gl_total))}
      </TableCell>
      <TableCell
        className={`text-right ${
          isException ? "font-semibold text-warning-foreground" : ""
        }`}
      >
        {diff == null ? messages.finance.common.noValue : formatVND(diff)}
      </TableCell>
      <TableCell>
        {tenantWideOnly ? (
          <Badge variant="outline" className="text-xs">
            {reconciliationCopy.status.enterpriseWide}
          </Badge>
        ) : isException ? (
          <Badge variant="destructive" className="gap-1 text-xs">
            <IconAlertTriangle className="size-3" />
            {reconciliationCopy.status.different}
          </Badge>
        ) : diff == null ? (
          <Badge variant="outline" className="text-xs">
            {reconciliationCopy.status.notApplicable}
          </Badge>
        ) : (
          <Badge variant="secondary" className="gap-1 text-xs">
            <IconCircleCheck className="size-3" />
            {reconciliationCopy.status.matched}
          </Badge>
        )}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-1">
          <Button
            size="sm"
            variant="ghost"
            disabled={tenantWideOnly}
            onClick={() => onDrill(cat.category, "subledger")}
          >
            {reconciliationCopy.table.subledger}
            <IconChevronRight className="ml-1 size-3" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={tenantWideOnly}
            onClick={() => onDrill(cat.category, "gl")}
          >
            {reconciliationCopy.table.gl}
            <IconChevronRight className="ml-1 size-3" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

function ByDayTable({
  rows,
  loading,
  error,
}: {
  rows: ReconcileByDayRow[];
  loading: boolean;
  error: string | null;
}) {
  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-10">
          <Spinner />
        </CardContent>
      </Card>
    );
  }
  if (error) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-sm text-destructive">{error}</p>
        </CardContent>
      </Card>
    );
  }
  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="p-10 text-center text-sm text-muted-foreground">
          {reconciliationCopy.byDay.emptyDescription}
        </CardContent>
      </Card>
    );
  }

  const totalRevenue = rows.reduce((s, r) => s + r.revenue_paid, 0);
  const totalGl = rows.reduce((s, r) => s + r.gl_credit, 0);
  const totalDiff = totalRevenue - totalGl;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{reconciliationCopy.byDay.title}</CardTitle>
        <p className="text-sm text-muted-foreground">
          {reconciliationCopy.byDay.description}
        </p>
      </CardHeader>
      <CardContent scroll>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{reconciliationCopy.byDay.date}</TableHead>
              <TableHead className="text-right">
                {reconciliationCopy.byDay.posSubledger}
              </TableHead>
              <TableHead className="text-right">
                {reconciliationCopy.byDay.glSalesVat}
              </TableHead>
              <TableHead className="text-right">
                {reconciliationCopy.table.difference}
              </TableHead>
              <TableHead className="w-32">{FORM_VI.status}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const matched = Math.abs(r.diff) <= TOLERANCE_VND;
              return (
                <TableRow key={r.date}>
                  <TableCell className="font-mono tabular-nums font-medium">
                    {r.date}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {formatVND(r.revenue_paid)}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {formatVND(r.gl_credit)}
                  </TableCell>
                  <TableCell
                    className={
                      matched
                        ? "text-right font-mono tabular-nums text-success"
                        : "text-right font-mono tabular-nums font-medium text-destructive"
                    }
                  >
                    {matched
                      ? reconciliationCopy.byDay.zero
                      : formatVND(r.diff)}
                  </TableCell>
                  <TableCell>
                    {matched ? (
                      <Badge variant="success" className="gap-1">
                        <IconCircleCheck className="size-3.5" />
                        {reconciliationCopy.status.matched}
                      </Badge>
                    ) : (
                      <Badge variant="destructive" className="gap-1">
                        <IconAlertTriangle className="size-3.5" />
                        {reconciliationCopy.status.different}
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
            <TableRow className="bg-muted/40">
              <TableCell className="font-medium">
                {reconciliationCopy.byDay.total}
              </TableCell>
              <TableCell className="text-right font-mono tabular-nums font-medium">
                {formatVND(totalRevenue)}
              </TableCell>
              <TableCell className="text-right font-mono tabular-nums font-medium">
                {formatVND(totalGl)}
              </TableCell>
              <TableCell
                className={
                  Math.abs(totalDiff) <= TOLERANCE_VND
                    ? "text-right font-mono tabular-nums font-bold text-success"
                    : "text-right font-mono tabular-nums font-bold text-destructive"
                }
              >
                {Math.abs(totalDiff) <= TOLERANCE_VND
                  ? reconciliationCopy.status.matched
                  : formatVND(totalDiff)}
              </TableCell>
              <TableCell />
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function DesyncTable({
  rows,
  branchName,
}: {
  rows: DesyncRow[];
  branchName: (id: number | null) => string;
}) {
  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
          <IconCircleCheck className="size-4 text-success" />
          {reconciliationCopy.desync.emptyDescription}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <IconAlertTriangle className="size-4 text-warning-foreground" />
          {reconciliationCopy.desync.reviewCount(rows.length)}
        </CardTitle>
      </CardHeader>
      <CardContent flush scroll>
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {reconciliationCopy.desync.payment}
              </TableHead>
              <TableHead className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {reconciliationCopy.desync.order}
              </TableHead>
              <TableHead className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {BRANCH_VI.long}
              </TableHead>
              <TableHead className="text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {reconciliationCopy.table.amount}
              </TableHead>
              <TableHead className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {reconciliationCopy.desync.method}
              </TableHead>
              <TableHead className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {reconciliationCopy.desync.orderStatus}
              </TableHead>
              <TableHead className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {reconciliationCopy.desync.paidAt}
              </TableHead>
              <TableHead className="text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {reconciliationCopy.desync.ageDiff}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.payment_id}>
                <TableCell className="font-mono text-xs">
                  #{r.payment_id}
                </TableCell>
                <TableCell className="font-mono text-xs">
                  #{r.order_id}
                </TableCell>
                <TableCell className="text-sm">
                  {branchName(r.branch_id)}
                </TableCell>
                <TableCell className="text-right font-medium">
                  {formatVND(Number(r.amount))}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="font-mono text-xs">
                    {r.payment_method ?? messages.finance.common.noValue}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge
                    variant={
                      r.order_payment_status === "refunded"
                        ? "destructive"
                        : "outline"
                    }
                  >
                    {r.order_payment_status ?? reconciliationCopy.desync.unpaid}
                  </Badge>
                </TableCell>
                <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                  {r.payment_paid_at
                    ? formatVNDateTime(r.payment_paid_at)
                    : messages.finance.common.noValue}
                </TableCell>
                <TableCell className="text-right text-xs text-muted-foreground">
                  {r.age_minutes != null
                    ? reconciliationCopy.desync.minutes(r.age_minutes)
                    : messages.finance.common.noValue}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
