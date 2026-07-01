"use client";

import { useState, useTransition } from "react";
import { Button } from "@comtammatu/ui/components/button";
import { Input } from "@comtammatu/ui/components/input";
import { Label } from "@comtammatu/ui/components/label";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { toast } from "@comtammatu/ui/components/sonner";
import {
  Calculator as IconCalculator,
  CircleCheck as IconCircleCheck,
  CreditCard as IconCreditCard,
} from "lucide-react";
import {
  calculatePayroll,
  approvePayroll,
  markPayrollPaid,
  fetchPayrollEntries,
  fetchPayrollPeriod,
  updatePayrollPeriodStandardDays,
} from "../../payroll-actions";
import type { PayrollEntryRow, PayrollPeriodDetail } from "./_types";
import { ExportPayrollCsvButton } from "./export-payroll-csv-button";
import { ERRORS_VI, STAFF_VI } from "@comtammatu/shared/messages";
import { formatVND } from "@comtammatu/shared/format";
import { getVNMonthYear } from "@comtammatu/shared/time";
import { messages } from "@lib/messages";
import { KpiCard } from "@/components/kpi/kpi-card";
import { AppSection, DescriptionList } from "@/components/surface";
import {
  DataTable,
  type DataTableColumn,
  type DataTableFooterRow,
} from "@/components/data-table/data-table";

const copy = messages.hr.payroll.detail;

interface PayrollDetailClientProps {
  periodId: number;
  initialPeriod: PayrollPeriodDetail | null;
  initialEntries: PayrollEntryRow[];
}

