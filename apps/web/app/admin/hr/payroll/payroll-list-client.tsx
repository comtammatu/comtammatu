"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@comtammatu/ui/components/button";
import { Badge } from "@comtammatu/ui/components/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
import { toast } from "@comtammatu/ui/components/sonner";
import { Loader2, Plus } from "lucide-react";
import { createPayrollPeriod, fetchPayrollPeriods } from "../payroll-actions";
import type { PayrollPeriodRow } from "./page";

const STATUS_LABELS: Record<string, string> = {
  draft: "Nháp",
  calculated: "Đã tính",
  approved: "Đã duyệt",
  paid: "Đã trả",
};

const STATUS_VARIANTS: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  draft: "secondary",
  calculated: "outline",
  approved: "default",
  paid: "default",
};

export function PayrollListClient({
  initialPeriods,
}: {
  initialPeriods: PayrollPeriodRow[];
}) {
  const [periods, setPeriods] = useState(initialPeriods);
  const [isPending, startTransition] = useTransition();

  function handleCreate() {
    const now = new Date();
    startTransition(async () => {
      const result = await createPayrollPeriod({
        month: now.getMonth() + 1,
        year: now.getFullYear(),
      });
      if (result.success) {
        toast.success("Đã tạo kỳ lương");
        const reload = await fetchPayrollPeriods();
        if (reload.success) {
          setPeriods((reload.data ?? []) as PayrollPeriodRow[]);
        }
      } else {
        toast.error(result.error ?? "Lỗi");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {periods.length} kỳ lương
        </p>
        <Button onClick={handleCreate} disabled={isPending}>
          {isPending ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <Plus className="mr-2 size-4" />
          )}
          Tạo kỳ lương tháng này
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Kỳ</TableHead>
              <TableHead>Trạng thái</TableHead>
              <TableHead>Duyệt lúc</TableHead>
              <TableHead>Trả lúc</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {periods.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="py-8 text-center text-muted-foreground"
                >
                  Chưa có kỳ lương nào
                </TableCell>
              </TableRow>
            )}
            {periods.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">
                  Tháng {p.period_month}/{p.period_year}
                </TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANTS[p.status] ?? "secondary"}>
                    {STATUS_LABELS[p.status] ?? p.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {p.approved_at
                    ? new Date(p.approved_at).toLocaleDateString("vi-VN")
                    : "—"}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {p.paid_at
                    ? new Date(p.paid_at).toLocaleDateString("vi-VN")
                    : "—"}
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={`/admin/hr/payroll/${p.id}`}>Chi tiết</Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
