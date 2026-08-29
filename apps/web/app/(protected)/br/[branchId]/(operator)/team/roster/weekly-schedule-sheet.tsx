"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { ACTIONS_VI } from "@comtammatu/shared/messages";
import { Button } from "@comtammatu/ui/components/button";
import { Field, FieldDescription, FieldLabel } from "@comtammatu/ui/components/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { confirm } from "@/components/confirm-dialog";
import { BusinessDatePicker } from "@/components/form";
import { toast } from "@comtammatu/ui/components/sonner";
import { AppSheet } from "@/components/surface";
import { messages } from "@lib/messages";
import { saveEmployeeWeeklySchedule } from "@lib/hr/roster/actions";
import {
  ROSTER_WEEKDAY_KEYS,
  type EmployeeWeeklySchedule,
  type RosterEmployee,
  type RosterShift,
  type RosterWeekdayKey,
} from "@lib/hr/roster/roster-model";
import {
  WEEKLY_SCHEDULE_OFF,
  WEEKLY_SCHEDULE_WEEKDAY_LABELS,
  weeklyScheduleDaysPayload,
  weeklyScheduleDefaults,
  weeklyScheduleFormSchema,
  weeklyScheduleShiftOptions,
  type WeeklyScheduleFormValues,
} from "@lib/hr/roster/weekly-schedule-form";

const copy = messages.hr.roster;

export function WeeklyScheduleSheet({
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
  const [values, setValues] = useState<WeeklyScheduleFormValues>(() =>
    weeklyScheduleDefaults(employee, shifts, schedule),
  );
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    setValues(weeklyScheduleDefaults(employee, shifts, schedule));
  }, [employee, open, schedule, shifts]);

  const shiftOptions = useMemo(
    () => weeklyScheduleShiftOptions(shifts, employee),
    [shifts, employee],
  );

  const dayOptions = useMemo(
    () => [{ value: WEEKLY_SCHEDULE_OFF, label: copy.dayOff }, ...shiftOptions],
    [shiftOptions],
  );

  function patch(partial: Partial<WeeklyScheduleFormValues>) {
    setValues((current) => ({ ...current, ...partial }));
  }

  function applyPreset(workdayCount: 5 | 6 | 7) {
    if (!values.presetShift) return;
    const next = { ...values };
    ROSTER_WEEKDAY_KEYS.forEach((day, index) => {
      next[day] = index < workdayCount ? values.presetShift : WEEKLY_SCHEDULE_OFF;
    });
    setValues(next);
  }

  function setDay(day: RosterWeekdayKey, value: string) {
    patch({ [day]: value });
  }

  function save() {
    if (!employee) {
      toast.error(copy.employeeNotFound);
      return;
    }
    const parsed = weeklyScheduleFormSchema.safeParse(values);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? copy.invalidEffectiveDate);
      return;
    }
    if (employee.startDate && parsed.data.effectiveFrom < employee.startDate) {
      toast.error(copy.scheduleBeforeEmployeeStart);
      return;
    }

    startTransition(async () => {
      const result = await saveEmployeeWeeklySchedule({
        branchId,
        employeeId: employee.employeeId,
        effectiveFrom: parsed.data.effectiveFrom,
        days: weeklyScheduleDaysPayload(parsed.data),
      });
      if (!result.success) {
        toast.error(result.error ?? copy.saveSchedule);
        return;
      }
      toast.success(copy.saveScheduleSuccess);
      onOpenChange(false);
      onSaved();
    });
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
    startTransition(async () => {
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
    });
  }

  return (
    <AppSheet
      open={open}
      onOpenChange={onOpenChange}
      title={employee ? copy.scheduleTitle(employee.fullName) : copy.schedule}
      description={copy.scheduleDescription}
      side="bottom"
      contentClassName="max-h-dvh-95"
      footerClassName="sticky bottom-0 border-t"
      footer={
        <div className="flex w-full gap-2">
          <Button
            type="button"
            variant="outline"
            size="touch"
            className="flex-1"
            disabled={isPending}
            onClick={() => onOpenChange(false)}
          >
            {ACTIONS_VI.close}
          </Button>
          <Button
            type="button"
            size="touch-lg"
            className="flex-1"
            disabled={isPending}
            onClick={save}
          >
            {isPending ? <Spinner className="size-5" /> : null}
            {copy.saveSchedule}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <Field>
          <FieldLabel>{copy.effectiveFrom}</FieldLabel>
          <BusinessDatePicker
            value={values.effectiveFrom}
            onValueChange={(effectiveFrom) => patch({ effectiveFrom })}
            min={employee?.startDate ?? undefined}
            aria-label={copy.effectiveFrom}
            className="min-h-12 w-full"
          />
          <FieldDescription>
            {employee?.startDate
              ? copy.employeeStartDate(employee.startDate)
              : copy.missingEmployeeStartDate}
          </FieldDescription>
        </Field>

        <Field>
          <FieldLabel>{copy.presetShift}</FieldLabel>
          <Select
            value={values.presetShift}
            onValueChange={(presetShift) => patch({ presetShift })}
          >
            <SelectTrigger size="touch">
              <SelectValue placeholder={copy.selectShift} />
            </SelectTrigger>
            <SelectContent>
              {shiftOptions.map((option) => (
                <SelectItem key={option.value} value={option.value} size="touch">
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="touch"
            onClick={() => applyPreset(5)}
          >
            {copy.mondayToFriday}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="touch"
            onClick={() => applyPreset(6)}
          >
            {copy.mondayToSaturday}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="touch"
            onClick={() => applyPreset(7)}
          >
            {copy.allWeek}
          </Button>
        </div>

        {ROSTER_WEEKDAY_KEYS.map((day) => (
          <Field key={day}>
            <FieldLabel>{WEEKLY_SCHEDULE_WEEKDAY_LABELS[day]}</FieldLabel>
            <Select
              value={values[day]}
              onValueChange={(value) => setDay(day, value)}
            >
              <SelectTrigger size="touch">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {dayOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value} size="touch">
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        ))}

        {schedule ? (
          <Button
            type="button"
            variant="destructive"
            size="touch"
            disabled={isPending}
            onClick={() => void clearSchedule()}
          >
            {copy.clearSchedule}
          </Button>
        ) : null}
      </div>
    </AppSheet>
  );
}
