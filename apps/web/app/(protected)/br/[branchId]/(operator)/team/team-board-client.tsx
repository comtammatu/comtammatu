"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ClipboardCheck as IconClipboardCheck,
  Clock as IconClock,
  Users as IconUsers,
} from "lucide-react";
import { formatVNTime } from "@comtammatu/shared/time";

import { Button } from "@comtammatu/ui/components/button";
import { Badge } from "@comtammatu/ui/components/badge";

import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@comtammatu/ui/components/drawer";
import { InteractiveCard } from "@/components/data-table/interactive-card";
import { messages } from "@lib/messages";
import { AppEmptyState } from "@/components/surface";
import { StatusBadge } from "@/components/status-badge";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import { useLongPress } from "@lib/hooks/use-long-press";
import type {
  TeamBoardChecklistPhase,
  TeamBoardCountStatus,
  TeamBoardRow,
  TeamBoardShiftAttendance,
} from "./data";

const copy = messages.employee.teamBoard;

type AttendanceState = "not_started" | "working" | "checkout_pending" | "done";
type TeamBoardFilter = "all" | "working" | "needs_action" | "count_missing";

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

interface TeamBoardShiftGroup {
  key: string;
  label: string;
  rows: TeamBoardDisplayRow[];
  firstCheckIn: string | null;
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

function attendanceState(
  shift: TeamBoardShiftAttendance | null,
): AttendanceState {
  if (!shift || !shift.checkIn) return "not_started";
  if (shift.checkOut) return "done";
  if (shift.checkoutRequestedAt && !shift.checkoutApprovedAt) {
    return "checkout_pending";
  }
  return "working";
}

function AttendanceBadge({
  shift,
}: {
  shift: TeamBoardShiftAttendance | null;
}) {
  const state = attendanceState(shift);
  if (state === "not_started") {
    return (
      <StatusBadge
        domain="attendance"
        value="stale_open"
        label={copy.attendanceNotStarted}
      />
    );
  }
  if (state === "done") {
    return (
      <StatusBadge
        domain="attendance"
        value="checked_out"
        label={copy.attendanceDone}
      />
    );
  }
  if (state === "checkout_pending") {
    return (
      <StatusBadge
        domain="leave-request"
        value="pending"
        label={copy.attendanceCheckoutPending}
      />
    );
  }
  return (
    <StatusBadge
      domain="attendance"
      value="in_shift"
      label={copy.attendanceWorking}
    />
  );
}

function checklistLabel(
  shift: TeamBoardShiftAttendance | null,
  phase: TeamBoardChecklistPhase,
) {
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
    return (
      <StatusBadge
        domain="count-slip"
        value="approved"
        label={copy.countApproved}
      />
    );
  }
  if (status === "submitted") {
    return (
      <StatusBadge
        domain="count-slip"
        value="submitted"
        label={copy.countSubmitted}
      />
    );
  }
  return <Badge variant="warning">{copy.countNotSubmitted}</Badge>;
}

function rowNeedsAction(row: TeamBoardDisplayRow) {
  return (
    attendanceState(row.shift) === "checkout_pending" ||
    row.countStatus === "submitted" ||
    row.countStatus === "not_submitted"
  );
}

function matchesTeamBoardFilter(
  row: TeamBoardDisplayRow,
  filter: TeamBoardFilter,
) {
  const state = attendanceState(row.shift);
  if (filter === "all") return true;
  if (filter === "working") return state === "working";
  if (filter === "needs_action") return rowNeedsAction(row);
  return row.countStatus === "not_submitted";
}

function filterCount(rows: TeamBoardDisplayRow[], filter: TeamBoardFilter) {
  return rows.filter((row) => matchesTeamBoardFilter(row, filter)).length;
}

function groupRowsByShift(rows: TeamBoardDisplayRow[]): TeamBoardShiftGroup[] {
  const groups = new Map<string, TeamBoardShiftGroup>();

  for (const row of rows) {
    const label = row.shift?.shiftName ?? copy.shiftNone;
    const key = row.shift?.shiftName ?? "none";
    const firstCheckIn = row.shift?.checkIn ?? null;
    const group = groups.get(key);

    if (group) {
      group.rows.push(row);
      if (
        firstCheckIn &&
        (!group.firstCheckIn || firstCheckIn < group.firstCheckIn)
      ) {
        group.firstCheckIn = firstCheckIn;
      }
      continue;
    }

    groups.set(key, {
      key,
      label,
      rows: [row],
      firstCheckIn,
    });
  }

  return [...groups.values()].sort((a, b) => {
    if (a.firstCheckIn && b.firstCheckIn) {
      return a.firstCheckIn.localeCompare(b.firstCheckIn);
    }
    if (a.firstCheckIn) return -1;
    if (b.firstCheckIn) return 1;
    return a.label.localeCompare(b.label, "vi");
  });
}

