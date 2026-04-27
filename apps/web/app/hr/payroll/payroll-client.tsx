/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@comtammatu/ui/components/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
import { Badge } from "@comtammatu/ui/components/badge";
import {
  createPayrollPeriod,
  calculatePayroll,
  approvePayroll,
} from "../payroll-actions";
import type { PayrollPeriodRow } from "./page";
import { ERRORS_VI } from "@comtammatu/shared/messages";

interface Props {
  periods: PayrollPeriodRow[];
}

const STATUS_LABEL: Record<string, string> = {
  draft: "Nháp",
  calculated: "Đã tính",
  approved: "Đã duyệt",
};

const STATUS_VARIANT: Record<
  string,
  "default" | "secondary" | "outline" | "destructive"
> = {
  draft: "outline",
  calculated: "secondary",
  approved: "default",
};

function formatVND(amount: number | null): string {
  if (amount === null) return "—";
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatMonth(periodMonth: string): string {
  const [year, mon] = periodMonth.split("-");
  return `Tháng ${mon}/${year}`;
}

export function PayrollClient({ periods: initialPeriods }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [activeId, setActiveId] = useState<number | null>(null);

  // Generate current month YYYY-MM for default
  const currentMonth = new Date().toISOString().slice(0, 7);

  function handleCreate() {
    setError(null);
    setActiveId(null);
    startTransition(async () => {
      const result = await createPayrollPeriod({ periodMonth: currentMonth });
      if (!result.success) {
        setError(result.error ?? ERRORS_VI.unknown);
        return;
      }
      router.refresh();
    });
  }

  function handleCalculate(periodId: number) {
    setError(null);
    setActiveId(periodId);
    startTransition(async () => {
      const result = await calculatePayroll({ periodId });
      if (!result.success) {
        setError(result.error ?? ERRORS_VI.unknown);
        setActiveId(null);
        return;
      }
      setActiveId(null);
      router.refresh();
    });
  }

  function handleApprove(periodId: number) {
    setError(null);
    setActiveId(periodId);
    startTransition(async () => {
      const result = await approvePayroll({ periodId });
      if (!result.success) {
        setError(result.error ?? ERRORS_VI.unknown);
        setActiveId(null);
        return;
      }
      setActiveId(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {initialPeriods.length} kỳ lương
        </p>
        <Button onClick={handleCreate} disabled={isPending}>
          Tạo kỳ lương {formatMonth(currentMonth)}
        </Button>
      </div>

      {error && (
        <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Kỳ lương</TableHead>
              <TableHead>Trạng thái</TableHead>
              <TableHead className="text-right">Tổng lương gộp</TableHead>
              <TableHead className="text-right">Tổng BHXH/YT/TN</TableHead>
              <TableHead className="text-right">Tổng thuế TNCN</TableHead>
              <TableHead className="text-right">Tổng lương thực lĩnh</TableHead>
              <TableHead className="text-right">Thao tác</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {initialPeriods.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="py-8 text-center text-muted-foreground"
                >
                  Chưa có kỳ lương nào
                </TableCell>
              </TableRow>
            )}
            {initialPeriods.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">
                  <Link
                    href={`/hr/payroll/${p.id}`}
                    className="underline-offset-4 hover:underline"
                  >
                    {formatMonth(p.period_month)}
                  </Link>
                </TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[p.status] ?? "outline"}>
                    {STATUS_LABEL[p.status] ?? p.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  {formatVND(p.total_gross)}
                </TableCell>
                <TableCell className="text-right">
                  {formatVND(p.total_si)}
                </TableCell>
                <TableCell className="text-right">
                  {formatVND(p.total_pit)}
                </TableCell>
                <TableCell className="text-right">
                  {formatVND(p.total_net)}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    {p.status === "draft" && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isPending && activeId === p.id}
                        onClick={() => handleCalculate(p.id)}
                      >
                        {isPending && activeId === p.id
                          ? "Đang tính..."
                          : "Tính lương"}
                      </Button>
                    )}
                    {p.status === "calculated" && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isPending && activeId === p.id}
                          onClick={() => handleCalculate(p.id)}
                        >
                          {isPending && activeId === p.id
                            ? "Đang tính..."
                            : "Tính lại"}
                        </Button>
                        <Button
                          size="sm"
                          disabled={isPending && activeId === p.id}
                          onClick={() => handleApprove(p.id)}
                        >
                          {isPending && activeId === p.id
                            ? "Đang duyệt..."
                            : "Duyệt"}
                        </Button>
                      </>
                    )}
                    {p.status === "approved" && (
                      <Link href={`/hr/payroll/${p.id}`}>
                        <Button size="sm" variant="outline">
                          Xem chi tiết
                        </Button>
                      </Link>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
