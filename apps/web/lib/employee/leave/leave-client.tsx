"use client";

import { useMemo, useState, useTransition } from "react";
import { z } from "zod";
import {
  CalendarX as IconCalendarX,
  Plus as IconPlus,
  X as IconX,
} from "lucide-react";
import { ACTIONS_VI, BRANCH_VI } from "@comtammatu/shared/messages";
import { LEAVE_TYPE_LABELS_VI } from "@comtammatu/shared/labels";
import { formatVNBusinessDate, getVNDateString } from "@comtammatu/shared/time";
import { Button } from "@comtammatu/ui/components/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { toast } from "@comtammatu/ui/components/sonner";
import {
  EmployeeActionBar,
  EmployeePanel,
  EmployeeStatusStrip,
} from "../components/employee-page";
import { cancelLeaveRequest, submitLeaveRequest } from "./actions";
import type { LeaveRequestRow } from "./page";
import { messages } from "@lib/messages";
import { AppEmptyState } from "@/components/surface";
import {
  FormDialog,
  SelectField,
  TextareaField,
  TextField,
} from "@/components/form";
import { StatusBadge } from "@/components/status-badge";

interface LeaveRequestClientProps {
  branchId: number;
  branchName: string | null;
  initialRequests: LeaveRequestRow[];
}

const copy = messages.employee.leave;

const LEAVE_TYPES = ["annual", "sick", "unpaid", "personal", "other"] as const;

const LEAVE_TYPE_OPTIONS = LEAVE_TYPES.map((value) => ({
  value,
  label: LEAVE_TYPE_LABELS_VI[value],
}));

const leaveRequestSchema = z
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

type LeaveRequestFormValues = z.infer<typeof leaveRequestSchema>;

function leaveRequestDefaults(): LeaveRequestFormValues {
  const today = getVNDateString();
  return {
    startDate: today,
    endDate: today,
    leaveType: "annual",
    reason: "",
  };
}

function formatDateRange(startDate: string, endDate: string): string {
  if (startDate === endDate) return formatVNBusinessDate(startDate);
  return `${formatVNBusinessDate(startDate)} - ${formatVNBusinessDate(endDate)}`;
}

