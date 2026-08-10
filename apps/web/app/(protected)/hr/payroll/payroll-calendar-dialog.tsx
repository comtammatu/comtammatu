"use client";

import { useEffect, useRef } from "react";
import { formatDecimal, formatVND } from "@comtammatu/shared/format";
import { formatVNBusinessDate, formatVNTime } from "@comtammatu/shared/time";
import { Badge } from "@comtammatu/ui/components/badge";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { AppDialog } from "@/components/form/form-dialog";
import { KpiRow } from "@/components/surface";
import { KpiCard } from "@/components/kpi/kpi-card";
import { messages } from "@lib/messages";
import { AttendanceCalendar } from "../attendance-calendar";
import type {
  PayrollPreview,
  PayrollPreviewEntry,
} from "../payroll-actions";

const payrollCopy = messages.hr.payroll;
const copy = payrollCopy.live;
const attendanceCopy = messages.employee.hrAttendance;
const scheduleCopy = messages.employee.schedule;

function monthValue(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function canCalculate(entry: PayrollPreviewEntry): boolean {
  return entry.finalized != null || entry.salarySource !== "missing";
}

function decimalCell(value: number): string {
  return formatDecimal(value, 1);
}

function moneyCell(entry: PayrollPreviewEntry, value: number): string {
  return canCalculate(entry) ? formatVND(value) : "—";
}

function workingDaysValue(entry: PayrollPreviewEntry): number {
  return entry.finalized?.workingDays ?? entry.workingDays;
}

function estimatedCalendarSalary(entry: PayrollPreviewEntry): number {
  if (entry.monthlySalary <= 0 || entry.standardDays <= 0) return 0;
  return (workingDaysValue(entry) * entry.monthlySalary) / entry.standardDays;
}

export type PayrollCalendarDayEntry = {
  employeeId: number;
  employee: PayrollPreviewEntry | undefined;
  records: PayrollPreview["calendar"]["records"];
  leave: PayrollPreview["calendar"]["leaves"][number] | undefined;
};

interface PayrollCalendarDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preview: PayrollPreview;
  calendarEntry: PayrollPreviewEntry | null;
  calendarRecords: PayrollPreview["calendar"]["records"];
  calendarLeaves: PayrollPreview["calendar"]["leaves"];
  selectedCalendarDay: string | null;
  onSelectCalendarDay: (date: string) => void;
  calendarDayEntries: PayrollCalendarDayEntry[];
}

export function PayrollCalendarDialog({
  open,
  onOpenChange,
  preview,
  calendarEntry,
  calendarRecords,
  calendarLeaves,
  selectedCalendarDay,
  onSelectCalendarDay,
  calendarDayEntries,
}: PayrollCalendarDialogProps) {
  const calendarDetailRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (selectedCalendarDay) {
      calendarDetailRef.current?.scrollIntoView({ block: "nearest" });
    }
  }, [selectedCalendarDay]);

  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      title={
        calendarEntry
          ? copy.calendarEmployeeTitle(calendarEntry.employeeName)
          : copy.calendarAllTitle
      }
      description={copy.calendarDescription}
      contentClassName="sm:max-w-4xl"
      bodyClassName="min-w-0"
    >
      {calendarEntry ? (
        <KpiRow density="compact">
          <KpiCard
            density="compact"
            label={copy.workdays}
            value={decimalCell(workingDaysValue(calendarEntry))}
          />
          <KpiCard
            density="compact"
            label={copy.estimatedSalary}
            value={moneyCell(
              calendarEntry,
              estimatedCalendarSalary(calendarEntry),
            )}
          />
          <KpiCard
            density="compact"
            label={copy.monthlyLeave}
            value={`${decimalCell(calendarEntry.monthlyLeaveBalance.remainingDays)}/${decimalCell(calendarEntry.monthlyLeaveBalance.entitlementDays)}`}
          />
          <KpiCard
            density="compact"
            label={copy.annualLeave}
            value={
              calendarEntry.annualLeaveBalance
                ? `${decimalCell(calendarEntry.annualLeaveBalance.remainingDays)}/${decimalCell(calendarEntry.annualLeaveBalance.entitlementDays)}`
                : "—"
            }
          />
        </KpiRow>
      ) : null}
      <AttendanceCalendar
        month={monthValue(preview.year, preview.month)}
        records={calendarRecords}
        leaves={calendarLeaves}
        selectedDate={selectedCalendarDay}
        onSelectDate={onSelectCalendarDay}
      />
      {selectedCalendarDay ? (
        <section
          ref={calendarDetailRef}
          aria-live="polite"
          className="flex scroll-mt-4 flex-col gap-2"
        >
          <h3 className="font-heading text-sm font-semibold">
            {attendanceCopy.calendarDetailTitle(
              formatVNBusinessDate(selectedCalendarDay),
            )}
          </h3>
          {calendarDayEntries.length > 0 ? (
            <div className="flex flex-col gap-2">
              {calendarDayEntries.map((dayEntry) => (
                <Item key={dayEntry.employeeId} variant="outline">
                  <ItemContent>
                    <ItemTitle>
                      {dayEntry.employee?.employeeName ?? "—"}
                    </ItemTitle>
                    {dayEntry.employee?.branchName ? (
                      <ItemDescription>
                        {dayEntry.employee.branchName}
                      </ItemDescription>
                    ) : null}
                    <div className="flex flex-col gap-1 text-xs/relaxed text-muted-foreground">
                      {dayEntry.records.map((record) => (
                        <p key={record.id}>
                          <span className="font-medium text-foreground">
                            {record.shifts?.name ?? scheduleCopy.rowShift}
                          </span>
                          {` · ${attendanceCopy.checkIn} ${formatVNTime(record.check_in)} · ${attendanceCopy.checkOut} ${formatVNTime(record.check_out)}`}
                        </p>
                      ))}
                      {dayEntry.leave ? (
                        <p>
                          {dayEntry.leave.status === "approved"
                            ? scheduleCopy.leaveApproved
                            : scheduleCopy.leavePending}
                        </p>
                      ) : null}
                    </div>
                  </ItemContent>
                  {dayEntry.records.length > 0 ? (
                    <ItemActions>
                      <Badge
                        variant={
                          dayEntry.records.every((record) => record.check_out)
                            ? "success"
                            : "warning"
                        }
                      >
                        {dayEntry.records.every((record) => record.check_out)
                          ? attendanceCopy.checkedOut
                          : attendanceCopy.inShift}
                      </Badge>
                    </ItemActions>
                  ) : null}
                </Item>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {attendanceCopy.detailEmptyDescription}
            </p>
          )}
        </section>
      ) : null}
    </AppDialog>
  );
}
