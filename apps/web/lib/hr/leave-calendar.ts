export type CalendarLeaveStatus = "pending" | "approved";

export interface CalendarLeaveRange {
  startDate: string;
  endDate: string;
  status: CalendarLeaveStatus;
}

function addDaysToISODate(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const shifted = new Date(Date.UTC(year!, month! - 1, day! + days));
  return shifted.toISOString().slice(0, 10);
}

export function expandLeaveRangesByDate(
  leaves: readonly CalendarLeaveRange[],
  monthStart: string,
  monthEnd: string,
): Map<string, CalendarLeaveStatus> {
  const leaveByDate = new Map<string, CalendarLeaveStatus>();

  for (const leave of leaves) {
    const from = leave.startDate > monthStart ? leave.startDate : monthStart;
    const to = leave.endDate < monthEnd ? leave.endDate : monthEnd;

    for (
      let date = from;
      date <= to;
      date = addDaysToISODate(date, 1)
    ) {
      if (leave.status === "approved" || !leaveByDate.has(date)) {
        leaveByDate.set(date, leave.status);
      }
    }
  }

  return leaveByDate;
}
