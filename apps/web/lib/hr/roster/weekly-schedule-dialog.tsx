"use client";

import { useMemo } from "react";
import { z } from "zod";
import { Button } from "@comtammatu/ui/components/button";
import { confirm } from "@/components/confirm-dialog";
import { toast } from "@comtammatu/ui/components/sonner";
import { FormDialog, SelectField, BusinessDateField } from "@/components/form";
import { messages } from "@lib/messages";
import { getVNDateString } from "@comtammatu/shared/time";
import { saveEmployeeWeeklySchedule } from "./actions";
import {
  ROSTER_WEEKDAY_KEYS,
  type EmployeeWeeklySchedule,
  type RosterEmployee,
  type RosterShift,
  type RosterWeekdayKey,
} from "./roster-model";

const OFF = "__off__";
const copy = messages.hr.roster;

const weekdayLabels: Record<RosterWeekdayKey, string> = {
  monday: "Thứ 2",
  tuesday: "Thứ 3",
  wednesday: "Thứ 4",
  thursday: "Thứ 5",
  friday: "Thứ 6",
  saturday: "Thứ 7",
  sunday: "Chủ nhật",
};

const scheduleFormSchema = z
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
    if (ROSTER_WEEKDAY_KEYS.every((day) => values[day] === OFF)) {
      context.addIssue({
        code: "custom",
        path: ["monday"],
        message: copy.selectAtLeastOneDay,
      });
    }
  });

type ScheduleFormValues = z.infer<typeof scheduleFormSchema>;

export function WeeklyScheduleDialog({
  open,
  onOpenChange,
  branchId,
  employee,
  shifts,
  schedule,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branchId: number | null;
  employee: RosterEmployee | null;
  shifts: RosterShift[];
  schedule: EmployeeWeeklySchedule | null;
  onSaved: () => void;
}) {
  const shiftOptions = useMemo(
    () =>
      shifts.map((shift) => ({
        value: String(shift.id),
        label: `${shift.name} (${shift.startTime.slice(0, 5)}–${shift.endTime.slice(0, 5)})`,
      })),
    [shifts],
  );
  const dayOptions = useMemo(
    () => [{ value: OFF, label: copy.dayOff }, ...shiftOptions],
    [shiftOptions],
  );
  const defaultValues = useMemo<ScheduleFormValues>(() => {
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
          String(schedule?.shiftsByDay[day] ?? OFF),
        ]),
      ),
    } as ScheduleFormValues;
  }, [employee?.startDate, schedule, shifts]);

  async function handleSubmit(values: ScheduleFormValues) {
    if (!employee)
      return { success: false as const, error: copy.employeeNotFound };
    if (employee.startDate && values.effectiveFrom < employee.startDate) {
      return {
        success: false as const,
        error: copy.scheduleBeforeEmployeeStart,
      };
    }
    const result = await saveEmployeeWeeklySchedule({
      branchId,
      employeeId: employee.employeeId,
      effectiveFrom: values.effectiveFrom,
      days: ROSTER_WEEKDAY_KEYS.flatMap((day, index) =>
        values[day] === OFF
          ? []
          : [{ weekday: index + 1, shiftId: Number(values[day]) }],
      ),
    });
    if (result.success) onSaved();
    return result;
  }

  async function clearSchedule() {
    if (!employee || !schedule) return;
    const approved = await confirm({
      title: copy.clearScheduleTitle,
      description: copy.clearScheduleDescription(employee.fullName),
      confirmText: copy.clearSchedule,
      cancelText: copy.cancel,
      variant: "destructive",
    });
    if (!approved) return;
    const result = await saveEmployeeWeeklySchedule({
      branchId,
      employeeId: employee.employeeId,
      effectiveFrom: schedule.effectiveFrom,
      days: [],
    });
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success(copy.clearScheduleSuccess);
    onOpenChange(false);
    onSaved();
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={employee ? copy.scheduleTitle(employee.fullName) : copy.schedule}
      description={copy.scheduleDescription}
      schema={scheduleFormSchema}
      defaultValues={defaultValues}
      entityKey={`${employee?.employeeId ?? "none"}:${schedule?.effectiveFrom ?? "new"}`}
      onSubmit={handleSubmit}
      successMessage={copy.saveScheduleSuccess}
      submitLabel={copy.saveSchedule}
      contentClassName="sm:max-w-2xl"
    >
      {(form) => {
        const presetShift = form.watch("presetShift");
        const applyPreset = (workdayCount: 5 | 6 | 7) => {
          if (!presetShift) return;
          ROSTER_WEEKDAY_KEYS.forEach((day, index) => {
            form.setValue(day, index < workdayCount ? presetShift : OFF, {
              shouldDirty: true,
              shouldValidate: true,
            });
          });
        };

        return (
          <>
            <BusinessDateField
              control={form.control}
              name="effectiveFrom"
              label={copy.effectiveFrom}
              min={employee?.startDate ?? undefined}
              description={
                employee?.startDate
                  ? copy.employeeStartDate(employee.startDate)
                  : copy.missingEmployeeStartDate
              }
              required
            />
            <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <SelectField
                control={form.control}
                name="presetShift"
                label={copy.presetShift}
                options={shiftOptions}
                placeholder={copy.selectShift}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => applyPreset(5)}
                >
                  {copy.mondayToFriday}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => applyPreset(6)}
                >
                  {copy.mondayToSaturday}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => applyPreset(7)}
                >
                  {copy.allWeek}
                </Button>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {ROSTER_WEEKDAY_KEYS.map((day) => (
                <SelectField
                  key={day}
                  control={form.control}
                  name={day}
                  label={weekdayLabels[day]}
                  options={dayOptions}
                />
              ))}
            </div>
            {schedule ? (
              <div className="border-t pt-4">
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => void clearSchedule()}
                >
                  {copy.clearSchedule}
                </Button>
              </div>
            ) : null}
          </>
        );
      }}
    </FormDialog>
  );
}
