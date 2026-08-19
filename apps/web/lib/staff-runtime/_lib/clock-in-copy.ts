import {
  formatMinutesOfDay,
  formatVNClockTime,
} from "@comtammatu/shared/time";
import type { ClockInGate } from "./default-shift";

export type ClockInBlockedCopy = {
  statusClockInTooEarly: string;
  statusClockInTooLate: string;
  statusShiftUnassigned?: string;
  descriptionClockInTooEarly: (
    shiftName: string,
    startTime: string,
    fromTime: string,
  ) => string;
  descriptionClockInTooLate: (shiftName: string, endTime: string) => string;
  descriptionShiftUnassigned: string;
  descriptionMultipleShifts?: string;
};

export type ClockInBlockedMessage = {
  kind: "too_early" | "too_late" | "unassigned";
  title: string;
  description: string;
};

export function isClockInBlocked(state: {
  status: string;
  shiftUnassigned: boolean;
  clockInGate: ClockInGate;
}): boolean {
  return (
    state.status === "not_started" &&
    (state.clockInGate.kind === "too_early" ||
      state.clockInGate.kind === "too_late" ||
      state.clockInGate.kind === "unassigned" ||
      state.clockInGate.kind === "multiple" ||
      state.shiftUnassigned)
  );
}

export function getClockInBlockedMessage(
  gate: ClockInGate,
  copy: ClockInBlockedCopy,
): ClockInBlockedMessage | null {
  if (gate.kind === "too_early") {
    const shiftName = gate.shiftName ?? "";
    return {
      kind: "too_early",
      title: copy.statusClockInTooEarly,
      description: copy.descriptionClockInTooEarly(
        shiftName,
        formatVNClockTime(gate.startTime),
        formatMinutesOfDay(gate.clockInFromMinutes),
      ),
    };
  }
  if (gate.kind === "too_late") {
    return {
      kind: "too_late",
      title: copy.statusClockInTooLate,
      description: copy.descriptionClockInTooLate(
        gate.shiftName ?? "",
        formatVNClockTime(gate.endTime),
      ),
    };
  }
  if (gate.kind === "unassigned" || gate.kind === "multiple") {
    return {
      kind: "unassigned",
      title: copy.statusShiftUnassigned ?? copy.statusClockInTooEarly,
      description:
        gate.kind === "multiple"
          ? (copy.descriptionMultipleShifts ?? copy.descriptionShiftUnassigned)
          : copy.descriptionShiftUnassigned,
    };
  }
  return null;
}
