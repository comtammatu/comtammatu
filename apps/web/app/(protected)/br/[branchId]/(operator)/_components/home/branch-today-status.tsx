import Link from "next/link";
import { Camera as IconCamera } from "lucide-react";
import { formatVNClockTime } from "@comtammatu/shared/time";
import { Button } from "@comtammatu/ui/components/button";
import { BranchOperatorControlBar } from "@lib/branch-operator/components/branch-operator-page";
import {
  getTodayWorkState,
  type TodayWorkState,
} from "@lib/staff-runtime/_lib/today-work-state";
import {
  getClockInBlockedMessage,
  isClockInBlocked,
} from "@lib/staff-runtime/_lib/clock-in-copy";
import { formatDateVN } from "@lib/staff-runtime/_lib/vn-business-date";
import { messages } from "@lib/messages";

const copy = messages.operator.todayStatus;
const shiftCopy = messages.operator.shift;

function getWorkTitle(state: TodayWorkState): string {
  const status = state.status;
  if (state.managerAttendanceOnly) {
    if (status === "working") return copy.managerAttendanceTitle;
    if (status === "done") return copy.statusDone;
    if (status === "not_started") return copy.statusNotStarted;
  }

  if (status === "missing_profile") return copy.statusNoProfile;
  if (status === "missing_branch") return copy.statusNoBranch;
  if (status === "not_started") {
    const blocked = getClockInBlockedMessage(state.clockInGate, shiftCopy);
    if (blocked) return blocked.title;
    return copy.statusNotStarted;
  }
  if (status === "working") return copy.statusWorking;
  if (status === "checkout_pending") return copy.statusCheckoutPending;
  return copy.statusDone;
}

export async function BranchTodayStatus({
  branchId,
}: {
  branchId: number;
}) {
  const state = await getTodayWorkState();
  if (state.status === "not_required") return null;

  const title = getWorkTitle(state);
  const blocked = getClockInBlockedMessage(state.clockInGate, shiftCopy);
  const currentShift =
    state.todayShifts.find((shift) => shift.isCurrent) ??
    state.todayShifts[0] ??
    null;
  const currentShiftName =
    state.attendance?.shiftName ?? currentShift?.shiftName ?? null;
  const currentShiftStart =
    state.attendance?.shiftStartTime ?? currentShift?.startTime ?? null;
  const currentShiftEnd =
    state.attendance?.shiftEndTime ?? currentShift?.endTime ?? null;
  const currentShiftRange = currentShiftStart
    ? `${formatVNClockTime(currentShiftStart)} - ${formatVNClockTime(currentShiftEnd)}`
    : "—";
  const todayMeta = blocked?.description
    ? blocked.description
    : currentShiftName
      ? `${formatDateVN(state.today)} · ${currentShiftName} ${currentShiftRange}`
      : formatDateVN(state.today);

  return (
    <BranchOperatorControlBar
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{title}</p>
        <p className="truncate text-xs text-muted-foreground">{todayMeta}</p>
      </div>
      {state.status === "not_started" && !isClockInBlocked(state) ? (
        <Button
          size="touch"
          render={<Link href={`/br/${branchId}/shift/clock`} />}
        >
          <IconCamera data-icon="inline-start" />
          {copy.clockIn}
        </Button>
      ) : null}
    </BranchOperatorControlBar>
  );
}
