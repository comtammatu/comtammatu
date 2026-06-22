"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@comtammatu/ui/components/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { toast } from "@comtammatu/ui/components/sonner";
import { Plus as IconPlus } from "lucide-react";
import { createPayrollPeriod, fetchPayrollPeriods } from "../payroll-actions";
import type { PayrollPeriodRow } from "./_types";
import { ERRORS_VI } from "@comtammatu/shared/messages";
import { formatVNDate, getVNMonthYear } from "@comtammatu/shared/time";
import { messages } from "@lib/messages";
import { StatusBadge } from "@/components/status-badge";
import { AppToolbar } from "@/components/surface";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";

const copy = messages.hr.payroll.list;
const statusLabels = messages.hr.payroll.statusLabels;

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

  function renderStatus(period: PayrollPeriodRow) {
    return (
      <StatusBadge
        domain="payroll-period"
        value={period.status}
        label={statusLabels[period.status as keyof typeof statusLabels]}
      />
    );
  }

  function renderDetailLink(period: PayrollPeriodRow) {
    return (
      <Button variant="ghost" size="sm" asChild>
        <Link href={`/hr/payroll/${period.id}`}>{copy.details}</Link>
      </Button>
    );
  }

  const columns: DataTableColumn<PayrollPeriodRow>[] = [
    {
      key: "period",
      header: copy.period,
      render: (period) => (
        <span className="font-medium">
          {copy.periodName(period.period_month, period.period_year)}
        </span>
      ),
    },
    {
      key: "status",
      header: copy.status,
      render: renderStatus,
    },
    {
      key: "approved_at",
      header: copy.approvedAt,
      className: "font-mono tabular-nums text-sm text-muted-foreground",
      render: (period) =>
        period.approved_at ? formatVNDate(period.approved_at) : "—",
    },
    {
      key: "paid_at",
      header: copy.paidAt,
      className: "font-mono tabular-nums text-sm text-muted-foreground",
      render: (period) => (period.paid_at ? formatVNDate(period.paid_at) : "—"),
    },
    {
      key: "actions",
      header: "",
      className: "text-right",
      render: renderDetailLink,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <AppToolbar
        search={
          <p className="text-sm text-muted-foreground">
            {copy.count(periods.length)}
          </p>
        }
        actions={
          <Button onClick={handleCreate} disabled={isPending}>
            {isPending ? (
              <Spinner className="mr-2" />
            ) : (
              <IconPlus className="mr-2 size-4" />
            )}
            {copy.createCurrentMonth}
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={periods}
        getRowKey={(period) => period.id}
        emptyTitle={copy.empty}
        mobileCardRender={(period) => (
          <Item variant="outline">
            <ItemContent>
              <ItemTitle className="line-clamp-none text-sm font-semibold">
                {copy.periodName(period.period_month, period.period_year)}
              </ItemTitle>
              <ItemDescription className="line-clamp-none text-sm leading-6">
                {copy.approvedAt}:{" "}
                {period.approved_at ? formatVNDate(period.approved_at) : "—"} ·{" "}
                {copy.paidAt}:{" "}
                {period.paid_at ? formatVNDate(period.paid_at) : "—"}
              </ItemDescription>
              <div>{renderStatus(period)}</div>
            </ItemContent>
            <ItemActions>{renderDetailLink(period)}</ItemActions>
          </Item>
        )}
      />
    </div>
  );
}
