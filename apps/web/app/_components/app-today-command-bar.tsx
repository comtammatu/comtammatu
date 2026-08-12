"use client";

import Link from "next/link";
import { Camera as IconCamera } from "lucide-react";
import { formatVNClockTime } from "@comtammatu/shared/time";
import { Button } from "@comtammatu/ui/components/button";
import { Frame } from "@comtammatu/ui/components/frame";
import type { TodayWorkState } from "@lib/staff-runtime/_lib/today-work-state";
import { useFormControlSize } from "@/components/form/control-size";
import { messages } from "@lib/messages";

const copy = messages.controlSurface.dashboard.todayBar;

function shouldRenderTodayBar(state: TodayWorkState): boolean {
  return (
    state.attendanceRequired &&
    state.status !== "missing_profile" &&
    state.status !== "not_required"
  );
}

function barTitle(state: TodayWorkState): string {
  if (state.status === "missing_branch") return copy.missingBranch;
  if (state.status === "not_started") return copy.notStarted;
  if (state.status === "working") return copy.working;
  if (state.status === "checkout_pending") return copy.checkoutPending;
  return copy.done;
}

function barMeta(state: TodayWorkState): string {
  const shiftName = state.attendance?.shiftName;
  if (state.status === "working" && state.attendance?.checkIn) {
    return `${copy.checkIn} ${formatVNClockTime(state.attendance.checkIn)}`;
  }
  if (shiftName) return `${copy.shift} · ${shiftName}`;
  if (state.status === "missing_branch") return copy.missingBranchHint;
  return copy.clockHint;
}

function barAction(state: TodayWorkState): { href: string; label: string } | null {
  if (state.status === "done") return null;
  if (state.status === "not_started" || state.status === "missing_branch") {
    return { href: "/me/clock", label: copy.clockIn };
  }
  if (state.status === "working") {
    return { href: "/me/clock", label: copy.clockOut };
  }
  if (state.status === "checkout_pending") {
    return { href: "/me/clock", label: copy.viewClock };
  }
  return { href: "/me/clock", label: copy.clockIn };
}

export function AppTodayCommandBar({ state }: { state: TodayWorkState }) {
  const controlSize = useFormControlSize();
  if (!shouldRenderTodayBar(state)) return null;

  const action = barAction(state);

  return (
    <Frame
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="flex items-center justify-between gap-2 px-3 py-2"
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{barTitle(state)}</p>
        <p className="truncate text-xs text-muted-foreground">{barMeta(state)}</p>
      </div>
      {action ? (
        <Button size={controlSize} render={<Link href={action.href} />}>
          <IconCamera data-icon="inline-start" />
          {action.label}
        </Button>
      ) : null}
    </Frame>
  );
}
