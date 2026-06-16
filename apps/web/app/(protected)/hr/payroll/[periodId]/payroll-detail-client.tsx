"use client";

import { useTransition } from "react";
import { Button } from "@comtammatu/ui/components/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
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

      {/* Entry table */}
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{STAFF_VI.long}</TableHead>
              <TableHead className="text-right">
                {copy.table.workingDays}
              </TableHead>
              <TableHead className="text-right">{copy.table.gross}</TableHead>
              <TableHead className="text-right">
                {copy.table.employeeInsurance}
              </TableHead>
              <TableHead className="text-right">
                {copy.table.deductions}
              </TableHead>
              <TableHead className="text-right">
                {copy.table.taxableIncome}
              </TableHead>
              <TableHead className="text-right">{copy.table.pit}</TableHead>
              <TableHead className="text-right font-bold">
                {copy.table.net}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="py-8 text-center text-muted-foreground"
                >
                  {copy.table.empty}
                </TableCell>
              </TableRow>
            )}
            {entries.map((e) => (
              <TableRow key={e.id}>
                <TableCell>
                  <div>
                    <p className="font-medium">
                      {e.employees?.profiles?.full_name ?? "—"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {e.employees?.employee_code}
                    </p>
                  </div>
                </TableCell>
                <TableCell className="text-right font-mono text-sm">
                  {Number(e.working_days)}/{Number(e.standard_days)}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {fmt(Number(e.gross_total))}
                </TableCell>
                <TableCell className="text-right font-mono text-sm">
                  {fmt(Number(e.total_insurance_employee))}
                </TableCell>
                <TableCell className="text-right font-mono text-sm">
                  {fmt(
                    Number(e.personal_deduction) +
                      Number(e.dependent_deduction),
                  )}
                </TableCell>
                <TableCell className="text-right font-mono text-sm">
                  {fmt(Number(e.taxable_income))}
                </TableCell>
                <TableCell className="text-right font-mono text-sm">
                  {fmt(Number(e.pit_tax))}
                </TableCell>
                <TableCell className="text-right font-mono font-bold">
                  {fmt(Number(e.net_salary))}
                </TableCell>
              </TableRow>
            ))}
            {entries.length > 0 && (
              <TableRow className="bg-muted/50 font-bold">
                <TableCell>{copy.table.total(entries.length)}</TableCell>
                <TableCell />
                <TableCell className="text-right font-mono">
                  {fmt(totalGross)}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {fmt(totalInsEmp)}
                </TableCell>
                <TableCell />
                <TableCell />
                <TableCell className="text-right font-mono">
                  {fmt(totalPit)}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {fmt(totalNet)}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
