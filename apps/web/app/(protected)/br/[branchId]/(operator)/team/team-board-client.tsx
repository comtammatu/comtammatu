"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CalendarCheck,
  ChevronRight as IconChevronRight,
  ClipboardCheck,
  Clock as IconClock,
  Users as IconUsers,
} from "lucide-react";
import { formatCount } from "@comtammatu/shared/format";
import { formatVNTime } from "@comtammatu/shared/time";
import type { StaffRole } from "@comtammatu/shared/auth";

import { Button } from "@comtammatu/ui/components/button";
import { Badge } from "@comtammatu/ui/components/badge";
import { ReasonConfirmDialog } from "@comtammatu/ui/components/reason-confirm-dialog";
import { toast } from "@comtammatu/ui/components/sonner";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@comtammatu/ui/components/item";

import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@comtammatu/ui/components/drawer";
import { BranchOperatorPanel } from "@lib/branch-operator/components/branch-operator-page";
import { messages } from "@lib/messages";
import { TeamMemberTile } from "./_components/team-member-tile";
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
const branchCopy = messages.settings.branch;

type TeamBoardApprovalCounts = {
  checkoutPending?: number;
  leavePending?: number;
  countSlipsPending?: number;
};

type AttendanceState = "not_started" | "working" | "checkout_pending" | "done";
type TeamBoardFilter = "all" | "working" | "needs_action" | "count_missing";
type TeamBoardCapabilities = {
  canApproveCheckout: boolean;
  canApproveCount: boolean;
  approverRole: StaffRole;
};

export interface TeamBoardDisplayRow {
  key: string;
  employeeId: number;
  employeeCode: string | null;
  fullName: string;
  positionLabel: string | null;
  positionRole: StaffRole | "unassigned";
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
          positionRole: row.positionRole,
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
      positionRole: row.positionRole,
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
    (canApproveCheckoutForRow(row, capabilities) &&
      (isPastShiftEnd(row.shift) ||
        attendanceState(row.shift) === "checkout_pending")) ||
    (capabilities.canApproveCount && row.countStatus === "submitted")
  );
}

