"use client";

import { Printer as IconPrinter } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import {
  BranchOperatorActionBar,
  BranchOperatorDetailList,
  BranchOperatorPanel,
} from "@lib/branch-operator/components/branch-operator-page";
import {
  EmployeeActionBar,
  EmployeeDetailList,
  EmployeePanel,
} from "../components/staff-runtime-page";
import type { PayslipEntry } from "./page";
import { formatDecimal, formatVND } from "@comtammatu/shared/format";
import { messages } from "@lib/messages";
import { AppEmptyState } from "@/components/surface";
import { getStatusBadgeMeta } from "@/components/status-badge";

const copy = messages.employee.payslip;

const fmt = formatVND;

type PayslipPlane = "employee" | "branch";

export function PayslipClient({
  entries,
  plane = "employee",
}: {
  entries: PayslipEntry[];
  plane?: PayslipPlane;
}) {
  const ActionBar =
    plane === "branch" ? BranchOperatorActionBar : EmployeeActionBar;
  const Panel = plane === "branch" ? BranchOperatorPanel : EmployeePanel;
  const DetailList =
    plane === "branch" ? BranchOperatorDetailList : EmployeeDetailList;

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
      <ActionBar align="end" className="print:hidden">
        <Button
          type="button"
          variant="outline"
          size="touch"
          onClick={() => window.print()}
        >
          <IconPrinter data-icon="inline-start" />
          {copy.print}
        </Button>
      </ActionBar>
      {entries.map((entry) => {
        const period = entry.payroll_periods;
        const status = period?.status ?? "paid";
        const statusMeta = getStatusBadgeMeta("payroll-period", status);

        return (
          <Panel
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
            <DetailList
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
                      {formatDecimal(Number(entry.working_days), 1)}
                    </span>
                  ),
                },
                {
                  label: copy.paidLeaveDays,
                  value: (
                    <span className="font-mono tabular-nums">
                      {formatDecimal(Number(entry.paid_leave_days), 1)}
                    </span>
                  ),
                },
                {
                  label: copy.unpaidLeaveDays,
                  value: (
                    <span className="font-mono tabular-nums">
                      {formatDecimal(Number(entry.unpaid_leave_days), 1)}
                    </span>
                  ),
                  muted: true,
                },
                {
                  label: copy.payableDays,
                  value: (
                    <span className="font-mono tabular-nums">
                      {formatDecimal(Number(entry.payable_days), 1)}/
                      {formatDecimal(Number(entry.standard_days), 1)}
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
          </Panel>
        );
      })}
    </div>
  );
}
