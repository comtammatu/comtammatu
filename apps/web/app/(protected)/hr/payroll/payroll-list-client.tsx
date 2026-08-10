"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { formatDecimal, formatVND } from "@comtammatu/shared/format";
import type { ActionResult } from "@comtammatu/shared/types";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { confirm } from "@/components/confirm-dialog";
import { Input } from "@comtammatu/ui/components/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@comtammatu/ui/components/input-group";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { toast } from "@comtammatu/ui/components/sonner";
import {
  CalendarDays as IconCalendarDays,
  Pencil as IconPencil,
  Search as IconSearch,
  Trash2 as IconTrash,
} from "lucide-react";
import {
  FormattedNumberInput,
  FormDialog,
  MoneyVndField,
  SelectField,
  TextareaField,
} from "@/components/form";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import {
  AppListFrame,
  AppSection,
  AppToolbar,
} from "@/components/surface";
import { useFormControlSize } from "@/components/form/control-size";
import { messages } from "@lib/messages";
import { matchesSearch } from "@lib/search";
import { PayrollCalendarDialog } from "./payroll-calendar-dialog";
import {
  removePayrollAdjustment,
  savePayrollAdjustment,
  snapshotPayrollPreview,
  type PayrollAdjustment,
  type PayrollAdjustmentKind,
  type PayrollPreflightBlocker,
  type PayrollPreview,
  type PayrollPreviewEntry,
} from "../payroll-actions";
import {
  type HrBranchScope,
  withHrBranchScope,
} from "@/lib/hr-scope";

const payrollCopy = messages.hr.payroll;
const copy = payrollCopy.live;
const ALL_SALARY_STATUSES = "all";
const CALCULABLE_SALARY_STATUS = "calculable";
const MISSING_SALARY_STATUS = "missing";

type SalaryStatusFilter =
  | typeof ALL_SALARY_STATUSES
  | typeof CALCULABLE_SALARY_STATUS
  | typeof MISSING_SALARY_STATUS;

const adjustmentSchema = z.object({
  kind: z.enum([
    "bonus",
    "taxable_allowance",
    "tax_exempt_allowance",
    "advance",
    "deduction",
  ]),
  amount: z
    .string()
    .min(1, { error: copy.adjustmentFields.amountRequired })
    .refine((value) => Number(value) > 0, {
      error: copy.adjustmentFields.amountPositive,
    }),
  note: z.string().trim().min(5, copy.adjustmentFields.noteRequired).max(500),
});

type AdjustmentFormValues = z.infer<typeof adjustmentSchema>;

interface Props {
  preview: PayrollPreview;
  query: string;
  selectedBranchId: number | null;
  officeOnly: boolean;
  selectedSalaryStatus: string | undefined;
  calendarTarget: "all" | number | null;
  selectedCalendarDay: string | null;
}

