"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@comtammatu/ui/components/button";
import { FormattedNumberInput } from "@/components/form";
import { Label } from "@comtammatu/ui/components/label";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { toast } from "@comtammatu/ui/components/sonner";
import {
  CircleCheck as IconCircleCheck,
  Clock3 as IconClock3,
  CreditCard as IconCreditCard,
  Plus as IconPlus,
} from "lucide-react";
import { createPayrollPeriod, fetchPayrollPeriods } from "../payroll-actions";
import type { PayrollPeriodRow } from "./_types";
import { ERRORS_VI } from "@comtammatu/shared/messages";
import { formatVNDate, getVNMonthYear } from "@comtammatu/shared/time";
import { messages } from "@lib/messages";
import { StatusBadge } from "@/components/status-badge";
import { KpiCard } from "@/components/kpi/kpi-card";
import { AppSection } from "@/components/surface";
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
  const [standardDays, setStandardDays] = useState("26");
  const [isPending, startTransition] = useTransition();
  const draftLikeCount = periods.filter(
    (period) => period.status === "draft" || period.status === "calculated",
  ).length;
  const approvedCount = periods.filter(
    (period) => period.status === "approved",
  ).length;
  const paidCount = periods.filter((period) => period.status === "paid").length;

  function handleCreate() {
    const now = getVNMonthYear();
    const parsedStandardDays = Number(standardDays);
    if (!Number.isFinite(parsedStandardDays) || parsedStandardDays <= 0) {
      toast.error(ERRORS_VI.validationFailed);
      return;
    }
    startTransition(async () => {
      const result = await createPayrollPeriod({
        month: now.month,
        year: now.year,
        standardDays: parsedStandardDays,
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
      key: "standard_days",
      header: copy.standardDaysShort,
      className: "text-right font-mono tabular-nums text-sm",
      render: (period) => Number(period.standard_days),
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
      <div className="grid gap-3 sm:grid-cols-3">
        <KpiCard
          label={copy.summaryOpen}
          value={draftLikeCount}
          hint={copy.summaryOpenHint}
          tone={draftLikeCount > 0 ? "warning" : "neutral"}
          icon={<IconClock3 aria-hidden />}
        />
        <KpiCard
          label={copy.summaryApproved}
          value={approvedCount}
          hint={copy.summaryApprovedHint}
          tone={approvedCount > 0 ? "primary" : "neutral"}
          icon={<IconCircleCheck aria-hidden />}
        />
        <KpiCard
          label={copy.summaryPaid}
          value={paidCount}
          hint={copy.count(periods.length)}
          tone={paidCount > 0 ? "success" : "neutral"}
          icon={<IconCreditCard aria-hidden />}
        />
      </div>

      <AppSection
        title={copy.createTitle}
        description={copy.createDescription}
        headerHint={copy.createCurrentMonth}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex max-w-xs flex-col gap-1.5">
            <Label htmlFor="standard-days-list" className="text-xs text-muted-foreground font-normal">
              {copy.standardDays}
            </Label>
            <FormattedNumberInput
              id="standard-days-list"
              aria-label={copy.standardDays}
              className="h-9 w-24 text-right font-mono tabular-nums"
              inputMode="decimal"
              maxFractionDigits={1}
              allowNegative={false}
              value={standardDays}
              onValueChange={setStandardDays}
            />
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button onClick={handleCreate} disabled={isPending}>
              {isPending ? (
                <Spinner className="mr-2" />
              ) : (
                <IconPlus data-icon="inline-start" />
              )}
              {copy.createCurrentMonth}
            </Button>
          </div>
        </div>
      </AppSection>

      <AppSection
        title={copy.periodsTitle}
        description={copy.periodsDescription}
        headerHint={copy.count(periods.length)}
        contentFlush
      >
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
                  {period.approved_at ? formatVNDate(period.approved_at) : "—"}{" "}
                  · {copy.standardDaysShort}: {Number(period.standard_days)} ·{" "}
                  {copy.paidAt}:{" "}
                  {period.paid_at ? formatVNDate(period.paid_at) : "—"}
                </ItemDescription>
                <div>{renderStatus(period)}</div>
              </ItemContent>
              <ItemActions>{renderDetailLink(period)}</ItemActions>
            </Item>
          )}
        />
      </AppSection>
    </div>
  );
}
