"use client";

import { useMemo } from "react";
import { Button } from "@comtammatu/ui/components/button";
import { confirm } from "@/components/confirm-dialog";
import { toast } from "@comtammatu/ui/components/sonner";
import { FormDialog, SelectField, BusinessDateField } from "@/components/form";
import { messages } from "@lib/messages";
import { saveEmployeeWeeklySchedule } from "./actions";
import {
  ROSTER_WEEKDAY_KEYS,
  type EmployeeWeeklySchedule,
  type RosterEmployee,
  type RosterShift,
} from "./roster-model";
import {
  WEEKLY_SCHEDULE_OFF,
  WEEKLY_SCHEDULE_WEEKDAY_LABELS,
  weeklyScheduleDaysPayload,
  weeklyScheduleDefaults,
  weeklyScheduleFormSchema,
  weeklyScheduleShiftOptions,
  type WeeklyScheduleFormValues,
} from "./weekly-schedule-form";

const copy = messages.hr.roster;

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
    () => weeklyScheduleShiftOptions(shifts),
    [shifts],
  );
  const dayOptions = useMemo(
    () => [{ value: WEEKLY_SCHEDULE_OFF, label: copy.dayOff }, ...shiftOptions],
    [shiftOptions],
  );
  const defaultValues = useMemo<WeeklyScheduleFormValues>(
    () => weeklyScheduleDefaults(employee, shifts, schedule),
    [employee, schedule, shifts],
  );

  async function handleSubmit(values: WeeklyScheduleFormValues) {
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
      days: weeklyScheduleDaysPayload(values),
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
      schema={weeklyScheduleFormSchema}
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
            form.setValue(
              day,
              index < workdayCount ? presetShift : WEEKLY_SCHEDULE_OFF,
              {
                shouldDirty: true,
                shouldValidate: true,
              },
            );
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
                  label={WEEKLY_SCHEDULE_WEEKDAY_LABELS[day]}
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