function actionLabel(row: TeamBoardDisplayRow): string {
  const state = attendanceState(row.shift);
  if (state === "checkout_pending") return copy.drawerActionCheckout;
  if (row.countStatus === "submitted") return copy.drawerActionCountSubmitted;
  return copy.drawerActionCountMissing;
}

function TeamBoardFilters({
  rows,
  value,
  onChange,
}: {
  rows: TeamBoardDisplayRow[];
  value: TeamBoardFilter;
  onChange: (value: TeamBoardFilter) => void;
}) {
  const filters: { value: TeamBoardFilter; label: string }[] = [
    { value: "all", label: copy.filters.all },
    { value: "working", label: copy.filters.working },
    { value: "needs_action", label: copy.filters.needsAction },
    { value: "count_missing", label: copy.filters.countMissing },
  ];

  return (
    <div
      className="flex gap-1.5 overflow-x-auto pb-1"
      role="group"
      aria-label={copy.filterAriaLabel}
    >
      {filters.map((filter) => {
        const active = filter.value === value;
        return (
          <Button
            key={filter.value}
            type="button"
            variant={active ? "secondary" : "outline"}
            size="sm"
            aria-pressed={active}
            className="h-9 shrink-0 gap-2 px-3"
            onClick={() => onChange(filter.value)}
          >
            <span className="whitespace-nowrap">{filter.label}</span>
            <Badge variant={active ? "default" : "outline"}>
              {filterCount(rows, filter.value)}
            </Badge>
          </Button>
        );
      })}
    </div>
  );
}

