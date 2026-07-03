"use client";

import Link from "next/link";
import {
  ClipboardCheck as IconClipboardCheck,
  Users as IconUsers,
} from "lucide-react";
import { Badge } from "@comtammatu/ui/components/badge";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { formatVNTime } from "@comtammatu/shared/time";
import { messages } from "@lib/messages";
import { AppEmptyState } from "@/components/surface";
import { StatusBadge } from "@/components/status-badge";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import type {
  TeamBoardChecklistPhase,
  TeamBoardCountStatus,
  TeamBoardRow,
  TeamBoardShiftAttendance,
} from "./data";

const copy = messages.employee.teamBoard;

type AttendanceState =
  | "not_started"
  | "working"
  | "checkout_pending"
  | "done";

export interface TeamBoardDisplayRow {
  key: string;
  employeeId: number;
  employeeCode: string | null;
  fullName: string;
  positionLabel: string | null;
  shift: TeamBoardShiftAttendance | null;
  countStatus: TeamBoardCountStatus;
  onApprovedLeave: boolean;
}

function buildDisplayRows(rows: TeamBoardRow[]): TeamBoardDisplayRow[] {
  return rows.flatMap((row): TeamBoardDisplayRow[] => {
    if (row.shifts.length === 0) {
      return [
        {
          key: `${row.employeeId}:none`,
          employeeId: row.employeeId,
          employeeCode: row.employeeCode,
          fullName: row.fullName,
          positionLabel: row.positionLabel,
          shift: null,
          countStatus: row.countStatus,
          onApprovedLeave: row.onApprovedLeave,
        },
      ];
    }

    return row.shifts.map((shift) => ({
      key: `${row.employeeId}:${shift.attendanceId}`,
      employeeId: row.employeeId,
      employeeCode: row.employeeCode,
      fullName: row.fullName,
      positionLabel: row.positionLabel,
      shift,
      countStatus: row.countStatus,
      onApprovedLeave: row.onApprovedLeave,
    }));
  });
}

function attendanceState(shift: TeamBoardShiftAttendance | null): AttendanceState {
  if (!shift || !shift.checkIn) return "not_started";
  if (shift.checkOut) return "done";
  if (shift.checkoutRequestedAt && !shift.checkoutApprovedAt) {
    return "checkout_pending";
  }
  return "working";
}

function AttendanceBadge({ shift }: { shift: TeamBoardShiftAttendance | null }) {
  const state = attendanceState(shift);
  if (state === "not_started") {
    return <StatusBadge domain="attendance" value="stale_open" label={copy.attendanceNotStarted} />;
  }
  if (state === "done") {
    return <StatusBadge domain="attendance" value="checked_out" label={copy.attendanceDone} />;
  }
  if (state === "checkout_pending") {
    return <StatusBadge domain="leave-request" value="pending" label={copy.attendanceCheckoutPending} />;
  }
  return <StatusBadge domain="attendance" value="in_shift" label={copy.attendanceWorking} />;
}

function checklistLabel(shift: TeamBoardShiftAttendance | null, phase: TeamBoardChecklistPhase) {
  if (!shift) return "—";
  if (!shift.checklistConfigured) return copy.checklistUnconfigured;
  const progress = shift.checklist[phase];
  if (progress.requiredTotal === 0) return copy.checklistNoTasks;
  return copy.checklistProgress(progress.requiredDone, progress.requiredTotal);
}

function CountBadge({ status }: { status: TeamBoardCountStatus }) {
  if (status === "not_assigned") {
    return <Badge variant="outline">{copy.countNotAssigned}</Badge>;
  }
  if (status === "approved") {
    return <StatusBadge domain="count-slip" value="approved" label={copy.countApproved} />;
  }
  if (status === "submitted") {
    return <StatusBadge domain="count-slip" value="submitted" label={copy.countSubmitted} />;
  }
  return <Badge variant="warning">{copy.countNotSubmitted}</Badge>;
}