function monthValue(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function adjustmentLabel(adjustment: PayrollAdjustment): string {
  return copy.adjustmentKinds[adjustment.kind];
}

function workSummary(entry: PayrollPreviewEntry): string {
  const workdays = entry.finalized?.workingDays ?? entry.workingDays;
  return copy.mobile.work(workdays, entry.workHours, totalLeaveDays(entry));
}

function workingDaysValue(entry: PayrollPreviewEntry): number {
  return entry.finalized?.workingDays ?? entry.workingDays;
}

function totalLeaveDays(entry: PayrollPreviewEntry): number {
  const finalized = entry.finalized;
  return (
    (finalized?.paidLeaveDays ?? entry.paidLeaveDays) +
    (finalized?.unpaidLeaveDays ?? entry.unpaidLeaveDays)
  );
}

function netValue(entry: PayrollPreviewEntry): number {
  return entry.finalized?.netSalary ?? entry.expectedNet;
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

function normalizeSalaryStatus(value: string | undefined): SalaryStatusFilter {
  return value === CALCULABLE_SALARY_STATUS || value === MISSING_SALARY_STATUS
    ? value
    : ALL_SALARY_STATUSES;
}

function preflightBlockerContent(blocker: PayrollPreflightBlocker): {
  title: string;
  description: string;
  action: string;
} {
  const branchName = blocker.branchName ?? copy.preflight.allBranches;
  switch (blocker.kind) {
    case "missing_salary":
      return {
        title: copy.preflight.missingSalaryTitle,
        description: copy.preflight.missingSalaryDescription(
          blocker.count,
          branchName,
        ),
        action: copy.preflight.missingSalaryAction,
      };
    case "stale_open_attendance":
      return {
        title: copy.preflight.staleAttendanceTitle,
        description: copy.preflight.staleAttendanceDescription(
          blocker.count,
          branchName,
        ),
        action: copy.preflight.attendanceAction,
      };
    case "pending_leave":
      return {
        title: copy.preflight.pendingLeaveTitle,
        description: copy.preflight.pendingLeaveDescription(
          blocker.count,
          branchName,
        ),
        action: copy.preflight.leaveAction,
      };
    default:
      return {
        title: copy.preflight.title,
        description: copy.preflight.blockedDescription,
        action: copy.preflight.attendanceAction,
      };
  }
}

export function PayrollListClient({
  preview,
  query,
  selectedBranchId,
  officeOnly,
  selectedSalaryStatus,
  calendarTarget,
  selectedCalendarDay,
}: Props) {
  const controlSize = useFormControlSize();
  const router = useRouter();
  const [search, setSearch] = useState(query);
  const [standardDays, setStandardDays] = useState(
    String(preview.standardDays),
  );
  const [selectedEntry, setSelectedEntry] =
    useState<PayrollPreviewEntry | null>(null);
  const [editingAdjustment, setEditingAdjustment] =
    useState<PayrollAdjustment | null>(null);
  const [isSnapshotting, startSnapshot] = useTransition();
  const branchScope: HrBranchScope = officeOnly
    ? "office"
    : selectedBranchId != null
      ? `${selectedBranchId}`
      : "all";

  useEffect(() => setSearch(query), [query]);
  useEffect(
    () => setStandardDays(String(preview.standardDays)),
    [preview.standardDays],
  );

  const salaryStatus = normalizeSalaryStatus(selectedSalaryStatus);
  const hasPreflightBlockers = preview.preflight.blockers.length > 0;

  const rows = useMemo(() => {
    const normalized = search.trim();
    return preview.entries.filter((entry) => {
      const matchesStatus =
        salaryStatus === ALL_SALARY_STATUSES ||
        (salaryStatus === CALCULABLE_SALARY_STATUS && canCalculate(entry)) ||
        (salaryStatus === MISSING_SALARY_STATUS && !canCalculate(entry));
      const matchesQuery =
        !normalized ||
        matchesSearch(
          [
            entry.employeeName,
            entry.employeeCode,
            entry.branchName,
            entry.positionLabel,
          ],
          normalized,
        );
      return matchesStatus && matchesQuery;
    });
  }, [preview.entries, salaryStatus, search]);

  const calculableRows = rows.filter(canCalculate);
  const totalNet = calculableRows.reduce(
    (total, entry) => total + netValue(entry),
    0,
  );
  const isLocked =
    preview.snapshot?.status === "approved" ||
    preview.snapshot?.status === "paid";
  const netHeader = isLocked ? copy.table.finalizedNet : copy.table.net;
  const adjustmentDefaults: AdjustmentFormValues = {
    kind: editingAdjustment?.kind ?? "bonus",
    amount: editingAdjustment ? String(editingAdjustment.amount) : "",
    note: editingAdjustment?.note ?? "",
  };
  const calendarEntry =
    typeof calendarTarget === "number"
      ? (preview.entries.find((entry) => entry.employeeId === calendarTarget) ??
        null)
      : null;
  const isCalendarOpen = calendarTarget === "all" || calendarEntry !== null;
  const calendarRecords = calendarEntry
    ? preview.calendar.records.filter(
        (record) => record.employeeId === calendarEntry.employeeId,
      )
    : preview.calendar.records;
  const calendarLeaves = calendarEntry
    ? preview.calendar.leaves.filter(
        (leave) => leave.employeeId === calendarEntry.employeeId,
      )
    : preview.calendar.leaves;
  const calendarDayEntries =
    selectedCalendarDay == null
      ? []
      : Array.from(
          new Set([
            ...calendarRecords
              .filter((record) => record.date === selectedCalendarDay)
              .map((record) => record.employeeId),
            ...calendarLeaves
              .filter(
                (leave) =>
                  leave.start_date <= selectedCalendarDay &&
                  leave.end_date >= selectedCalendarDay,
              )
              .map((leave) => leave.employeeId),
          ]),
        ).map((employeeId) => ({
          employeeId,
          employee: preview.entries.find(
            (entry) => entry.employeeId === employeeId,
          ),
          records: calendarRecords.filter(
            (record) =>
              record.employeeId === employeeId &&
              record.date === selectedCalendarDay,
          ),
          leave: calendarLeaves.find(
            (leave) =>
              leave.employeeId === employeeId &&
              leave.start_date <= selectedCalendarDay &&
              leave.end_date >= selectedCalendarDay,
          ),
        }));

  function replaceFilters(nextValues: {
    month?: string;
    salaryStatus?: SalaryStatusFilter;
    standardDays?: string;
    calendarTarget?: "all" | number | null;
    calendarDay?: string | null;
  }) {
    const params = new URLSearchParams();
    params.set(
      "month",
      nextValues.month ?? monthValue(preview.year, preview.month),
    );
    params.set(
      "standardDays",
      nextValues.standardDays ?? String(preview.standardDays),
    );
    params.set("branch", branchScope);
    const nextQuery = search;
    if (nextQuery.trim()) params.set("q", nextQuery.trim());
    const nextSalaryStatus = nextValues.salaryStatus ?? salaryStatus;
    if (nextSalaryStatus !== ALL_SALARY_STATUSES) {
      params.set("salaryStatus", nextSalaryStatus);
    }
    const nextCalendarTarget =
      nextValues.calendarTarget === undefined
        ? calendarTarget
        : nextValues.calendarTarget;
    if (nextCalendarTarget != null) {
      params.set("calendar", String(nextCalendarTarget));
    }
    const nextCalendarDay =
      nextValues.calendarDay === undefined
        ? selectedCalendarDay
        : nextValues.calendarDay;
    if (nextCalendarTarget != null && nextCalendarDay != null) {
      params.set("day", nextCalendarDay);
    }
    router.replace(`/hr/payroll?${params.toString()}`);
  }

  function selectCalendarDay(date: string) {
    replaceFilters({
      calendarDay: date === selectedCalendarDay ? null : date,
    });
  }

  function closeCalendar() {
    replaceFilters({ calendarTarget: null, calendarDay: null });
  }

  function updateStandardDays(value = standardDays) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 31) {
      setStandardDays(String(preview.standardDays));
      return;
    }
    replaceFilters({ standardDays: String(parsed) });
  }

  function openAdjustment(entry: PayrollPreviewEntry) {
    setEditingAdjustment(null);
    setSelectedEntry(entry);
  }

  function openCalendar(entry: PayrollPreviewEntry) {
    replaceFilters({ calendarTarget: entry.employeeId, calendarDay: null });
  }

  async function submitAdjustment(
    values: AdjustmentFormValues,
  ): Promise<ActionResult> {
    if (!selectedEntry) {
      return { success: false, error: copy.adjustmentTargetMissing };
    }
    const result = await savePayrollAdjustment({
      adjustmentId: editingAdjustment?.id,
      employeeId: selectedEntry.employeeId,
      month: preview.month,
      year: preview.year,
      kind: values.kind,
      amount: Number(values.amount),
      note: values.note,
    });
    if (result.success) router.refresh();
    return result;
  }

  async function deleteAdjustment(adjustment: PayrollAdjustment) {
    const approved = await confirm({
      title: copy.adjustmentDeleteTitle,
      description: copy.adjustmentDeleteDescription,
      confirmText: copy.adjustmentDelete,
      cancelText: copy.cancel,
      variant: "destructive",
    });
    if (!approved) return;
    const result = await removePayrollAdjustment({
      adjustmentId: adjustment.id,
    });
    if (result.success) {
      toast.success(copy.adjustmentDeleted);
      setEditingAdjustment(null);
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  async function confirmSnapshot() {
    const approved = await confirm({
      title: copy.snapshot,
      description: copy.snapshotConfirmDescription,
      confirmText: copy.snapshot,
      cancelText: copy.cancel,
    });
    if (!approved) return;
    startSnapshot(async () => {
      const result = await snapshotPayrollPreview({
        month: preview.month,
        year: preview.year,
        standardDays: preview.standardDays,
        branchId: selectedBranchId,
        officeOnly,
      });
      if (result.success) {
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  const snapshotAction = !isLocked ? (
    <Button
      onClick={() => void confirmSnapshot()}
      disabled={!preview.canSnapshot || isSnapshotting}
    >
      {isSnapshotting ? copy.snapshotting : copy.snapshot}
    </Button>
  ) : null;

  function openPreflightBlocker(blocker: PayrollPreflightBlocker) {
    if (blocker.kind === "missing_salary") {
      router.push(
        withHrBranchScope("/hr?view=profile&salary=missing", branchScope),
      );
      return;
    }
    if (blocker.kind === "pending_leave") {
      router.push(
        withHrBranchScope("/hr/attendance?tab=approvals", branchScope),
      );
      return;
    }

    const params = new URLSearchParams({
      tab: "timesheet",
      month: monthValue(preview.year, preview.month),
      view: "calendar",
      filter: "attention",
    });
    if (blocker.branchId != null) {
      params.set("branch", String(blocker.branchId));
    } else {
      params.set("branch", branchScope);
    }
    router.push(`/hr/attendance?${params.toString()}`);
  }

  const columns: DataTableColumn<PayrollPreviewEntry>[] = [
    {
      key: "row-number",
      header: copy.table.index,
      className: "w-12 text-right font-mono text-sm tabular-nums",
      render: (_, index) => String(index + 1),
    },
    {
      key: "employee",
      header: copy.table.employee,
      render: (entry) => (
        <div className="min-w-44 max-w-72 overflow-hidden">
          <p className="truncate font-medium">{entry.employeeName}</p>
          <p className="truncate text-xs text-muted-foreground">
            {[
              entry.employeeCode,
              copy.compactPosition(entry.positionLabel),
              entry.branchName,
            ]
              .filter(Boolean)
              .join(" · ") || "—"}
          </p>
        </div>
      ),
    },
    {
      key: "pay-basis",
      header: copy.table.payBasis,
      className: "w-28 whitespace-nowrap text-sm",
      render: (entry) => messages.hr.payBasis.label(entry.payBasis),
    },
    {
      key: "working-days",
      header: copy.table.workingDays,
      className: "w-32 text-right font-mono text-xs tabular-nums",
      render: (entry) => (
        <span className="flex flex-col gap-1">
          <span className="whitespace-nowrap">
            {copy.workdays}: {decimalCell(workingDaysValue(entry))}
          </span>
          <span className="whitespace-nowrap text-muted-foreground">
            {copy.table.workHours}: {decimalCell(entry.workHours)}
          </span>
        </span>
      ),
    },
    {
      key: "leave-days",
      header: copy.table.leaveDays,
      className: "w-20 text-right font-mono text-sm tabular-nums",
      render: (entry) => decimalCell(totalLeaveDays(entry)),
    },
    {
      key: "bonus",
      header: copy.table.bonus,
      className: "min-w-28 text-right font-mono text-sm tabular-nums",
      render: (entry) =>
        moneyCell(entry, entry.finalized?.bonus ?? entry.bonus),
    },
    {
      key: "bhxh",
      header: copy.table.bhxh,
      className: "min-w-28 text-right font-mono text-sm tabular-nums",
      render: (entry) => moneyCell(entry, entry.bhxhEmployee),
    },
    {
      key: "net",
      header: netHeader,
      className: "min-w-32 text-right font-mono text-sm tabular-nums",
      render: (entry) => moneyCell(entry, netValue(entry)),
    },
    {
      key: "actions",
      header: copy.table.edit,
      className: "w-32 text-right",
      render: (entry) =>
        !isLocked &&
        (canCalculate(entry) ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={(event) => {
              event.stopPropagation();
              openAdjustment(entry);
            }}
          >
            <IconPencil data-icon="inline-start" />
            {copy.table.edit}
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={(event) => {
              event.stopPropagation();
              router.push(withHrBranchScope("/hr", branchScope));
            }}
          >
            {copy.missingSalaryAction}
          </Button>
        )),
    },
  ];

  return (
    <>
      {!isLocked && hasPreflightBlockers ? (
        <AppSection
          tone="warning"
          title={copy.preflight.title}
          description={copy.preflight.blockedDescription}
          badge={{
            children: copy.preflight.blockedBadge,
            variant: "warning",
          }}
        >
          <div className="flex flex-col gap-2">
            {preview.preflight.blockers.map((blocker) => {
              const content = preflightBlockerContent(blocker);
              return (
                <Item
                  key={`${blocker.kind}:${blocker.branchId ?? "none"}`}
                  variant="outline"
                >
                  <ItemContent>
                    <ItemTitle>{content.title}</ItemTitle>
                    <ItemDescription>{content.description}</ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openPreflightBlocker(blocker)}
                    >
                      {content.action}
                    </Button>
                  </ItemActions>
                </Item>
              );
            })}
          </div>
        </AppSection>
      ) : null}

      <AppListFrame
        title={copy.periodName(preview.month, preview.year)}
        description={
          isLocked
            ? copy.snapshotDescription
            : selectedBranchId != null || officeOnly
              ? copy.snapshotAllBranchesRequired
              : preview.canSnapshot
                ? copy.description
                : payrollCopy.server.snapshotUnavailable
        }
        headerHint={isLocked ? copy.snapshotLocked : copy.snapshotOpen}
        action={snapshotAction}
        className="motion-safe:animate-in motion-safe:fade-in"
        contentScroll
        toolbar={
          <AppToolbar
            variant="inline"
            className="items-stretch [&>[data-slot=toolbar-group]]:w-full [&>[data-slot=separator]]:hidden sm:items-center sm:[&>[data-slot=toolbar-group]]:w-auto sm:[&>[data-slot=separator]]:block"
            search={
              <InputGroup size={controlSize} className="w-full sm:w-64">
                <InputGroupAddon>
                  <IconSearch aria-hidden />
                </InputGroupAddon>
                <InputGroupInput
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={copy.search}
                  aria-label={copy.search}
                />
              </InputGroup>
            }
            filters={
              <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap">
                <Input
                  type="month"
                  controlSize={controlSize}
                  value={monthValue(preview.year, preview.month)}
                  onChange={(event) =>
                    replaceFilters({ month: event.target.value })
                  }
                  aria-label={copy.month}
                  className="w-full sm:w-36"
                />
                <Select
                  value={salaryStatus}
                  onValueChange={(value) =>
                    replaceFilters({
                      salaryStatus: normalizeSalaryStatus(value),
                    })
                  }
                >
                  <SelectTrigger
                    size={controlSize}
                    className="w-full sm:w-44"
                    aria-label={copy.salaryStatus}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_SALARY_STATUSES}>
                      {copy.salaryStatusAll}
                    </SelectItem>
                    <SelectItem value={CALCULABLE_SALARY_STATUS}>
                      {copy.salaryStatusCalculable}
                    </SelectItem>
                    <SelectItem value={MISSING_SALARY_STATUS}>
                      {copy.salaryStatusMissing}
                    </SelectItem>
                  </SelectContent>
                </Select>
                <FormattedNumberInput
                  value={standardDays}
                  onValueChange={setStandardDays}
                  onValueBlur={(value) => {
                    setStandardDays(value);
                    updateStandardDays(value);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") updateStandardDays();
                  }}
                  maxFractionDigits={2}
                  className="w-full text-right font-mono tabular-nums sm:w-28"
                  aria-label={copy.standardDays}
                  title={copy.standardDays}
                />
              </div>
            }
            actions={
              <Button
                variant="outline"
                size="touch"
                onClick={() =>
                  replaceFilters({ calendarTarget: "all", calendarDay: null })
                }
              >
                <IconCalendarDays data-icon="inline-start" />
                {copy.calendar}
              </Button>
            }
          />
        }
      >
        <DataTable
          columns={columns}
          data={rows}
          getRowKey={(entry) => entry.employeeId}
          onRowClick={openCalendar}
          getRowAriaLabel={(entry) => copy.calendarOpenRow(entry.employeeName)}
          emptyTitle={copy.table.empty}
          pageSize={25}
          desktopFooterRows={
            calculableRows.length > 0
              ? [
                  {
                    key: "total",
                    cells: [
                      {
                        key: "label",
                        content: copy.table.total(calculableRows.length),
                        colSpan: 6,
                        className: "font-medium",
                      },
                      {
                        key: "net",
                        content: formatVND(totalNet),
                        className:
                          "text-right font-mono font-semibold tabular-nums",
                      },
                      { key: "actions", content: "" },
                    ],
                  },
                ]
              : undefined
          }
          mobileFooter={
            calculableRows.length > 0 ? (
              <Item variant="muted">
                <ItemContent>
                  <ItemTitle>
                    {copy.table.total(calculableRows.length)}
                  </ItemTitle>
                </ItemContent>
                <span className="font-mono font-semibold tabular-nums">
                  {formatVND(totalNet)}
                </span>
              </Item>
            ) : null
          }
          mobileCardRender={(entry) => (
            <Item variant="outline">
              <ItemContent>
                <ItemTitle>{entry.employeeName}</ItemTitle>
                <ItemDescription>{workSummary(entry)}</ItemDescription>
                <ItemDescription>
                  {copy.table.bonus}:{" "}
                  {moneyCell(entry, entry.finalized?.bonus ?? entry.bonus)}
                </ItemDescription>
                <ItemDescription>
                  {copy.table.bhxh}: {moneyCell(entry, entry.bhxhEmployee)}
                </ItemDescription>
              </ItemContent>
              <ItemActions className="items-end gap-2">
                <Button
                  variant="ghost"
                  size="touch"
                  onClick={() => openCalendar(entry)}
                >
                  <IconCalendarDays data-icon="inline-start" />
                  {copy.calendar}
                </Button>
                {!isLocked ? (
                  canCalculate(entry) ? (
                    <Button
                      variant="ghost"
                      size="touch"
                      onClick={() => openAdjustment(entry)}
                    >
                      <IconPencil data-icon="inline-start" />
                      {copy.table.edit}
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="touch"
                      onClick={() =>
                        router.push(withHrBranchScope("/hr", branchScope))
                      }
                    >
                      {copy.missingSalaryAction}
                    </Button>
                  )
                ) : null}
                <span className="flex flex-col items-end gap-1">
                  <Badge
                    variant={
                      !canCalculate(entry)
                        ? "destructive"
                        : isLocked
                          ? "secondary"
                          : "success"
                    }
                  >
                    {!canCalculate(entry)
                      ? copy.table.missingSalary
                      : isLocked
                        ? copy.table.finalized
                        : copy.table.calculable}
                  </Badge>
                  <span className="text-2xs text-muted-foreground">
                    {netHeader}
                  </span>
                  <span className="font-mono text-sm font-semibold tabular-nums">
                    {moneyCell(entry, netValue(entry))}
                  </span>
                </span>
              </ItemActions>
            </Item>
          )}
        />
      </AppListFrame>

      <PayrollCalendarDialog
        open={isCalendarOpen}
        onOpenChange={(open) => {
          if (!open) closeCalendar();
        }}
        preview={preview}
        calendarEntry={calendarEntry}
        calendarRecords={calendarRecords}
        calendarLeaves={calendarLeaves}
        selectedCalendarDay={selectedCalendarDay}
        onSelectCalendarDay={selectCalendarDay}
        calendarDayEntries={calendarDayEntries}
      />

      {selectedEntry ? (
        <FormDialog
          open={selectedEntry != null}
          onOpenChange={(open) => {
            if (!open) {
              setSelectedEntry(null);
              setEditingAdjustment(null);
            }
          }}
          title={copy.adjustmentTitle(selectedEntry.employeeName)}
          description={copy.adjustmentDescription}
          schema={adjustmentSchema}
          defaultValues={adjustmentDefaults}
          entityKey={editingAdjustment?.id ?? selectedEntry.employeeId}
          onSubmit={submitAdjustment}
          onSuccess={() => {
            toast.success(copy.adjustmentSaved);
            router.refresh();
          }}
          submitLabel={copy.adjustmentSave}
        >
          {(form) => (
            <>
              <SelectField
                control={form.control}
                name="kind"
                label={copy.adjustmentFields.kind}
                options={(
                  Object.keys(copy.adjustmentKinds) as PayrollAdjustmentKind[]
                ).map((kind) => ({
                  value: kind,
                  label: copy.adjustmentKinds[kind],
                }))}
                required
              />
              <MoneyVndField
                control={form.control}
                name="amount"
                label={copy.adjustmentFields.amount}
                required
              />
              <TextareaField
                control={form.control}
                name="note"
                label={copy.adjustmentFields.note}
                placeholder={copy.adjustmentFields.notePlaceholder}
                required
              />
              {selectedEntry.adjustments.length > 0 ? (
                <div className="flex flex-col gap-2 border-t pt-4">
                  {selectedEntry.adjustments.map((adjustment) => (
                    <Item key={adjustment.id} variant="muted">
                      <ItemContent>
                        <ItemTitle>{adjustmentLabel(adjustment)}</ItemTitle>
                        <ItemDescription className="line-clamp-2">
                          {adjustment.note || "—"}
                        </ItemDescription>
                      </ItemContent>
                      <ItemActions>
                        <span className="font-mono text-sm font-medium tabular-nums">
                          {formatVND(adjustment.amount)}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => setEditingAdjustment(adjustment)}
                          aria-label={copy.adjustment}
                        >
                          <IconPencil />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => void deleteAdjustment(adjustment)}
                          aria-label={copy.adjustmentDelete}
                        >
                          <IconTrash />
                        </Button>
                      </ItemActions>
                    </Item>
                  ))}
                </div>
              ) : null}
            </>
          )}
        </FormDialog>
      ) : null}
    </>
  );
}