export function PayrollDetailClient({
  periodId,
  initialPeriod,
  initialEntries,
}: PayrollDetailClientProps) {
  const [entries, setEntries] = useState(initialEntries);
  const [period, setPeriod] = useState(initialPeriod);
  const [standardDaysInput, setStandardDaysInput] = useState(
    (
      initialPeriod?.standard_days ??
      initialEntries[0]?.standard_days ??
      26
    ).toString(),
  );
  const [isPending, startTransition] = useTransition();

  function reload() {
    startTransition(async () => {
      const [periodResult, result] = await Promise.all([
        fetchPayrollPeriod({ periodId }),
        fetchPayrollEntries({ periodId }),
      ]);
      if (periodResult.success) {
        const nextPeriod = (periodResult.data ??
          null) as PayrollPeriodDetail | null;
        setPeriod(nextPeriod);
        if (nextPeriod) {
          setStandardDaysInput(Number(nextPeriod.standard_days).toString());
        }
      }
      if (result.success) {
        setEntries((result.data ?? []) as PayrollEntryRow[]);
      }
    });
  }

  function handleCalculate() {
    startTransition(async () => {
      const result = await calculatePayroll({ periodId });
      if (result.success) {
        toast.success(
          copy.toast.calculated(
            (result.meta as { employeeCount: number })?.employeeCount ?? 0,
          ),
        );
        reload();
      } else {
        toast.error(result.error ?? ERRORS_VI.fallback);
      }
    });
  }

  function handleSaveStandardDays() {
    const standardDays = Number(standardDaysInput);
    if (!Number.isFinite(standardDays) || standardDays <= 0) {
      toast.error(ERRORS_VI.validationFailed);
      return;
    }

    startTransition(async () => {
      const result = await updatePayrollPeriodStandardDays({
        periodId,
        standardDays,
      });
      if (result.success) {
        toast.success(copy.toast.standardDaysSaved);
        reload();
      } else {
        toast.error(result.error ?? ERRORS_VI.fallback);
      }
    });
  }

  function handleApprove() {
    startTransition(async () => {
      const result = await approvePayroll({ periodId });
      if (result.success) {
        toast.success(copy.toast.approved);
        reload();
      } else {
        toast.error(result.error ?? ERRORS_VI.fallback);
      }
    });
  }

  function handlePay() {
    startTransition(async () => {
      const result = await markPayrollPaid({ periodId });
      if (result.success) {
        toast.success(copy.toast.paid);
        reload();
      } else {
        toast.error(result.error ?? ERRORS_VI.fallback);
      }
    });
  }

  // Totals
  const totalGross = entries.reduce((s, e) => s + Number(e.gross_total), 0);
  const totalPaidLeaveDays = entries.reduce(
    (s, e) => s + Number(e.paid_leave_days),
    0,
  );
  const totalUnpaidLeaveDays = entries.reduce(
    (s, e) => s + Number(e.unpaid_leave_days),
    0,
  );
  const totalPayableDays = entries.reduce(
    (s, e) => s + Number(e.payable_days),
    0,
  );
  const totalInsEmp = entries.reduce(
    (s, e) => s + Number(e.total_insurance_employee),
    0,
  );
  const totalInsEmployer = entries.reduce(
    (s, e) => s + Number(e.total_insurance_employer),
    0,
  );
  const totalPit = entries.reduce((s, e) => s + Number(e.pit_tax), 0);
  const totalNet = entries.reduce((s, e) => s + Number(e.net_salary), 0);
  // CSV filename fallback when the period row failed to load.
  const { month: fallbackMonth, year: fallbackYear } = getVNMonthYear();
  const columns: DataTableColumn<PayrollEntryRow>[] = [
    {
      key: "employee",
      header: STAFF_VI.long,
      render: (entry) => (
        <div>
          <p className="font-medium">
            {entry.employees?.profiles?.full_name ?? "—"}
          </p>
          <p className="text-xs text-muted-foreground">
            {entry.employees?.employee_code}
          </p>
        </div>
      ),
    },
    {
      key: "working_days",
      header: copy.table.workingDays,
      className: "text-right font-mono tabular-nums text-sm",
      render: (entry) => Number(entry.working_days),
    },
    {
      key: "paid_leave_days",
      header: copy.table.paidLeaveDays,
      className: "text-right font-mono tabular-nums text-sm",
      render: (entry) => Number(entry.paid_leave_days),
    },
    {
      key: "unpaid_leave_days",
      header: copy.table.unpaidLeaveDays,
      className: "text-right font-mono tabular-nums text-sm",
      render: (entry) => Number(entry.unpaid_leave_days),
    },
    {
      key: "payable_days",
      header: copy.table.payableDays,
      className: "text-right font-mono tabular-nums text-sm",
      render: (entry) =>
        `${Number(entry.payable_days)}/${Number(entry.standard_days)}`,
    },
    {
      key: "gross",
      header: copy.table.gross,
      className: "text-right font-mono tabular-nums",
      render: (entry) => formatVND(Number(entry.gross_total)),
    },
    {
      key: "insurance_base",
      header: copy.table.insuranceBase,
      className: "text-right font-mono tabular-nums text-sm",
      render: (entry) => formatVND(Number(entry.insurance_base)),
    },
    {
      key: "employee_insurance",
      header: copy.table.employeeInsurance,
      className: "text-right font-mono tabular-nums text-sm",
      render: (entry) => formatVND(Number(entry.total_insurance_employee)),
    },
    {
      key: "employer_insurance",
      header: copy.table.employerInsurance,
      className: "text-right font-mono tabular-nums text-sm",
      render: (entry) => formatVND(Number(entry.total_insurance_employer)),
    },
    {
      key: "deductions",
      header: copy.table.deductions,
      className: "text-right font-mono tabular-nums text-sm",
      render: (entry) =>
        formatVND(
          Number(entry.personal_deduction) + Number(entry.dependent_deduction),
        ),
    },
    {
      key: "taxable_income",
      header: copy.table.taxableIncome,
      className: "text-right font-mono tabular-nums text-sm",
      render: (entry) => formatVND(Number(entry.taxable_income)),
    },
    {
      key: "pit",
      header: copy.table.pit,
      className: "text-right font-mono tabular-nums text-sm",
      render: (entry) => formatVND(Number(entry.pit_tax)),
    },
    {
      key: "net",
      header: copy.table.net,
      className: "text-right font-mono tabular-nums font-bold",
      render: (entry) => formatVND(Number(entry.net_salary)),
    },
  ];
  const footerRows: DataTableFooterRow[] =
    entries.length > 0
      ? [
          {
            key: "total",
            className: "bg-muted/50 font-bold",
            cells: [
              { key: "label", content: copy.table.total(entries.length) },
              { key: "working_days", content: "" },
              {
                key: "paid_leave_days",
                content: totalPaidLeaveDays,
                className: "text-right font-mono tabular-nums",
              },
              {
                key: "unpaid_leave_days",
                content: totalUnpaidLeaveDays,
                className: "text-right font-mono tabular-nums",
              },
              {
                key: "payable_days",
                content: totalPayableDays,
                className: "text-right font-mono tabular-nums",
              },
              {
                key: "gross",
                content: formatVND(totalGross),
                className: "text-right font-mono tabular-nums",
              },
              { key: "insurance_base", content: "" },
              {
                key: "employee_insurance",
                content: formatVND(totalInsEmp),
                className: "text-right font-mono tabular-nums",
              },
              {
                key: "employer_insurance",
                content: formatVND(totalInsEmployer),
                className: "text-right font-mono tabular-nums",
              },
              { key: "deductions", content: "" },
              { key: "taxable_income", content: "" },
              {
                key: "pit",
                content: formatVND(totalPit),
                className: "text-right font-mono tabular-nums",
              },
              {
                key: "net",
                content: formatVND(totalNet),
                className: "text-right font-mono tabular-nums",
              },
            ],
          },
        ]
      : [];

  return (
    <div className="flex flex-col gap-4">
      <AppSection
        title={copy.controlTitle}
        description={copy.controlDescription}
        headerHint={period?.status ?? ""}
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="standard-days-input" className="text-xs text-muted-foreground font-normal">
                {copy.standardDays}
              </Label>
              <Input
                id="standard-days-input"
                aria-label={copy.standardDays}
                className="h-9 w-24 text-right font-mono tabular-nums"
                disabled={
                  isPending ||
                  (period != null &&
                    period.status !== "draft" &&
                    period.status !== "calculated")
                }
                inputMode="decimal"
                min="0.5"
                max="31"
                step="0.5"
                type="number"
                value={standardDaysInput}
                onChange={(event) => setStandardDaysInput(event.target.value)}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleSaveStandardDays}
              disabled={
                isPending ||
                (period != null &&
                  period.status !== "draft" &&
                  period.status !== "calculated")
              }
            >
              {copy.actions.saveStandardDays}
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={handleCalculate} disabled={isPending}>
              {isPending ? (
                <Spinner />
              ) : (
                <IconCalculator data-icon="inline-start" />
              )}
              {copy.actions.calculate}
            </Button>
            <Button
              onClick={handleApprove}
              disabled={isPending || entries.length === 0}
              variant="outline"
            >
              <IconCircleCheck data-icon="inline-start" />
              {copy.actions.approve}
            </Button>
            <Button
              onClick={handlePay}
              disabled={isPending || entries.length === 0}
              variant="outline"
            >
              <IconCreditCard data-icon="inline-start" />
              {copy.actions.pay}
            </Button>
            <ExportPayrollCsvButton
              entries={entries}
              period={period}
              fallbackMonth={fallbackMonth}
              fallbackYear={fallbackYear}
            />
          </div>
        </div>
      </AppSection>

      {/* Summary */}
      {entries.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-7">
          <KpiCard label={copy.summary.gross} value={formatVND(totalGross)} />
          <KpiCard label={copy.summary.headcount} value={entries.length} />
          <KpiCard
            label={copy.summary.paidLeaveDays}
            value={totalPaidLeaveDays}
          />
          <KpiCard
            label={copy.summary.employeeInsurance}
            value={formatVND(totalInsEmp)}
          />
          <KpiCard
            label={copy.summary.employerInsurance}
            value={formatVND(totalInsEmployer)}
          />
          <KpiCard label={copy.summary.pit} value={formatVND(totalPit)} />
          <KpiCard
            label={copy.summary.net}
            value={formatVND(totalNet)}
            tone="primary"
          />
        </div>
      )}

      <AppSection
        title={copy.entriesTitle}
        description={copy.entriesDescription}
        headerHint={
          entries.length > 0 ? copy.table.total(entries.length) : undefined
        }
        contentFlush
      >
        <DataTable
          columns={columns}
          data={entries}
          getRowKey={(entry) => entry.id}
          emptyTitle={copy.table.empty}
          desktopFooterRows={footerRows}
          mobileFooter={
            entries.length > 0 ? (
              <Item variant="outline">
                <ItemContent>
                  <ItemTitle className="line-clamp-none text-sm font-semibold">
                    {copy.table.total(entries.length)}
                  </ItemTitle>
                  <ItemDescription className="line-clamp-none text-sm leading-6">
                    {copy.summary.gross}: {formatVND(totalGross)} ·{" "}
                    {copy.summary.pit}: {formatVND(totalPit)}
                  </ItemDescription>
                </ItemContent>
                <ItemActions>
                  <div className="text-right font-mono tabular-nums font-bold">
                    {formatVND(totalNet)}
                  </div>
                </ItemActions>
              </Item>
            ) : null
          }
          mobileCardRender={(entry) => (
            <Item variant="outline">
              <ItemContent>
                <ItemTitle className="line-clamp-none text-sm font-semibold">
                  {entry.employees?.profiles?.full_name ?? "—"}
                </ItemTitle>
                <ItemDescription className="line-clamp-none text-sm leading-6">
                  {entry.employees?.employee_code ?? "—"} ·{" "}
                  {Number(entry.payable_days)}/{Number(entry.standard_days)}{" "}
                  {copy.table.payableDays}
                </ItemDescription>
                <DescriptionList
                  className="mt-2 text-xs text-muted-foreground flex flex-col gap-2 [&>div]:flex [&>div]:flex-row [&>div]:justify-between [&>div]:items-center"
                  items={[
                    {
                      term: copy.table.workingDays,
                      description: (
                        <span className="font-mono tabular-nums">
                          {Number(entry.working_days)}
                        </span>
                      ),
                    },
                    {
                      term: copy.table.paidLeaveDays,
                      description: (
                        <span className="font-mono tabular-nums">
                          {Number(entry.paid_leave_days)}
                        </span>
                      ),
                    },
                    {
                      term: copy.table.unpaidLeaveDays,
                      description: (
                        <span className="font-mono tabular-nums">
                          {Number(entry.unpaid_leave_days)}
                        </span>
                      ),
                    },
                    {
                      term: copy.table.gross,
                      description: (
                        <span className="font-mono tabular-nums">
                          {formatVND(Number(entry.gross_total))}
                        </span>
                      ),
                    },
                    {
                      term: copy.table.insuranceBase,
                      description: (
                        <span className="font-mono tabular-nums">
                          {formatVND(Number(entry.insurance_base))}
                        </span>
                      ),
                    },
                    {
                      term: copy.table.employeeInsurance,
                      description: (
                        <span className="font-mono tabular-nums">
                          {formatVND(Number(entry.total_insurance_employee))}
                        </span>
                      ),
                    },
                    {
                      term: copy.table.pit,
                      description: (
                        <span className="font-mono tabular-nums">
                          {formatVND(Number(entry.pit_tax))}
                        </span>
                      ),
                    },
                  ]}
                />
              </ItemContent>
              <ItemActions>
                <div className="text-right font-mono tabular-nums font-bold">
                  {formatVND(Number(entry.net_salary))}
                </div>
              </ItemActions>
            </Item>
          )}
        />
      </AppSection>
    </div>
  );
}
