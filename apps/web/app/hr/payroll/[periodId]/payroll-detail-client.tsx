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
import { toast } from "@comtammatu/ui/components/sonner";
import { Calculator, CheckCircle, CreditCard, Loader2 } from "lucide-react";
import {
  calculatePayroll,
  approvePayroll,
  markPayrollPaid,
  fetchPayrollEntries,
} from "../../payroll-actions";
import type { PayrollEntryRow } from "./page";
import { useState } from "react";

const fmt = (n: number) =>
  n.toLocaleString("vi-VN", { maximumFractionDigits: 0 });

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
          `Đã tính lương cho ${(result.meta as { employeeCount: number })?.employeeCount ?? 0} nhân viên`,
        );
        reload();
      } else {
        toast.error(result.error ?? "Lỗi");
      }
    });
  }

  function handleApprove() {
    startTransition(async () => {
      const result = await approvePayroll({ periodId });
      if (result.success) {
        toast.success("Đã duyệt bảng lương");
      } else {
        toast.error(result.error ?? "Lỗi");
      }
    });
  }

  function handlePay() {
    startTransition(async () => {
      const result = await markPayrollPaid({ periodId });
      if (result.success) {
        toast.success("Đã đánh dấu thanh toán");
      } else {
        toast.error(result.error ?? "Lỗi");
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
  const totalInsEmployer = entries.reduce(
    (s, e) => s + Number(e.total_insurance_employer),
    0,
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button onClick={handleCalculate} disabled={isPending}>
          {isPending ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <Calculator className="mr-2 size-4" />
          )}
          Tính lương
        </Button>
        <Button
          onClick={handleApprove}
          disabled={isPending || entries.length === 0}
          variant="outline"
        >
          <CheckCircle className="mr-2 size-4" />
          Duyệt
        </Button>
        <Button
          onClick={handlePay}
          disabled={isPending || entries.length === 0}
          variant="outline"
        >
          <CreditCard className="mr-2 size-4" />
          Thanh toán
        </Button>
      </div>

      {/* Summary */}
      {entries.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-5">
          <SummaryCard label="Tổng Gross" value={totalGross} />
          <SummaryCard label="BH NLĐ" value={totalInsEmp} />
          <SummaryCard label="Thuế TNCN" value={totalPit} />
          <SummaryCard label="Thực lĩnh" value={totalNet} highlight />
          <SummaryCard label="BH Cty đóng" value={totalInsEmployer} />
        </div>
      )}

      {/* Entry table */}
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nhân viên</TableHead>
              <TableHead className="text-right">Ngày công</TableHead>
              <TableHead className="text-right">Lương Gross</TableHead>
              <TableHead className="text-right">BH NLĐ</TableHead>
              <TableHead className="text-right">Giảm trừ</TableHead>
              <TableHead className="text-right">TNTT</TableHead>
              <TableHead className="text-right">Thuế TNCN</TableHead>
              <TableHead className="text-right font-bold">Thực lĩnh</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="py-8 text-center text-muted-foreground"
                >
                  Chưa có dữ liệu. Nhấn "Tính lương" để bắt đầu.
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
                <TableCell>TỔNG ({entries.length} NV)</TableCell>
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

function SummaryCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border p-3 ${highlight ? "border-primary bg-primary/5" : ""}`}
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={`mt-1 font-mono text-lg font-bold ${highlight ? "text-primary" : ""}`}
      >
        {fmt(value)}
      </p>
    </div>
  );
}