function canApproveCheckoutForRow(
  row: TeamBoardDisplayRow,
  capabilities: TeamBoardCapabilities,
) {
  if (!capabilities.canApproveCheckout) return false;
  if (capabilities.approverRole === "owner") return true;
  return (
    capabilities.approverRole === "branch_manager" &&
    (row.positionRole === "cashier" ||
      row.positionRole === "chef" ||
      row.positionRole === "branch_staff")
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
  const footerBadges = (
    <>
      <CountBadge status={row.countStatus} />
      {row.onApprovedLeave ? (
        <StatusBadge
          domain="leave-request"
          value="approved"
          label={copy.leaveApproved}
        />
      ) : null}
    </>
  );

  return (
    <TeamMemberTile
      name={row.fullName}
      subtitle={subtitle}
      badges={<AttendanceBadge shift={row.shift} />}
      footerBadges={footerBadges}
      ariaLabel={`Mở chi tiết ${row.fullName}`}
      layout="row"
      className={className}
      onSelect={() => onOpenDrawer(row)}
    />
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
          <div className="grid gap-1.5 lg:grid-cols-2">
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

function TeamApprovalsStrip({
  checkoutApprovalsHref,
  leaveApprovalsHref,
  countSlipsHref,
  canApproveCheckout,
  canApproveCount,
  approvalCounts,
}: {
  checkoutApprovalsHref: string;
  leaveApprovalsHref?: string;
  countSlipsHref: string;
  canApproveCheckout: boolean;
  canApproveCount: boolean;
  approvalCounts?: TeamBoardApprovalCounts;
}) {
  type ApprovalRow = {
    key: string;
    href: string;
    icon: typeof ClipboardCheck;
    title: string;
    count: number | undefined;
  };

  const rows: ApprovalRow[] = [];
  if (canApproveCheckout) {
    rows.push({
      key: "checkout",
      href: checkoutApprovalsHref,
      icon: ClipboardCheck,
      title: branchCopy.readinessCheckoutTitle,
      count: approvalCounts?.checkoutPending,
    });
  }
  if (leaveApprovalsHref) {
    rows.push({
      key: "leave",
      href: leaveApprovalsHref,
      icon: CalendarCheck,
      title: branchCopy.queueLeaveTitle,
      count: approvalCounts?.leavePending,
    });
  }
  if (canApproveCount) {
    rows.push({
      key: "count-slips",
      href: countSlipsHref,
      icon: ClipboardCheck,
      title: branchCopy.queueCountSlipsTitle,
      count: approvalCounts?.countSlipsPending,
    });
  }

  if (rows.length === 0) return null;

  const pendingTotal = rows.reduce(
    (sum, row) => sum + (row.count != null && row.count > 0 ? row.count : 0),
    0,
  );

  return (
    <BranchOperatorPanel
      title={copy.approvalsStripTitle}
      tone={pendingTotal > 0 ? "warning" : "default"}
      size="sm"
      headingLevel="h2"
      badge={
        pendingTotal > 0
          ? { children: String(pendingTotal), variant: "warning" }
          : undefined
      }
      className="mb-3"
    >
      <ItemGroup className="gap-2">
        {rows.map((row) => {
          const hasPending = row.count != null && row.count > 0;
          return (
            <Item
              key={row.key}
              variant={hasPending ? "outline" : "muted"}
              size="sm"
              className="chrome-tap min-h-12 select-none bg-card transition-transform motion-safe:active:scale-[0.97]"
              render={<Link href={row.href} />}
            >
              <ItemMedia
                variant="icon"
                className={
                  hasPending
                    ? "rounded-md bg-warning/10 p-2 text-warning"
                    : "rounded-md bg-muted p-2 text-muted-foreground"
                }
              >
                <row.icon aria-hidden="true" />
              </ItemMedia>
              <ItemContent className="min-w-0">
                <ItemTitle size="heading" className="line-clamp-none w-full">
                  {row.title}
                </ItemTitle>
              </ItemContent>
              <ItemActions className="shrink-0 text-muted-foreground">
                {hasPending ? (
                  <Badge variant="warning">{formatCount(row.count!)}</Badge>
                ) : null}
                <IconChevronRight aria-hidden="true" className="size-4" />
              </ItemActions>
            </Item>
          );
        })}
      </ItemGroup>
    </BranchOperatorPanel>
  );
}

export function TeamBoardClient({
  rows,
  branchId,
  countSlipsHref,
  checkoutApprovalsHref,
  leaveApprovalsHref,
  canApproveCheckout,
  canApproveCount,
  approverRole,
  approvalCounts,
}: {
  rows: TeamBoardRow[];
  branchId: number;
  countSlipsHref: string;
  checkoutApprovalsHref: string;
  leaveApprovalsHref?: string;
  canApproveCheckout: boolean;
  canApproveCount: boolean;
  approverRole: StaffRole;
  approvalCounts?: TeamBoardApprovalCounts;
}) {
  const displayRows = buildDisplayRows(rows);
  const capabilities = {
    canApproveCheckout,
    canApproveCount,
    approverRole,
  };
  const [filter, setFilter] = useState<TeamBoardFilter>(() =>
    initialTeamBoardFilter(displayRows, capabilities),
  );
  const [drawerRow, setDrawerRow] = useState<TeamBoardDisplayRow | null>(null);
  const [forceCloseRow, setForceCloseRow] =
    useState<TeamBoardDisplayRow | null>(null);
  const [forceCloseReason, setForceCloseReason] = useState("");
  const [isForceClosing, startForceCloseTransition] = useTransition();
  const router = useRouter();
  const filteredRows = displayRows.filter((row) =>
    matchesTeamBoardFilter(row, filter, capabilities),
  );
  const filteredGroups = groupRowsByShift(filteredRows);

  if (displayRows.length === 0) {
    return (
      <AppEmptyState
        title={copy.emptyTitle}
        description={copy.emptyDescription}
        icon={<IconUsers />}
      />
    );
  }

  function requestForceClose(row: TeamBoardDisplayRow) {
    const shift = row.shift;
    if (!shift || !isPastShiftEnd(shift)) return;
    setForceCloseReason("");
    setForceCloseRow(row);
  }

  function confirmForceClose() {
    const row = forceCloseRow;
    const shift = row?.shift;
    if (!row || !shift || !isPastShiftEnd(shift)) return;

    startForceCloseTransition(async () => {
      const result = await forceCloseStaleAttendance({
        attendanceId: shift.attendanceId,
        branchId,
        note: forceCloseReason.trim(),
      });
      if (!result.success) {
        toast.error(result.error ?? copy.forceCloseFailed);
        return;
      }

      toast.success(copy.forceCloseSuccess(row.fullName));
      setForceCloseRow(null);
      setForceCloseReason("");
      setDrawerRow(null);
      router.refresh();
    });
  }

  return (
    <>
      <TeamApprovalsStrip
        checkoutApprovalsHref={checkoutApprovalsHref}
        leaveApprovalsHref={leaveApprovalsHref}
        countSlipsHref={countSlipsHref}
        canApproveCheckout={canApproveCheckout}
        canApproveCount={canApproveCount}
        approvalCounts={approvalCounts}
      />
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
              <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain p-4">
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

                  <div className="workflow-safe-pb grid gap-2">
                    {canApproveCheckoutForRow(drawerRow, capabilities) &&
                    isPastShiftEnd(drawerRow.shift) ? (
                      <Button
                        variant="destructive"
                        size="touch"
                        className="w-full"
                        disabled={isForceClosing}
                        onClick={() => requestForceClose(drawerRow)}
                      >
                        {copy.drawerActionForceClose}
                      </Button>
                    ) : null}
                    {canApproveCheckoutForRow(drawerRow, capabilities) &&
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
      <ReasonConfirmDialog
        open={forceCloseRow !== null}
        onOpenChange={(open) => {
          if (!open && !isForceClosing) {
            setForceCloseRow(null);
            setForceCloseReason("");
          }
        }}
        title={copy.forceCloseTitle}
        description={copy.forceCloseDescription}
        reasonId="team-force-close-reason"
        reason={forceCloseReason}
        onReasonChange={setForceCloseReason}
        reasonLabel={copy.forceCloseReason}
        reasonPlaceholder={copy.forceCloseReasonPlaceholder}
        reasonMinLength={5}
        reasonTextareaProps={{ maxLength: 500, autoFocus: true }}
        cancelLabel={copy.forceCloseCancel}
        cancelDisabled={isForceClosing}
        confirmLabel={copy.drawerActionForceClose}
        confirmVariant="destructive"
        actionSize="touch"
        isPending={isForceClosing}
        onConfirm={confirmForceClose}
      />
    </>
  );
}