function MobileTeamCard({
  row,
  onOpenDrawer,
  href,
  showShiftName = true,
  className,
}: {
  row: TeamBoardDisplayRow;
  onOpenDrawer: (row: TeamBoardDisplayRow) => void;
  href: string | undefined;
  showShiftName?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const positionLabel = row.positionLabel ?? copy.positionUnknown;
  const shiftLabel = row.shift?.shiftName ?? copy.shiftNone;
  const subtitle = showShiftName
    ? `${positionLabel} · ${shiftLabel}`
    : positionLabel;
  const longPress = useLongPress({
    onLongPress: () => onOpenDrawer(row),
    onClick: () => {
      if (href) router.push(href);
      else onOpenDrawer(row);
    },
  });

  return (
    <InteractiveCard
      minHeight="tap"
      padding="compact"
      className={`h-auto touch-pan-y select-none cursor-pointer ${className ?? ""}`}
      {...longPress}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-2 pointer-events-none">
        <div className="flex min-w-0 items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{row.fullName}</p>
            <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
          </div>
          <AttendanceBadge shift={row.shift} />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <CountBadge status={row.countStatus} />
          {row.onApprovedLeave ? (
            <StatusBadge
              domain="leave-request"
              value="approved"
              label={copy.leaveApproved}
            />
          ) : null}
        </div>
      </div>
      <IconClipboardCheck className="size-4 shrink-0 text-muted-foreground pointer-events-none" />
    </InteractiveCard>
  );
}

function TeamBoardMobileGroups({
  groups,
  onOpenDrawer,
  rowHref,
}: {
  groups: TeamBoardShiftGroup[];
  onOpenDrawer: (row: TeamBoardDisplayRow) => void;
  rowHref: (row: TeamBoardDisplayRow) => string | undefined;
}) {
  return (
    <div className="flex flex-col gap-3">
      {groups.map((group) => (
        <section
          key={group.key}
          className="flex flex-col gap-1.5"
          aria-label={group.label}
        >
          <div className="flex min-h-8 items-center justify-between gap-2 px-1">
            <h3 className="min-w-0 truncate font-heading text-sm font-semibold text-foreground">
              {group.label}
            </h3>
            <span className="shrink-0 text-xs text-muted-foreground">
              {copy.shiftGroupCount(group.rows.length)}
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            {group.rows.map((row) => (
              <MobileTeamCard
                key={row.key}
                row={row}
                href={rowHref(row)}
                onOpenDrawer={onOpenDrawer}
                showShiftName={false}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
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
  const [filter, setFilter] = useState<TeamBoardFilter>("all");
  const [drawerRow, setDrawerRow] = useState<TeamBoardDisplayRow | null>(null);
  const router = useRouter();
  const filteredRows = displayRows.filter((row) =>
    matchesTeamBoardFilter(row, filter),
  );
  const filteredGroups = groupRowsByShift(filteredRows);
  const filteredGroupedRows = filteredGroups.flatMap((group) => group.rows);

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
    if (
      row.countStatus === "submitted" ||
      row.countStatus === "not_submitted"
    ) {
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
          <span>
            {copy.phaseStart}: {checklistLabel(row.shift, "start_of_shift")}
          </span>
          <span>
            {copy.phaseEnd}: {checklistLabel(row.shift, "end_of_shift")}
          </span>
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
          <StatusBadge
            domain="leave-request"
            value="approved"
            label={copy.leaveApproved}
          />
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

  function renderTable(data: TeamBoardDisplayRow[]) {
    return (
      <DataTable
        columns={columns}
        data={data}
        getRowKey={(row) => row.key}
        mobileBreakpoint={1024}
        emptyIcon={<IconUsers />}
        emptyMode={filter === "all" ? "no-data" : "no-results"}
        emptyTitle={
          filter === "all" ? copy.emptyTitle : copy.filteredEmptyTitle
        }
        emptyDescription={
          filter === "all"
            ? copy.emptyDescription
            : copy.filteredEmptyDescription
        }
        onRowClick={(row) => {
          const href = rowHref(row);
          if (href) {
            router.push(href);
            return;
          }
          setDrawerRow(row);
        }}
        getRowAriaLabel={(row) =>
          `${row.fullName} · ${row.positionLabel ?? ""}`
        }
        rowClassName={(row) => {
          const state = attendanceState(row.shift);
          if (state === "checkout_pending") return "bg-warning/10";
          if (row.countStatus === "submitted") return "bg-info/10";
          if (row.onApprovedLeave) return "bg-muted/50";
          return undefined;
        }}
        mobileCardRender={(row) => (
          <MobileTeamCard
            row={row}
            href={rowHref(row)}
            onOpenDrawer={setDrawerRow}
          />
        )}
      />
    );
  }

  return (
    <>
      <section
        className="flex flex-col gap-2"
        aria-label={copy.boardSectionTitle}
      >
        <TeamBoardFilters
          rows={displayRows}
          value={filter}
          onChange={setFilter}
        />

        {filteredGroups.length === 0 ? (
          renderTable(filteredRows)
        ) : (
          <>
            <div className="lg:hidden">
              <TeamBoardMobileGroups
                groups={filteredGroups}
                rowHref={rowHref}
                onOpenDrawer={setDrawerRow}
              />
            </div>
            <div className="hidden lg:block">
              {renderTable(filteredGroupedRows)}
            </div>
          </>
        )}
      </section>

      <Drawer
        open={!!drawerRow}
        onOpenChange={(open) => !open && setDrawerRow(null)}
      >
        <DrawerContent className="flex max-h-dvh-80 flex-col overflow-hidden">
          {drawerRow && (
            <>
              <DrawerHeader className="shrink-0 text-left">
                <DrawerTitle className="truncate">
                  {drawerRow.fullName}
                </DrawerTitle>
                <DrawerDescription className="truncate">
                  {drawerRow.positionLabel ?? copy.positionUnknown} ·{" "}
                  {drawerRow.shift?.shiftName ?? copy.shiftNone}
                </DrawerDescription>
              </DrawerHeader>
              <div
                className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4"
                data-vaul-no-drag=""
              >
                <div className="flex flex-col gap-3">
                  <div className="flex flex-wrap gap-2">
                    <AttendanceBadge shift={drawerRow.shift} />
                    <CountBadge status={drawerRow.countStatus} />
                    {drawerRow.onApprovedLeave ? (
                      <StatusBadge
                        domain="leave-request"
                        value="approved"
                        label={copy.leaveApproved}
                      />
                    ) : null}
                  </div>

                  {drawerRow.shift && (
                    <div className="flex min-w-0 flex-col gap-2 text-sm">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <IconClock className="size-4 shrink-0" />
                        <span className="font-mono tabular-nums">
                          {drawerRow.shift.checkIn
                            ? formatVNTime(drawerRow.shift.checkIn)
                            : "—"}
                          {" - "}
                          {drawerRow.shift.checkOut
                            ? formatVNTime(drawerRow.shift.checkOut)
                            : "—"}
                        </span>
                      </div>
                      <div className="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground">
                        <span className="break-words">
                          {copy.phaseStart}:{" "}
                          {checklistLabel(drawerRow.shift, "start_of_shift")}
                        </span>
                        <span className="break-words">
                          {copy.phaseEnd}:{" "}
                          {checklistLabel(drawerRow.shift, "end_of_shift")}
                        </span>
                      </div>
                    </div>
                  )}

                  {(() => {
                    const href = rowHref(drawerRow);
                    if (!href) return null;
                    return (
                      <Button
                        variant="default"
                        size="touch"
                        className="w-full"
                        onClick={() => router.push(href)}
                      >
                        {actionLabel(drawerRow)}
                      </Button>
                    );
                  })()}
                </div>
              </div>
            </>
          )}
        </DrawerContent>
      </Drawer>
    </>
  );
}
