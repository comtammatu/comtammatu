"use client";

import { useTransition } from "react";
import { Button } from "@comtammatu/ui/components/button";
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
} from "../../payroll-actions";
import type { PayrollEntryRow } from "./page";
import { useState } from "react";
import { ERRORS_VI, STAFF_VI } from "@comtammatu/shared/messages";
import { messages } from "@lib/messages";
import { KpiCard } from "@/components/kpi/kpi-card";
import {
  DataTable,
  type DataTableColumn,
  type DataTableFooterRow,
} from "@/components/data-table/data-table";

const fmt = (n: number) =>
  n.toLocaleString("vi-VN", { maximumFractionDigits: 0 });
const copy = messages.hr.payroll.detail;

interface PayrollDetailClientProps {
  periodId: number;
  initialEntries: PayrollEntryRow[];
}

export function PayrollDetailClient({
  periodId,
  initialEntries,
}: PayrollDetailClientProps) {
  const [entries, setEntries] = useState(initialEntries);
  const [isPending, startTransition] = useTransition();

  function reload() {
    startTransition(async () => {
      const result = await fetchPayrollEntries({ periodId });
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

  function handleApprove() {
    startTransition(async () => {
      const result = await approvePayroll({ periodId });
      if (result.success) {
        toast.success(copy.toast.approved);
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
      } else {
        toast.error(result.error ?? ERRORS_VI.fallback);
      }
    });
  }

  // Totals
  const totalGross = entries.reduce((s, e) => s + Number(e.gross_total), 0);
  const totalInsEmp = entries.reduce(
    (s, e) => s + Number(e.total_insurance_employee),
    0,
  );
  const totalPit = entries.reduce((s, e) => s + Number(e.pit_tax), 0);
  const totalNet = entries.reduce((s, e) => s + Number(e.net_salary), 0);
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
      className: "text-right font-mono text-sm",
      render: (entry) =>
        `${Number(entry.working_days)}/${Number(entry.standard_days)}`,
    },
    {
      key: "gross",
      header: copy.table.gross,
      className: "text-right font-mono",
      render: (entry) => fmt(Number(entry.gross_total)),
    },
    {
      key: "employee_insurance",
      header: copy.table.employeeInsurance,
      className: "text-right font-mono text-sm",
      render: (entry) => fmt(Number(entry.total_insurance_employee)),
    },
    {
      key: "deductions",
      header: copy.table.deductions,
      className: "text-right font-mono text-sm",
      render: (entry) =>
        fmt(
          Number(entry.personal_deduction) + Number(entry.dependent_deduction),
        ),
    },
    {
      key: "taxable_income",
      header: copy.table.taxableIncome,
      className: "text-right font-mono text-sm",
      render: (entry) => fmt(Number(entry.taxable_income)),
    },
    {
      key: "pit",
      header: copy.table.pit,
      className: "text-right font-mono text-sm",
      render: (entry) => fmt(Number(entry.pit_tax)),
    },
    {
      key: "net",
      header: copy.table.net,
      className: "text-right font-mono font-bold",
      render: (entry) => fmt(Number(entry.net_salary)),
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
                key: "gross",
                content: fmt(totalGross),
                className: "text-right font-mono",
              },
              {
                key: "employee_insurance",
                content: fmt(totalInsEmp),
                className: "text-right font-mono",
              },
              { key: "deductions", content: "" },
              { key: "taxable_income", content: "" },
              {
                key: "pit",
                content: fmt(totalPit),
                className: "text-right font-mono",
              },
              {
                key: "net",
                content: fmt(totalNet),
                className: "text-right font-mono",
              },
            ],
          },
        ]
      : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button onClick={handleCalculate} disabled={isPending}>
          {isPending ? (
            <Spinner className="mr-2" />
          ) : (
            <IconCalculator className="mr-2 size-4" />
          )}
          {copy.actions.calculate}
        </Button>
        <Button
          onClick={handleApprove}
          disabled={isPending || entries.length === 0}
          variant="outline"
        >
          <IconCircleCheck className="mr-2 size-4" />
          {copy.actions.approve}
        </Button>
        <Button
          onClick={handlePay}
          disabled={isPending || entries.length === 0}
          variant="outline"
        >
          <IconCreditCard className="mr-2 size-4" />
          {copy.actions.pay}
        </Button>
      </div>

      {/* Summary */}
      {entries.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
          <KpiCard label={copy.summary.gross} value={fmt(totalGross)} />
          <KpiCard label={copy.summary.headcount} value={entries.length} />
          <KpiCard label={copy.summary.pit} value={fmt(totalPit)} />
          <KpiCard
            label={copy.summary.net}
            value={fmt(totalNet)}
            tone="primary"
          />
        </div>
      )}

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
                  {copy.summary.gross}: {fmt(totalGross)} · {copy.summary.pit}:{" "}
                  {fmt(totalPit)}
                </ItemDescription>
              </ItemContent>
              <ItemActions>
                <div className="text-right font-mono font-bold">
                  {fmt(totalNet)}
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
                {Number(entry.working_days)}/{Number(entry.standard_days)}{" "}
                {copy.table.workingDays}
              </ItemDescription>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                <span>{copy.table.gross}</span>
                <span className="text-right font-mono">
                  {fmt(Number(entry.gross_total))}
                </span>
                <span>{copy.table.pit}</span>
                <span className="text-right font-mono">
                  {fmt(Number(entry.pit_tax))}
                </span>
              </div>
            </ItemContent>
            <ItemActions>
              <div className="text-right font-mono font-bold">
                {fmt(Number(entry.net_salary))}
              </div>
            </ItemActions>
          </Item>
        )}
      />
    </div>
  );
}
