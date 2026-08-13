import { z } from "zod";
import { getVNDateString } from "@comtammatu/shared/time";
import { messages } from "@lib/messages";
import {
  ROSTER_WEEKDAY_KEYS,
  type EmployeeWeeklySchedule,
  type RosterEmployee,
  type RosterShift,
  type RosterWeekdayKey,
} from "./roster-model";

export const WEEKLY_SCHEDULE_OFF = "__off__";

const copy = messages.hr.roster;

export const WEEKLY_SCHEDULE_WEEKDAY_LABELS: Record<RosterWeekdayKey, string> = {
  monday: copy.weekdayMonday,
  tuesday: copy.weekdayTuesday,
  wednesday: copy.weekdayWednesday,
  thursday: copy.weekdayThursday,
  friday: copy.weekdayFriday,
  saturday: copy.weekdaySaturday,
  sunday: copy.weekdaySunday,
};

export const weeklyScheduleFormSchema = z
  .object({
    effectiveFrom: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, copy.invalidEffectiveDate),
    presetShift: z.string(),
    monday: z.string(),
    tuesday: z.string(),
    wednesday: z.string(),
    thursday: z.string(),
    friday: z.string(),
    saturday: z.string(),
    sunday: z.string(),
  })
  .superRefine((values, context) => {
    if (ROSTER_WEEKDAY_KEYS.every((day) => values[day] === WEEKLY_SCHEDULE_OFF)) {
      context.addIssue({
        code: "custom",
        path: ["monday"],
        message: copy.selectAtLeastOneDay,
      });
    }
  });

export type WeeklyScheduleFormValues = z.infer<typeof weeklyScheduleFormSchema>;

export function weeklyScheduleShiftOptions(shifts: RosterShift[]) {
  return shifts.map((shift) => ({
    value: String(shift.id),
    label: `${shift.name} (${shift.startTime.slice(0, 5)}–${shift.endTime.slice(0, 5)})`,
  }));
}

export function weeklyScheduleDefaults(
  employee: RosterEmployee | null,
  shifts: RosterShift[],
  schedule: EmployeeWeeklySchedule | null,
): WeeklyScheduleFormValues {
  const firstAssignedShift = schedule
    ? ROSTER_WEEKDAY_KEYS.map((day) => schedule.shiftsByDay[day]).find(
        (shiftId) => shiftId != null,
      )
    : null;
  return {
    effectiveFrom:
      schedule?.effectiveFrom ?? employee?.startDate ?? getVNDateString(),
    presetShift: String(firstAssignedShift ?? shifts[0]?.id ?? ""),
    ...Object.fromEntries(
      ROSTER_WEEKDAY_KEYS.map((day) => [
        day,
        String(schedule?.shiftsByDay[day] ?? WEEKLY_SCHEDULE_OFF),
      ]),
    ),
  } as WeeklyScheduleFormValues;
}

export function weeklyScheduleDaysPayload(values: WeeklyScheduleFormValues) {
  return ROSTER_WEEKDAY_KEYS.flatMap((day, index) =>
    values[day] === WEEKLY_SCHEDULE_OFF
      ? []
      : [{ weekday: index + 1, shiftId: Number(values[day]) }],
  );
}
