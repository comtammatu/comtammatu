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
import { Spinner } from "@comtammatu/ui/components/spinner";
import { toast } from "@comtammatu/ui/components/sonner";
import { Plus as IconPlus } from "lucide-react";
import { createPayrollPeriod, fetchPayrollPeriods } from "../payroll-actions";
import type { PayrollPeriodRow } from "./page";
import { ERRORS_VI } from "@comtammatu/shared/messages";
import { formatVNDate, getVNMonthYear } from "@comtammatu/shared/time";
import { messages } from "@lib/messages";

const copy = messages.hr.payroll.list;
const statusLabels = messages.hr.payroll.statusLabels;

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
    const now = getVNMonthYear();
    startTransition(async () => {
      const result = await createPayrollPeriod({
        month: now.month,
        year: now.year,
      });
      if (result.success) {
        toast.success(copy.createdToast);
        const reload = await fetchPayrollPeriods();
        if (reload.success) {
          setPeriods((reload.data ?? []) as PayrollPeriodRow[]);
        }
      } else {
        toast.error(result.error ?? ERRORS_VI.fallback);
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {copy.count(periods.length)}
        </p>
        <Button onClick={handleCreate} disabled={isPending}>
          {isPending ? (
            <Spinner className="mr-2" />
          ) : (
            <IconPlus className="mr-2 size-4" />
          )}
          {copy.createCurrentMonth}
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{copy.period}</TableHead>
              <TableHead>{copy.status}</TableHead>
              <TableHead>{copy.approvedAt}</TableHead>
              <TableHead>{copy.paidAt}</TableHead>
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
                  {copy.empty}
                </TableCell>
              </TableRow>
            )}
            {periods.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">
                  {copy.periodName(p.period_month, p.period_year)}
                </TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANTS[p.status] ?? "secondary"}>
                    {statusLabels[p.status as keyof typeof statusLabels] ??
                      p.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {p.approved_at ? formatVNDate(p.approved_at) : "—"}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {p.paid_at ? formatVNDate(p.paid_at) : "—"}
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={`/hr/payroll/${p.id}`}>{copy.details}</Link>
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
