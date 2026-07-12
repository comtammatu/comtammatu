"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronRight as IconChevronRight,
  Clock as IconClock,
  Users as IconUsers,
} from "lucide-react";
import { formatVNTime } from "@comtammatu/shared/time";

import { Button } from "@comtammatu/ui/components/button";
import { Badge } from "@comtammatu/ui/components/badge";
import { confirm } from "@comtammatu/ui/components/confirm-dialog";
import { toast } from "@comtammatu/ui/components/sonner";

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
import { forceCloseStaleAttendance } from "@/(protected)/hr/actions";
import { isShiftEndedForBusinessDate } from "@lib/staff-runtime/_lib/default-shift";
import type {
  TeamBoardChecklistPhase,
  TeamBoardCountStatus,
  TeamBoardRow,
  TeamBoardShiftAttendance,
} from "./data";

const copy = messages.operator.teamBoard;

type AttendanceState = "not_started" | "working" | "checkout_pending" | "done";
type TeamBoardFilter = "all" | "working" | "needs_action" | "count_missing";
type TeamBoardCapabilities = {
  canApproveCheckout: boolean;
  canApproveCount: boolean;
};

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
      countStatus: shift.countStatus,
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

function isPastShiftEnd(shift: TeamBoardShiftAttendance | null) {
  if (!shift?.checkIn || shift.checkOut || shift.checkoutRequestedAt) {
    return false;
  }

  if (!shift.shiftStartTime || !shift.shiftEndTime) return false;
  return isShiftEndedForBusinessDate(shift.businessDate, {
    id: shift.shiftId ?? 0,
    start_time: shift.shiftStartTime,
    end_time: shift.shiftEndTime,
  });
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

function TeamPresenceBadge({
  shift,
  onApprovedLeave,
}: {
  shift: TeamBoardShiftAttendance | null;
  onApprovedLeave: boolean;
}) {
  if (onApprovedLeave) {
    return (
      <StatusBadge
        domain="leave-request"
        value="approved"
        label={copy.leaveApproved}
      />
    );
  }
  return <AttendanceBadge shift={shift} />;
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

function rowNeedsAction(
  row: TeamBoardDisplayRow,
  capabilities: TeamBoardCapabilities,
) {
  if (row.onApprovedLeave) return false;
  return (
    (capabilities.canApproveCheckout &&
      (isPastShiftEnd(row.shift) ||
        attendanceState(row.shift) === "checkout_pending")) ||
    (capabilities.canApproveCount && row.countStatus === "submitted")
  );
}

function matchesTeamBoardFilter(
  row: TeamBoardDisplayRow,
  filter: TeamBoardFilter,
  capabilities: TeamBoardCapabilities,
) {
  const state = attendanceState(row.shift);
  if (filter === "all") return true;
  if (filter === "working") return state === "working";
  if (filter === "needs_action") return rowNeedsAction(row, capabilities);
  return row.countStatus === "not_submitted";
}

function filterCount(
  rows: TeamBoardDisplayRow[],
  filter: TeamBoardFilter,
  capabilities: TeamBoardCapabilities,
) {
  return rows.filter((row) => matchesTeamBoardFilter(row, filter, capabilities))
    .length;
}

function initialTeamBoardFilter(
  rows: TeamBoardDisplayRow[],
  capabilities: TeamBoardCapabilities,
): TeamBoardFilter {
  if (filterCount(rows, "needs_action", capabilities) > 0) {
    return "needs_action";
  }
  if (filterCount(rows, "working", capabilities) > 0) return "working";
  return "all";
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

function TeamBoardFilters({
  rows,
  value,
  onChange,
  capabilities,
}: {
  rows: TeamBoardDisplayRow[];
  value: TeamBoardFilter;
  onChange: (value: TeamBoardFilter) => void;
  capabilities: TeamBoardCapabilities;
}) {
  const filterOptions: { value: TeamBoardFilter; label: string }[] = [
    { value: "all", label: copy.filters.all },
    { value: "working", label: copy.filters.working },
    { value: "needs_action", label: copy.filters.needsAction },
    { value: "count_missing", label: copy.filters.countMissing },
  ];
  const filters = filterOptions.filter(
    (filter) =>
      filter.value === "all" ||
      filterCount(rows, filter.value, capabilities) > 0,
  );

  return (
    <div
      className="no-scrollbar flex touch-pan-x gap-1.5 overflow-x-auto overscroll-x-contain pb-1"
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
            size="touch"
            aria-pressed={active}
            className="shrink-0 gap-2 px-3"
            onClick={() => onChange(filter.value)}
          >
            <span className="whitespace-nowrap">{filter.label}</span>
            <Badge variant={active ? "default" : "outline"}>
              {filterCount(rows, filter.value, capabilities)}
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
  showShiftName = true,
  className,
}: {
  row: TeamBoardDisplayRow;
  onOpenDrawer: (row: TeamBoardDisplayRow) => void;
  showShiftName?: boolean;
  className?: string;
}) {
  const positionLabel = row.positionLabel ?? copy.positionUnknown;
  const shiftLabel = row.shift?.shiftName ?? copy.shiftNone;
  const subtitle = showShiftName
    ? `${positionLabel} · ${shiftLabel}`
    : positionLabel;

  return (
    <InteractiveCard
      asChild
      minHeight="tap"
      padding="compact"
      className={`h-auto touch-manipulation select-none text-left ${className ?? ""}`}
    >
      <button type="button" onClick={() => onOpenDrawer(row)}>
        <div className="flex min-w-0 flex-1 flex-col gap-2 pointer-events-none">
          <div className="flex min-w-0 items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{row.fullName}</p>
              <p className="truncate text-xs text-muted-foreground">
                {subtitle}
              </p>
            </div>
            <TeamPresenceBadge
              shift={row.shift}
              onApprovedLeave={row.onApprovedLeave}
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {!row.onApprovedLeave ? (
              <CountBadge status={row.countStatus} />
            ) : null}
          </div>
        </div>
        <IconChevronRight className="size-4 shrink-0 text-muted-foreground pointer-events-none" />
      </button>
    </InteractiveCard>
  );
}

function TeamBoardMobileGroups({
  groups,
  onOpenDrawer,
}: {
  groups: TeamBoardShiftGroup[];
  onOpenDrawer: (row: TeamBoardDisplayRow) => void;
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
          <div className="grid gap-1.5 md:grid-cols-2">
            {group.rows.map((row) => (
              <MobileTeamCard
                key={row.key}
                row={row}
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
  branchId,
  countSlipsHref,
  checkoutApprovalsHref,
  canApproveCheckout,
  canApproveCount,
}: {
  rows: TeamBoardRow[];
  branchId: number;
  countSlipsHref: string;
  checkoutApprovalsHref: string;
  canApproveCheckout: boolean;
  canApproveCount: boolean;
}) {
  const displayRows = buildDisplayRows(rows);
  const capabilities = { canApproveCheckout, canApproveCount };
  const [filter, setFilter] = useState<TeamBoardFilter>(() =>
    initialTeamBoardFilter(displayRows, capabilities),
  );
  const [drawerRow, setDrawerRow] = useState<TeamBoardDisplayRow | null>(null);
  const [isForceClosing, startForceCloseTransition] = useTransition();
  const router = useRouter();
  const filteredRows = displayRows.filter((row) =>
    matchesTeamBoardFilter(row, filter, capabilities),
  );
  const filteredGroups = groupRowsByShift(filteredRows);

  if (displayRows.length === 0) {
    return (
      <AppEmptyState
        compact
        title={copy.emptyTitle}
        description={copy.emptyDescription}
        icon={<IconUsers />}
      />
    );
  }

  async function forceClose(row: TeamBoardDisplayRow) {
    const shift = row.shift;
    if (!shift || !isPastShiftEnd(shift)) return;

    const confirmed = await confirm({
      title: copy.forceCloseTitle,
      description: copy.forceCloseDescription,
      details: [
        { label: copy.columnEmployee, value: row.fullName },
        { label: copy.columnShift, value: shift.shiftName ?? copy.shiftNone },
        { label: copy.forceCloseWorkday, value: copy.forceCloseNoWorkday },
      ],
      confirmText: copy.drawerActionForceClose,
      variant: "destructive",
    });
    if (!confirmed) return;

    startForceCloseTransition(async () => {
      const result = await forceCloseStaleAttendance({
        attendanceId: shift.attendanceId,
        branchId,
      });
      if (!result.success) {
        toast.error(result.error ?? copy.forceCloseFailed);
        return;
      }

      toast.success(copy.forceCloseSuccess(row.fullName));
      setDrawerRow(null);
      router.refresh();
    });
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
          capabilities={capabilities}
        />

        {filteredGroups.length === 0 ? (
          <AppEmptyState
            compact
            title={filter === "all" ? copy.emptyTitle : copy.filteredEmptyTitle}
            description={
              filter === "all"
                ? copy.emptyDescription
                : copy.filteredEmptyDescription
            }
            icon={<IconUsers />}
            mode={filter === "all" ? "no-data" : "no-results"}
          />
        ) : (
          <TeamBoardMobileGroups
            groups={filteredGroups}
            onOpenDrawer={setDrawerRow}
          />
        )}
      </section>

      <Drawer
        open={!!drawerRow}
        onOpenChange={(open) => !open && setDrawerRow(null)}
      >
        <DrawerContent className="flex max-h-dvh-80 flex-col overflow-hidden sm:mx-auto sm:max-w-2xl">
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
                className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain p-4"
                data-vaul-no-drag=""
              >
                <div className="flex flex-col gap-3">
                  <div className="flex flex-wrap gap-2">
                    <TeamPresenceBadge
                      shift={drawerRow.shift}
                      onApprovedLeave={drawerRow.onApprovedLeave}
                    />
                    {!drawerRow.onApprovedLeave ? (
                      <CountBadge status={drawerRow.countStatus} />
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

                  <div className="workflow-safe-pb grid gap-2">
                    {canApproveCheckout && isPastShiftEnd(drawerRow.shift) ? (
                      <Button
                        variant="destructive"
                        size="touch"
                        className="w-full"
                        disabled={isForceClosing}
                        onClick={() => void forceClose(drawerRow)}
                      >
                        {copy.drawerActionForceClose}
                      </Button>
                    ) : null}
                    {canApproveCheckout &&
                    attendanceState(drawerRow.shift) === "checkout_pending" ? (
                      <Button
                        variant="default"
                        size="touch"
                        className="w-full"
                        onClick={() =>
                          router.push(
                            `${checkoutApprovalsHref}?attendanceId=${drawerRow.shift?.attendanceId}`,
                          )
                        }
                      >
                        {copy.drawerActionCheckout}
                      </Button>
                    ) : null}
                    {canApproveCount &&
                    drawerRow.countStatus === "submitted" ? (
                      <Button
                        variant={
                          attendanceState(drawerRow.shift) ===
                          "checkout_pending"
                            ? "outline"
                            : "default"
                        }
                        size="touch"
                        className="w-full"
                        onClick={() =>
                          router.push(
                            `${countSlipsHref}?employeeId=${drawerRow.employeeId}`,
                          )
                        }
                      >
                        {copy.drawerActionCountSubmitted}
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>
            </>
          )}
        </DrawerContent>
      </Drawer>
    </>
  );
}
