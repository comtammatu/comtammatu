"use client";

import { Printer as IconPrinter } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@comtammatu/ui/components/empty";
import { EmployeeDetailList, EmployeePanel } from "../components/employee-page";
import type { PayslipEntry } from "./page";
import { formatVND } from "@comtammatu/shared/format";
import { messages } from "@lib/messages";

const copy = messages.employee.payslip;

const fmt = formatVND;

const PERIOD_STATUS_LABELS: Record<string, string> = {
  paid: "Đã trả",
};

export function PayslipClient({ entries }: { entries: PayslipEntry[] }) {
  if (entries.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>{copy.noPayslipTitle}</EmptyTitle>
          <EmptyDescription>
            {copy.noPayslipDescription}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end print:hidden">
        <Button
          type="button"
          variant="outline"
          size="touch"
          onClick={() => window.print()}
        >
          <IconPrinter data-icon="inline-start" />
          {copy.print}
        </Button>
      </div>
      {entries.map((entry) => {
        const period = entry.payroll_periods;
        const status = period?.status ?? "paid";
        const statusLabel = PERIOD_STATUS_LABELS[status] ?? status;

        return (
          <EmployeePanel
            key={entry.id}
            title={
              period?.period_month && period?.period_year
                ? `Tháng ${period.period_month}/${period.period_year}`
                : "Kỳ lương"
            }
            description={`Ngày công ${Number(entry.working_days)}/${Number(entry.standard_days)}`}
            badge={{ children: statusLabel, variant: "success" }}
          >
            <EmployeeDetailList
              columns={1}
              rows={[
                {
                  label: "Thực lĩnh",
                  value: (
                    <span className="font-mono text-base font-semibold text-primary">
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