export function TeamBoardClient({
  rows,
  countSlipsHref,
  checkoutApprovalsHref,
}: {
  rows: TeamBoardRow[];
  countSlipsHref: string;
  checkoutApprovalsHref: string;
}) {
  const displayRows = buildDisplayRows(rows);

  if (displayRows.length === 0) {
    return (
      <AppEmptyState
        title={copy.emptyTitle}
        description={copy.emptyDescription}
        icon={<IconUsers />}
      />
    );
  }

  function rowHref(row: TeamBoardDisplayRow): string | undefined {
    const state = attendanceState(row.shift);
    if (state === "checkout_pending") return checkoutApprovalsHref;
    if (row.countStatus === "submitted" || row.countStatus === "not_submitted") {
      return countSlipsHref;
    }
    return undefined;
  }

  const columns: DataTableColumn<TeamBoardDisplayRow>[] = [
    {
      key: "employee",
      header: copy.columnEmployee,
      render: (row) => (
        <div className="flex flex-col">
          <span className="font-medium">{row.fullName}</span>
          <span className="text-xs text-muted-foreground">
            {row.positionLabel ?? copy.positionUnknown}
          </span>
        </div>
      ),
    },
    {
      key: "shift",
      header: copy.columnShift,
      className: "text-sm",
      render: (row) => row.shift?.shiftName ?? copy.shiftNone,
    },
    {
      key: "attendance",
      header: copy.columnAttendance,
      render: (row) => <AttendanceBadge shift={row.shift} />,
    },
    {
      key: "checklist",
      header: copy.columnChecklist,
      className: "text-sm",
      render: (row) => (
        <div className="flex flex-col gap-1">
          <span>{copy.phaseStart}: {checklistLabel(row.shift, "start_of_shift")}</span>
          <span>{copy.phaseEnd}: {checklistLabel(row.shift, "end_of_shift")}</span>
        </div>
      ),
    },
    {
      key: "count",
      header: copy.columnCount,
      render: (row) => <CountBadge status={row.countStatus} />,
    },
    {
      key: "leave",
      header: copy.columnLeave,
      render: (row) =>
        row.onApprovedLeave ? (
          <StatusBadge domain="leave-request" value="approved" label={copy.leaveApproved} />
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        ),
    },
    {
      key: "checkTimes",
      header: copy.columnCheckTimes,
      className: "font-mono text-sm",
      render: (row) =>
        row.shift
          ? `${row.shift.checkIn ? formatVNTime(row.shift.checkIn) : "—"} - ${
              row.shift.checkOut ? formatVNTime(row.shift.checkOut) : "—"
            }`
          : "—",
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={displayRows}
      getRowKey={(row) => row.key}
      onRowClick={(row) => {
        const href = rowHref(row);
        if (href) window.location.assign(href);
      }}
      getRowAriaLabel={(row) => `${row.fullName} · ${row.positionLabel ?? ""}`}
      mobileCardRender={(row) => {
        const href = rowHref(row);
        const content = (
          <Item variant="outline">
            <ItemContent>
              <ItemTitle className="line-clamp-none text-sm font-semibold">
                {row.fullName}
              </ItemTitle>
              <ItemDescription className="line-clamp-none text-sm leading-6">
                {row.positionLabel ?? copy.positionUnknown} ·{" "}
                {row.shift?.shiftName ?? copy.shiftNone}
              </ItemDescription>
              <div className="mt-2 flex flex-wrap gap-2">
                <AttendanceBadge shift={row.shift} />
                <CountBadge status={row.countStatus} />
                {row.onApprovedLeave ? (
                  <StatusBadge domain="leave-request" value="approved" label={copy.leaveApproved} />
                ) : null}
              </div>
              <div className="mt-2 flex flex-col gap-1 text-xs text-muted-foreground">
                <span>
                  {copy.phaseStart}: {checklistLabel(row.shift, "start_of_shift")}
                </span>
                <span>
                  {copy.phaseEnd}: {checklistLabel(row.shift, "end_of_shift")}
                </span>
              </div>
            </ItemContent>
            <ItemActions>
              <IconClipboardCheck className="size-4 text-muted-foreground" />
            </ItemActions>
          </Item>
        );

        return href ? (
          <Link href={href} className="block">
            {content}
          </Link>
        ) : (
          content
        );
      }}
    />
  );
}
