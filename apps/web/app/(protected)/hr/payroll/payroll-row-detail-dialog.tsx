"use client";

import { formatVND } from "@comtammatu/shared/format";
import { AppDialog } from "@/components/form";
import { DescriptionList } from "@/components/surface";
import { messages } from "@lib/messages";
import type { PayrollPreviewEntry } from "../payroll-actions";

const detailCopy = messages.hr.payroll.live.detail;

export function PayrollRowDetailDialog({
  entry,
  open,
  onOpenChange,
}: {
  entry: PayrollPreviewEntry | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!entry) return null;

  const baseFormula =
    entry.wageUnit === "daily"
      ? `${formatVND(entry.dailyRate)} × ${entry.payableDays} ngày`
      : `${formatVND(entry.monthlySalary)} × ${entry.payableDays}/${entry.standardDays}`;

  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Chi tiết lương · ${entry.employeeName}`}
      description={[
        entry.employeeCode,
        entry.branchName,
        messages.hr.wageUnit.label(entry.wageUnit),
      ]
        .filter(Boolean)
        .join(" · ")}
      contentClassName="sm:max-w-lg"
    >
      <DescriptionList
        items={[
          {
            term: detailCopy.wageUnit,
            description: messages.hr.wageUnit.label(entry.wageUnit),
          },
          {
            term: detailCopy.payableDays,
            description: String(entry.payableDays),
          },
          {
            term: detailCopy.baseSalary,
            description: `${formatVND(entry.proratedSalary)} (${baseFormula})`,
          },
          {
            term: detailCopy.bhxhEmployee,
            description: formatVND(entry.bhxhEmployee),
          },
          {
            term: detailCopy.bhytEmployee,
            description: formatVND(entry.bhytEmployee),
          },
          {
            term: detailCopy.bhtnEmployee,
            description: formatVND(entry.bhtnEmployee),
          },
          {
            term: detailCopy.insuranceEmployer,
            description: formatVND(entry.totalInsuranceEmployer),
          },
          {
            term: detailCopy.taxableIncome,
            description: formatVND(entry.taxableIncome),
          },
          {
            term: detailCopy.pitTax,
            description: formatVND(entry.pitTax),
          },
          {
            term: detailCopy.netSalary,
            description: formatVND(
              entry.finalized?.netSalary ?? entry.expectedNet,
            ),
          },
        ]}
      />
    </AppDialog>
  );
}
