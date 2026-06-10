"use client";

import { useMemo, useState, useTransition } from "react";
import {
  CalendarX as IconCalendarX,
  Plus as IconPlus,
  X as IconX,
} from "lucide-react";
import { ACTIONS_VI, BRANCH_VI } from "@comtammatu/shared/messages";
import {
  formatVNBusinessDate,
  getVNDateString,
} from "@comtammatu/shared/time";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@comtammatu/ui/components/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@comtammatu/ui/components/empty";
import { Input } from "@comtammatu/ui/components/input";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { Label } from "@comtammatu/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { Textarea } from "@comtammatu/ui/components/textarea";
import { toast } from "@comtammatu/ui/components/sonner";
import { EmployeePanel, EmployeeStatusStrip } from "../components/employee-page";
import { cancelLeaveRequest, submitLeaveRequest } from "./actions";
import type { LeaveRequestRow, LeaveRequestType } from "./page";
import { messages } from "@lib/messages";

interface LeaveRequestClientProps {
  branchId: number;
  branchName: string | null;
  initialRequests: LeaveRequestRow[];
}

const copy = messages.employee.leave;

const STATUS_LABELS = {
  pending: { label: "Chờ duyệt", variant: "warning" as const },
  approved: { label: "Đã duyệt", variant: "success" as const },
  rejected: { label: "Từ chối", variant: "destructive" as const },
  cancelled: { label: "Đã huỷ", variant: "secondary" as const },
};

const LEAVE_TYPE_LABELS: Record<LeaveRequestType, string> = {
  annual: "Nghỉ phép",
  sick: "Nghỉ bệnh",
  unpaid: "Nghỉ không lương",
  personal: "Việc cá nhân",
  other: "Khác",
};

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
  const [requests, setRequests] =
    useState<LeaveRequestRow[]>(initialRequests);
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [startDate, setStartDate] = useState(getVNDateString());
  const [endDate, setEndDate] = useState(getVNDateString());
  const [leaveType, setLeaveType] = useState<LeaveRequestType>("annual");
  const [reason, setReason] = useState("");

  const durationDays = useMemo(
    () => countInclusiveDays(startDate, endDate),
    [startDate, endDate],
  );
  const todayIso = getVNDateString();
  const canSubmit =
    startDate.length > 0 && endDate.length > 0 && startDate <= endDate;

  function resetForm() {
    const today = getVNDateString();
    setStartDate(today);
    setEndDate(today);
    setLeaveType("annual");
    setReason("");
  }

  function handleStartDateChange(value: string) {
    setStartDate(value);
    if (endDate < value) setEndDate(value);
  }

  function handleSubmit() {
    if (!canSubmit) return;
    startTransition(async () => {
      const result = await submitLeaveRequest({
        branchId,
        startDate,
        endDate,
        leaveType,
        reason: reason.trim() || undefined,
      });

      if (!result.success) {
        toast.error(result.error ?? "Không thể gửi yêu cầu nghỉ");
        return;
      }

      toast.success(copy.submittedToast);
      const requestId = (result.data as { requestId: number }).requestId;
      const newRequest: LeaveRequestRow = {
        id: requestId,
        branch_id: branchId,
        employee_id: 0,
        status: "pending",
        start_date: startDate,
        end_date: endDate,
        leave_type: leaveType,
        reason: reason.trim() || null,
        rejected_reason: null,
        created_at: new Date().toISOString(),
        reviewed_at: null,
      };

      setRequests((prev) =>
        [newRequest, ...prev].sort((a, b) =>
          b.start_date.localeCompare(a.start_date),
        ),
      );
      resetForm();
      setOpen(false);
    });
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
                  durationDays === null
                    ? "Chưa chọn"
                    : `${durationDays} ngày`,
                muted: durationDays === null,
              },
            ]}
          />
          <div className="flex">
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
          </div>
        </div>
      </EmployeePanel>

      <EmployeePanel
        title={copy.myRequestsTitle}
        description={copy.myRequestsDescription}
      >
        {requests.length === 0 ? (
          <Empty>
            <EmptyMedia variant="icon">
              <IconCalendarX />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle>{copy.emptyTitle}</EmptyTitle>
              <EmptyDescription>{copy.emptyDescription}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ItemGroup>
            {requests.map((request) => {
              const status = STATUS_LABELS[request.status];
              const days = countInclusiveDays(
                request.start_date,
                request.end_date,
              );
              return (
                <Item key={request.id} variant="outline">
                  <ItemContent>
                    <ItemTitle>
                      {LEAVE_TYPE_LABELS[request.leave_type]}
                      <Badge variant={status.variant}>{status.label}</Badge>
                    </ItemTitle>
                    <ItemDescription>
                      {formatDateRange(request.start_date, request.end_date)}
                      {days ? ` · ${days} ngày` : null}
                      {request.reason ? ` · ${request.reason}` : null}
                      {request.status === "rejected" &&
                      request.rejected_reason
                        ? ` · ${copy.rejectedReason}: ${request.rejected_reason}`
                        : null}
                    </ItemDescription>
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

      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (!nextOpen) resetForm();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{copy.dialogTitle}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="leave-start-date">{copy.startDate}</Label>
                <Input
                  id="leave-start-date"
                  type="date"
                  value={startDate}
                  min={todayIso}
                  onChange={(event) => handleStartDateChange(event.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="leave-end-date">{copy.endDate}</Label>
                <Input
                  id="leave-end-date"
                  type="date"
                  value={endDate}
                  min={startDate || todayIso}
                  onChange={(event) => setEndDate(event.target.value)}
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="leave-type">{copy.leaveType}</Label>
              <Select
                value={leaveType}
                onValueChange={(value) =>
                  setLeaveType(value as LeaveRequestType)
                }
              >
                <SelectTrigger id="leave-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(LEAVE_TYPE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="leave-reason">{copy.reason}</Label>
              <Textarea
                id="leave-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                maxLength={500}
                placeholder={copy.reasonPlaceholder}
              />
            </div>

            {durationDays !== null ? (
              <p className="text-xs text-muted-foreground">
                {formatDateRange(startDate, endDate)} · {durationDays}{" "}
                {copy.dayUnit}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isPending}
            >
              {ACTIONS_VI.cancel}
            </Button>
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={isPending || !canSubmit}
            >
              {isPending ? <Spinner className="mr-2" /> : null}
              {copy.submit}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
