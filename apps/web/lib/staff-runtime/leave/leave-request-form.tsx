"use client";

import { useEffect, useTransition } from "react";
import { useForm, type UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { LEAVE_TYPE_LABELS_VI } from "@comtammatu/shared/labels";
import { formatVNBusinessDate, getVNDateString } from "@comtammatu/shared/time";
import { Button } from "@comtammatu/ui/components/button";
import { toast } from "@comtammatu/ui/components/sonner";
import { BusinessDateField, SelectField, TextareaField } from "@/components/form";
import { messages } from "@lib/messages";
import { submitLeaveRequest } from "./actions";

const copy = messages.employee.leave;

export const LEAVE_TYPES = [
  "annual",
  "sick",
  "unpaid",
  "personal",
  "other",
] as const;

export const LEAVE_TYPE_OPTIONS = LEAVE_TYPES.map((value) => ({
  value,
  label: LEAVE_TYPE_LABELS_VI[value],
}));

export const leaveRequestSchema = z
  .object({
    startDate: z.string().min(1),
    endDate: z.string().min(1),
    leaveType: z.enum(LEAVE_TYPES),
    reason: z.string().trim().max(500).optional(),
  })
  .refine((values) => values.endDate >= values.startDate, {
    path: ["endDate"],
    error: "Ngày kết thúc phải sau ngày bắt đầu.",
  });

export type LeaveRequestFormValues = z.infer<typeof leaveRequestSchema>;

export function leaveRequestDefaults(
  startDate = getVNDateString(),
): LeaveRequestFormValues {
  return {
    startDate,
    endDate: startDate,
    leaveType: "annual",
    reason: "",
  };
}

export function formatLeaveDateRange(startDate: string, endDate: string): string {
  if (startDate === endDate) return formatVNBusinessDate(startDate);
  return `${formatVNBusinessDate(startDate)} - ${formatVNBusinessDate(endDate)}`;
}

export function countInclusiveDays(
  startDate: string,
  endDate: string,
): number | null {
  const [startYear, startMonth, startDay] = startDate.split("-").map(Number);
  const [endYear, endMonth, endDay] = endDate.split("-").map(Number);

  if (
    !Number.isFinite(startYear) ||
    !Number.isFinite(startMonth) ||
    !Number.isFinite(startDay) ||
    !Number.isFinite(endYear) ||
    !Number.isFinite(endMonth) ||
    !Number.isFinite(endDay)
  ) {
    return null;
  }

  const startUtc = Date.UTC(startYear!, startMonth! - 1, startDay!);
  const endUtc = Date.UTC(endYear!, endMonth! - 1, endDay!);
  const days = Math.round((endUtc - startUtc) / 86_400_000) + 1;
  return days > 0 ? days : null;
}

export function LeaveRequestFields({
  form,
  todayIso,
  hideStartDate = false,
}: {
  form: UseFormReturn<LeaveRequestFormValues>;
  todayIso: string;
  hideStartDate?: boolean;
}) {
  const startDate = form.watch("startDate");
  const endDate = form.watch("endDate");
  const durationDays = countInclusiveDays(startDate, endDate);

  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {hideStartDate ? null : (
          <BusinessDateField
            control={form.control}
            name="startDate"
            label={copy.startDate}
            min={todayIso}
          />
        )}
        <BusinessDateField
          control={form.control}
          name="endDate"
          label={copy.endDate}
          min={startDate || todayIso}
        />
      </div>

      <SelectField
        control={form.control}
        name="leaveType"
        label={copy.leaveType}
        options={LEAVE_TYPE_OPTIONS}
      />

      <TextareaField
        control={form.control}
        name="reason"
        label={copy.reason}
        maxLength={500}
        placeholder={copy.reasonPlaceholder}
      />

      {durationDays !== null ? (
        <p className="text-xs text-muted-foreground">
          {formatLeaveDateRange(startDate, endDate)} · {durationDays}{" "}
          {copy.dayUnit}
        </p>
      ) : null}
    </>
  );
}

export function DayLeaveRequestForm({
  branchId,
  startDate,
  title,
  onSubmitted,
}: {
  branchId: number | null;
  startDate: string;
  title?: string;
  onSubmitted: (values: LeaveRequestFormValues) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const todayIso = getVNDateString();
  const form = useForm<LeaveRequestFormValues, unknown, LeaveRequestFormValues>({
    resolver: zodResolver(leaveRequestSchema),
    defaultValues: leaveRequestDefaults(startDate),
  });

  useEffect(() => {
    form.reset(leaveRequestDefaults(startDate));
  }, [form, startDate]);

  function handleSubmit(values: LeaveRequestFormValues) {
    const reason = values.reason?.trim() ?? "";
    startTransition(async () => {
      const result = await submitLeaveRequest({
        branchId,
        startDate: values.startDate,
        endDate: values.endDate,
        leaveType: values.leaveType,
        reason: reason || undefined,
      });
      if (!result.success) {
        toast.error(result.error ?? copy.submitFailed);
        return;
      }
      toast.success(copy.submittedToast);
      onSubmitted(values);
    });
  }

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={form.handleSubmit(handleSubmit)}
    >
      {title ? <p className="text-sm font-medium">{title}</p> : null}
      <LeaveRequestFields form={form} todayIso={todayIso} hideStartDate />
      <Button type="submit" size="touch" className="w-full" disabled={isPending}>
        {copy.submit}
      </Button>
    </form>
  );
}