function countInclusiveDays(startDate: string, endDate: string): number | null {
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

export function LeaveRequestClient({
  branchId,
  branchName,
  initialRequests,
}: LeaveRequestClientProps) {
  const [requests, setRequests] = useState<LeaveRequestRow[]>(initialRequests);
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const defaultValues = useMemo(() => leaveRequestDefaults(), [open]);
  const todayIso = defaultValues.startDate;
  const durationDays = countInclusiveDays(
    defaultValues.startDate,
    defaultValues.endDate,
  );

  async function handleSubmit(values: LeaveRequestFormValues) {
    const reason = values.reason?.trim() ?? "";
    const result = await submitLeaveRequest({
      branchId,
      startDate: values.startDate,
      endDate: values.endDate,
      leaveType: values.leaveType,
      reason: reason || undefined,
    });

    if (!result.success) {
      return result;
    }

    const requestId = (result.data as { requestId: number }).requestId;
    const newRequest: LeaveRequestRow = {
      id: requestId,
      branch_id: branchId,
      employee_id: 0,
      status: "pending",
      start_date: values.startDate,
      end_date: values.endDate,
      leave_type: values.leaveType,
      reason: reason || null,
      rejected_reason: null,
      created_at: new Date().toISOString(),
      reviewed_at: null,
    };

    setRequests((prev) =>
      [newRequest, ...prev].sort((a, b) =>
        b.start_date.localeCompare(a.start_date),
      ),
    );
    return result;
  }

  function handleCancel(request: LeaveRequestRow) {
    startTransition(async () => {
      const result = await cancelLeaveRequest({ requestId: request.id });
      if (!result.success) {
        toast.error(result.error ?? "Không thể huỷ yêu cầu nghỉ");
        return;
      }
      toast.success(copy.cancelledToast);
      setRequests((prev) =>
        prev.map((item) =>
          item.id === request.id ? { ...item, status: "cancelled" } : item,
        ),
      );
    });
  }

  return (
    <>
      <EmployeePanel
        icon={IconCalendarX}
        title={copy.newRequestTitle}
        description={copy.newRequestDescription}
      >
        <div className="flex flex-col gap-3">
          <EmployeeStatusStrip
            items={[
              {
                label: BRANCH_VI.long,
                value: branchName ?? messages.employee.profile.noBranch,
                muted: !branchName,
              },
              {
                label: copy.selectedRange,
                value:
                  durationDays === null ? "Chưa chọn" : `${durationDays} ngày`,
                muted: durationDays === null,
              },
            ]}
          />
          <EmployeeActionBar>
            <Button
              type="button"
              size="touch"
              className="w-full sm:w-fit"
              onClick={() => setOpen(true)}
              disabled={isPending}
            >
              <IconPlus data-icon="inline-start" />
              {copy.newRequestButton}
            </Button>
          </EmployeeActionBar>
        </div>
      </EmployeePanel>

      <EmployeePanel
        title={copy.myRequestsTitle}
        description={copy.myRequestsDescription}
      >
        {requests.length === 0 ? (
          <AppEmptyState
            title={copy.emptyTitle}
            description={copy.emptyDescription}
            icon={<IconCalendarX />}
          />
        ) : (
          <ItemGroup>
            {requests.map((request) => {
              const days = countInclusiveDays(
                request.start_date,
                request.end_date,
              );
              return (
                <Item key={request.id} variant="outline">
                  <ItemContent>
                    <ItemTitle>
                      {LEAVE_TYPE_LABELS_VI[request.leave_type]}
                      <StatusBadge
                        domain="leave-request"
                        value={request.status}
                      />
                    </ItemTitle>
                    <ItemDescription>
                      {formatDateRange(request.start_date, request.end_date)}
                      {days ? ` · ${days} ngày` : null}
                      {request.reason ? ` · ${request.reason}` : null}
                    </ItemDescription>
                    {request.status === "rejected" && request.rejected_reason ? (
                      <p className="text-destructive text-sm">
                        {copy.rejectedReason}: {request.rejected_reason}
                      </p>
                    ) : null}
                  </ItemContent>
                  <ItemActions>
                    {request.status === "pending" ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={isPending}
                        onClick={() => handleCancel(request)}
                        aria-label={copy.cancelRequest}
                      >
                        <IconX data-icon="only" />
                      </Button>
                    ) : null}
                  </ItemActions>
                </Item>
              );
            })}
          </ItemGroup>
        )}
      </EmployeePanel>

      <FormDialog
        open={open}
        onOpenChange={setOpen}
        title={copy.dialogTitle}
        description={branchName ?? messages.employee.profile.noBranch}
        schema={leaveRequestSchema}
        defaultValues={defaultValues}
        entityKey={open ? "open" : "closed"}
        onSubmit={handleSubmit}
        successMessage={copy.submittedToast}
        submitLabel={copy.submit}
        cancelLabel={ACTIONS_VI.cancel}
        contentClassName="sm:max-w-md"
      >
        {(form) => {
          const startDate = form.watch("startDate");
          const endDate = form.watch("endDate");
          const formDurationDays = countInclusiveDays(startDate, endDate);

          return (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <TextField
                  control={form.control}
                  name="startDate"
                  label={copy.startDate}
                  type="date"
                  min={todayIso}
                />
                <TextField
                  control={form.control}
                  name="endDate"
                  label={copy.endDate}
                  type="date"
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

              {formDurationDays !== null ? (
                <p className="text-xs text-muted-foreground">
                  {formatDateRange(startDate, endDate)} · {formDurationDays}{" "}
                  {copy.dayUnit}
                </p>
              ) : null}
            </>
          );
        }}
      </FormDialog>
    </>
  );
}
