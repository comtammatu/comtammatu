import Link from "next/link";
import { Camera as IconCamera } from "lucide-react";
import { formatVNClockTime } from "@comtammatu/shared/time";
import { Button } from "@comtammatu/ui/components/button";
import { BranchOperatorControlBar } from "@lib/branch-operator/components/branch-operator-page";
import {
  getTodayWorkState,
  type TodayWorkState,
} from "@lib/staff-runtime/_lib/today-work-state";
import { formatDateVN } from "@lib/staff-runtime/_lib/vn-business-date";
import { messages } from "@lib/messages";

const copy = messages.operator.todayStatus;

function getWorkTitle(state: TodayWorkState): string {
  const status = state.status;
  if (state.managerAttendanceOnly) {
    if (status === "working") return copy.managerAttendanceTitle;
    if (status === "done") return copy.statusDone;
    if (status === "not_started") return copy.statusNotStarted;
  }

  if (status === "missing_profile") return copy.statusNoProfile;
  if (status === "missing_branch") return copy.statusNoBranch;
  if (status === "not_required") return copy.statusNotRequired;
  if (status === "not_started") return copy.statusNotStarted;
  if (status === "working") return copy.statusWorking;
  if (status === "checkout_pending") return copy.statusCheckoutPending;
  return copy.statusDone;
}

export async function HubTodayStatus({ branchId }: { branchId: number }) {
  const state = await getTodayWorkState();
  const title = getWorkTitle(state);
  const currentShiftName = state.attendance?.shiftName ?? null;
  const currentShiftRange = state.attendance?.shiftStartTime
    ? `${formatVNClockTime(state.attendance.shiftStartTime)} - ${formatVNClockTime(state.attendance.shiftEndTime)}`
    : "—";
  const todayMeta = currentShiftName
    ? `${formatDateVN(state.today)} · ${currentShiftName} ${currentShiftRange}`
    : formatDateVN(state.today);

  return (
    <BranchOperatorControlBar>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{title}</p>
        <p className="truncate text-xs text-muted-foreground">{todayMeta}</p>
      </div>
      {state.status === "not_started" ? (
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
