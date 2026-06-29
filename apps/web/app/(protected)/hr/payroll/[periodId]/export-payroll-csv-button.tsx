"use client";

import { Download } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { messages } from "@lib/messages";
import { buildPayrollCsv } from "./payroll-csv";
import type { PayrollEntryRow, PayrollPeriodDetail } from "./_types";

const copy = messages.hr.payroll;
const csvCopy = copy.detail.csv;

interface ExportPayrollCsvButtonProps {
  entries: readonly PayrollEntryRow[];
  period: PayrollPeriodDetail | null;
  fallbackMonth: number;
  fallbackYear: number;
}

export function ExportPayrollCsvButton({
  entries,
  period,
  fallbackMonth,
  fallbackYear,
}: ExportPayrollCsvButtonProps) {
  const month = period?.period_month ?? fallbackMonth;
  const year = period?.period_year ?? fallbackYear;

  function handleDownload() {
    const csv = buildPayrollCsv(entries, {
      columns: csvCopy.columns,
      periodLabel: copy.list.periodName(month, year),
    });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = csvCopy.filename(month, year);
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleDownload}
      disabled={entries.length === 0}
    >
      <Download data-icon="inline-start" aria-hidden />
      {csvCopy.export}
    </Button>
  );
}
