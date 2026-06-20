"use client";

import { Printer as IconPrinter } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import {
  EmployeeActionBar,
  EmployeeDetailList,
  EmployeePanel,
} from "../components/employee-page";
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
                ? `Tháng ${period.period_month}/${period.period_year}`
                : "Kỳ lương"
            }
            description={`Ngày công ${Number(entry.working_days)}/${Number(entry.standard_days)}`}
            badge={{ children: statusMeta.label, variant: statusMeta.variant }}
          >
            <EmployeeDetailList
              columns={1}
              rows={[
                {
                  label: "Thực lĩnh",
                  value: (
                    <span className="font-mono tabular-nums text-right text-base font-semibold text-primary">
                      {fmt(Number(entry.net_salary))}
                    </span>
                  ),
                },
                { label: "Lương gộp", value: fmt(Number(entry.gross_total)) },
                {
                  label: "BH (NLĐ đóng)",
                  value: `-${fmt(Number(entry.total_insurance_employee))}`,
                  muted: true,
                },
                {
                  label: "Ngày công",
                  value: `${Number(entry.working_days)}/${Number(entry.standard_days)}`,
                },
              ]}
            />
          </EmployeePanel>
        );
      })}
    </div>
  );
}
