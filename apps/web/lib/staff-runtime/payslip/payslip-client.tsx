"use client";

import { Printer as IconPrinter } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import {
  EmployeeActionBar,
  EmployeeDetailList,
  EmployeePanel,
} from "../components/staff-runtime-page";
import type { PayslipEntry } from "./page";
import { formatVND } from "@comtammatu/shared/format";
import { messages } from "@lib/messages";
import { AppEmptyState } from "@/components/surface";
import { getStatusBadgeMeta } from "@/components/status-badge";

const copy = messages.employee.payslip;

const fmt = formatVND;

export function PayslipClient({ entries }: { entries: PayslipEntry[] }) {
  if (entries.length === 0) {
    return (
      <AppEmptyState
        title={copy.noPayslipTitle}
        description={copy.noPayslipDescription}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <EmployeeActionBar align="end" className="print:hidden">
        <Button
          type="button"
          variant="outline"
          size="touch"
          onClick={() => window.print()}
        >
          <IconPrinter data-icon="inline-start" />
          {copy.print}
        </Button>
      </EmployeeActionBar>
      {entries.map((entry) => {
        const period = entry.payroll_periods;
        const status = period?.status ?? "paid";
        const statusMeta = getStatusBadgeMeta("payroll-period", status);

        return (
          <EmployeePanel
            key={entry.id}
            title={
              period?.period_month && period?.period_year
                ? copy.periodLabel(period.period_month, period.period_year)
                : copy.periodFallback
            }
            description={copy.workingDaysSummary(
              Number(entry.payable_days),
              Number(entry.standard_days),
            )}
            badge={{ children: statusMeta.label, variant: statusMeta.variant }}
          >
            <EmployeeDetailList
              columns={1}
              rows={[
                {
                  label: copy.netSalary,
                  value: (
                    <span className="font-mono tabular-nums text-base font-semibold text-primary">
                      {fmt(Number(entry.net_salary))}
                    </span>
                  ),
                },
                {
                  label: copy.grossTotal,
                  value: (
                    <span className="font-mono tabular-nums">
                      {fmt(Number(entry.gross_total))}
                    </span>
                  ),
                },
                {
                  label: copy.insuranceBase,
                  value: (
                    <span className="font-mono tabular-nums">
                      {fmt(Number(entry.insurance_base))}
                    </span>
                  ),
                  muted: true,
                },
                {
                  label: copy.insuranceEmployee,
                  value: (
                    <span className="font-mono tabular-nums">
                      {`-${fmt(Number(entry.total_insurance_employee))}`}
                    </span>
                  ),
                  muted: true,
                },
                {
                  label: copy.workingDays,
                  value: (
                    <span className="font-mono tabular-nums">
                      {Number(entry.working_days)}
                    </span>
                  ),
                },
                {
                  label: copy.paidLeaveDays,
                  value: (
                    <span className="font-mono tabular-nums">
                      {Number(entry.paid_leave_days)}
                    </span>
                  ),
                },
                {
                  label: copy.unpaidLeaveDays,
                  value: (
                    <span className="font-mono tabular-nums">
                      {Number(entry.unpaid_leave_days)}
                    </span>
                  ),
                  muted: true,
                },
                {
                  label: copy.payableDays,
                  value: (
                    <span className="font-mono tabular-nums">
                      {`${Number(entry.payable_days)}/${Number(entry.standard_days)}`}
                    </span>
                  ),
                },
                {
                  label: copy.pit,
                  value: (
                    <span className="font-mono tabular-nums">
                      {`-${fmt(Number(entry.pit_tax))}`}
                    </span>
                  ),
                },
              ]}
            />
          </EmployeePanel>
        );
      })}
    </div>
  );
}
