"use client";

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@comtammatu/ui/components/empty";
import { EmployeeDetailList, EmployeePanel } from "../components/employee-page";
import type { PayslipEntry } from "./page";

const fmt = (n: number) =>
  `${n.toLocaleString("vi-VN", { maximumFractionDigits: 0 })} ₫`;

const PERIOD_STATUS_LABELS: Record<string, string> = {
  paid: "Đã trả",
};

export function PayslipClient({ entries }: { entries: PayslipEntry[] }) {
  if (entries.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>Chưa có phiếu lương</EmptyTitle>
          <EmptyDescription>
            Các kỳ lương đã phát hành sẽ hiển thị tại đây.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="flex flex-col gap-3">
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
                  label: "Giảm trừ bản thân",
                  value: `-${fmt(Number(entry.personal_deduction))}`,
                  muted: true,
                },
                ...(Number(entry.dependent_count) > 0
                  ? [
                      {
                        label: `Giảm trừ người phụ thuộc (${entry.dependent_count})`,
                        value: `-${fmt(Number(entry.dependent_deduction))}`,
                        muted: true,
                      },
                    ]
                  : []),
                {
                  label: "Thu nhập tính thuế",
                  value: fmt(Number(entry.taxable_income)),
                },
                {
                  label: "Thuế TNCN",
                  value:
                    Number(entry.pit_tax) > 0
                      ? `-${fmt(Number(entry.pit_tax))}`
                      : "0",
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
