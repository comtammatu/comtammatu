"use client";

import { useState } from "react";
import {
  ChevronRight as IconChevronRight,
  Printer as IconPrinter,
} from "lucide-react";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@comtammatu/ui/components/sheet";
import { BranchOperatorDetailList } from "@lib/branch-operator/components/branch-operator-page";
import { EmployeeDetailList } from "../components/staff-runtime-page";
import type { PayslipEntry } from "./page";
import { formatDecimal, formatVND } from "@comtammatu/shared/format";
import { messages } from "@lib/messages";
import { AppEmptyState } from "@/components/surface";
import { getStatusBadgeMeta } from "@/components/status-badge";

const copy = messages.employee.payslip;
const fmt = formatVND;

type PayslipPlane = "employee" | "branch";

export function PayslipClient({
  entries,
  plane = "employee",
}: {
  entries: PayslipEntry[];
  plane?: PayslipPlane;
}) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selected = entries.find((entry) => entry.id === selectedId) ?? null;
  const DetailList =
    plane === "branch" ? BranchOperatorDetailList : EmployeeDetailList;

  if (entries.length === 0) {
    return (
      <AppEmptyState
        title={copy.noPayslipTitle}
        description={copy.noPayslipDescription}
      />
    );
  }

  return (
    <>
      <ItemGroup className="grid gap-2 lg:grid-cols-2">
        {entries.map((entry) => {
          const period = entry.payroll_periods;
          const statusMeta = getStatusBadgeMeta(
            "payroll-period",
            period?.status ?? "paid",
          );
          const periodLabel =
            period?.period_month && period?.period_year
              ? copy.periodLabel(period.period_month, period.period_year)
              : copy.periodFallback;

          return (
            <Item
              key={entry.id}
              asChild
              variant="outline"
              className="min-h-16 touch-manipulation"
            >
              <button type="button" onClick={() => setSelectedId(entry.id)}>
                <ItemContent className="min-w-0 gap-0.5 text-left">
                  <ItemTitle>{periodLabel}</ItemTitle>
                  <ItemDescription>
                    {copy.workingDaysSummary(
                      Number(entry.payable_days),
                      Number(entry.standard_days),
                    )}
                  </ItemDescription>
                </ItemContent>
                <ItemActions className="min-w-0 gap-2">
                  <div className="min-w-0 text-right">
                    <p className="truncate font-mono text-sm font-semibold tabular-nums text-primary">
                      {fmt(Number(entry.net_salary))}
                    </p>
                    <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
                  </div>
                  <IconChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </ItemActions>
              </button>
            </Item>
          );
        })}
      </ItemGroup>

      <Sheet
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
      >
        <SheetContent
          side="bottom"
          className="max-h-dvh-95 overflow-y-auto overscroll-contain bg-background p-0"
        >
          {selected ? (
            <>
              <SheetHeader>
                <SheetTitle>
                  {selected.payroll_periods?.period_month &&
                  selected.payroll_periods?.period_year
                    ? copy.periodLabel(
                        selected.payroll_periods.period_month,
                        selected.payroll_periods.period_year,
                      )
                    : copy.periodFallback}
                </SheetTitle>
              </SheetHeader>
              <div className="px-4 pb-4">
                <DetailList
                  columns={1}
                  rows={[
                    {
                      label: copy.netSalary,
                      value: (
                        <span className="font-mono tabular-nums text-base font-semibold text-primary">
                          {fmt(Number(selected.net_salary))}
                        </span>
                      ),
                    },
                    {
                      label: copy.grossTotal,
                      value: fmt(Number(selected.gross_total)),
                    },
                    {
                      label: copy.insuranceBase,
                      value: fmt(Number(selected.insurance_base)),
                      muted: true,
                    },
                    {
                      label: copy.insuranceEmployee,
                      value: `-${fmt(Number(selected.total_insurance_employee))}`,
                      muted: true,
                    },
                    {
                      label: copy.workingDays,
                      value: formatDecimal(Number(selected.working_days), 1),
                    },
                    {
                      label: copy.paidLeaveDays,
                      value: formatDecimal(Number(selected.paid_leave_days), 1),
                    },
                    {
                      label: copy.unpaidLeaveDays,
                      value: formatDecimal(Number(selected.unpaid_leave_days), 1),
                      muted: true,
                    },
                    {
                      label: copy.payableDays,
                      value: `${formatDecimal(Number(selected.payable_days), 1)}/${formatDecimal(Number(selected.standard_days), 1)}`,
                    },
                    {
                      label: copy.pit,
                      value: `-${fmt(Number(selected.pit_tax))}`,
                    },
                  ]}
                />
              </div>
              <SheetFooter className="workflow-safe-pb print:hidden">
                <Button
                  type="button"
                  variant="outline"
                  size="touch"
                  onClick={() => window.print()}
                >
                  <IconPrinter data-icon="inline-start" />
                  {copy.print}
                </Button>
              </SheetFooter>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  );
}
