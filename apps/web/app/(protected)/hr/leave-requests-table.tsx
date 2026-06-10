"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import {
  CalendarX as IconCalendarX,
  Check as IconCheck,
  X as IconX,
} from "lucide-react";
import { formatVNBusinessDate } from "@comtammatu/shared/time";
import { ACTIONS_VI, BRANCH_VI } from "@comtammatu/shared/messages";
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
import { Label } from "@comtammatu/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { Spinner } from "@comtammatu/ui/components/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@comtammatu/ui/components/tabs";
import { Textarea } from "@comtammatu/ui/components/textarea";
import { toast } from "@comtammatu/ui/components/sonner";
import { messages } from "@lib/messages";
import {
  approveLeaveRequest,
  fetchLeaveRequests,
  rejectLeaveRequest,
} from "./leave-request-actions";
import type { BranchOption } from "./page";

type LeaveStatus = "pending" | "approved" | "rejected" | "cancelled";
type LeaveType = "annual" | "sick" | "unpaid" | "personal" | "other";

interface LeaveRequestRow {
  id: number;
  status: LeaveStatus;
  start_date: string;
  end_date: string;
  leave_type: LeaveType;
  reason: string | null;
  rejected_reason: string | null;
  created_at: string;
  reviewed_at: string | null;
  branch_id: number;
  employees: {
    id: number;
    employee_code: string | null;
    profiles: { full_name: string } | null;
  } | null;
}

interface LeaveRequestsTableProps {
  branches: BranchOption[];
}

const copy = messages.hr.leave;

const STATUS_LABELS = {
  pending: { label: copy.status.pending, variant: "warning" as const },
  approved: { label: copy.status.approved, variant: "success" as const },
  rejected: { label: copy.status.rejected, variant: "destructive" as const },
  cancelled: { label: copy.status.cancelled, variant: "secondary" as const },
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

function getEmployeeName(request: LeaveRequestRow): string {
  return (
    request.employees?.profiles?.full_name ??
    request.employees?.employee_code ??
    copy.fallbackEmployee
  );
}

export function LeaveRequestsTable({ branches }: LeaveRequestsTableProps) {
  const [requests, setRequests] = useState<LeaveRequestRow[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<number | null>(
    branches[0]?.id ?? null,
  );
  const [isPending, startTransition] = useTransition();
  const [rejectTarget, setRejectTarget] = useState<LeaveRequestRow | null>(
    null,
  );
  const [rejectReason, setRejectReason] = useState("");

  const load = useCallback((branchId: number) => {
    startTransition(async () => {
      const result = await fetchLeaveRequests({ branchId });
      if (result.success) {
        setRequests((result.data as LeaveRequestRow[]) ?? []);
      } else {
        toast.error(result.error ?? "Không thể tải danh sách nghỉ phép");
      }
    });
  }, []);

  useEffect(() => {
    if (selectedBranchId !== null) load(selectedBranchId);
  }, [selectedBranchId, load]);

  const pendingRows = useMemo(
    () => requests.filter((request) => request.status === "pending"),
    [requests],
  );
  const historyRows = useMemo(
    () => requests.filter((request) => request.status !== "pending"),
    [requests],
  );

  function handleApprove(request: LeaveRequestRow) {
    startTransition(async () => {
      const result = await approveLeaveRequest({ requestId: request.id });
      if (!result.success) {
        toast.error(result.error ?? "Không thể duyệt yêu cầu nghỉ");
        return;
      }
      toast.success("Đã duyệt yêu cầu nghỉ");
      setRequests((prev) =>
        prev.map((item) =>
          item.id === request.id ? { ...item, status: "approved" } : item,
        ),
      );
    });
  }

  function handleReject() {
    if (!rejectTarget) return;
    startTransition(async () => {
      const result = await rejectLeaveRequest({
        requestId: rejectTarget.id,
        reason: rejectReason.trim() || undefined,
      });
      if (!result.success) {
        toast.error(result.error ?? "Không thể từ chối yêu cầu nghỉ");
        return;
      }
      toast.success("Đã từ chối yêu cầu nghỉ");
      setRequests((prev) =>
        prev.map((item) =>
          item.id === rejectTarget.id
            ? {
                ...item,
                status: "rejected",
                rejected_reason: rejectReason.trim() || null,
              }
            : item,
        ),
      );
      setRejectTarget(null);
      setRejectReason("");
    });
  }

  if (branches.length === 0) {
    return (
      <Empty>
        <EmptyMedia variant="icon">
          <IconCalendarX />
        </EmptyMedia>
        <EmptyHeader>
          <EmptyTitle>{copy.emptyBranchTitle}</EmptyTitle>
          <EmptyDescription>{copy.emptyBranchDescription}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={selectedBranchId?.toString() ?? ""}
          onValueChange={(value) => setSelectedBranchId(Number(value))}
        >
          <SelectTrigger className="w-48">
            <SelectValue placeholder={BRANCH_VI.select} />
          </SelectTrigger>
          <SelectContent>
            {branches.map((branch) => (
              <SelectItem key={branch.id} value={branch.id.toString()}>
                {branch.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <span className="text-sm text-muted-foreground">
          {copy.summary(pendingRows.length, requests.length)}
        </span>

        {isPending ? <Spinner /> : null}
      </div>

      <Tabs defaultValue="pending">
        <TabsList>
          <TabsTrigger value="pending">
            {copy.pendingTab(pendingRows.length)}
          </TabsTrigger>
          <TabsTrigger value="history">
            {copy.historyTab(historyRows.length)}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="mt-4">
          {pendingRows.length === 0 && !isPending ? (
            <Empty>
              <EmptyMedia variant="icon">
                <IconCalendarX />
              </EmptyMedia>
              <EmptyHeader>
                <EmptyTitle>{copy.emptyPendingTitle}</EmptyTitle>
                <EmptyDescription>{copy.emptyPendingDescription}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{copy.table.dateRange}</TableHead>
                    <TableHead>{copy.table.employee}</TableHead>
                    <TableHead>{copy.table.type}</TableHead>
                    <TableHead>{copy.table.reason}</TableHead>
                    <TableHead className="w-32 text-right">
                      {copy.table.actions}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingRows.map((request) => {
                    const days = countInclusiveDays(
                      request.start_date,
                      request.end_date,
                    );
                    return (
                      <TableRow key={request.id}>
                        <TableCell>
                          <div className="font-medium">
                            {formatDateRange(
                              request.start_date,
                              request.end_date,
                            )}
                          </div>
                          {days ? (
                            <div className="text-xs text-muted-foreground">
                              {days} {copy.dayUnit}
                            </div>
                          ) : null}
                        </TableCell>
                        <TableCell>{getEmployeeName(request)}</TableCell>
                        <TableCell>{copy.types[request.leave_type]}</TableCell>
                        <TableCell className="max-w-xs truncate text-sm text-muted-foreground">
                          {request.reason ?? "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              disabled={isPending}
                              onClick={() => handleApprove(request)}
                              aria-label={copy.approveAria}
                            >
                              <IconCheck data-icon="only" />
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              disabled={isPending}
                              onClick={() => {
                                setRejectTarget(request);
                                setRejectReason("");
                              }}
                              aria-label={copy.rejectAria}
                            >
                              <IconX data-icon="only" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          {historyRows.length === 0 && !isPending ? (
            <Empty>
              <EmptyMedia variant="icon">
                <IconCalendarX />
              </EmptyMedia>
              <EmptyHeader>
                <EmptyTitle>{copy.emptyHistoryTitle}</EmptyTitle>
                <EmptyDescription>{copy.emptyHistoryDescription}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{copy.table.dateRange}</TableHead>
                    <TableHead>{copy.table.employee}</TableHead>
                    <TableHead>{copy.table.type}</TableHead>
                    <TableHead>{copy.table.reason}</TableHead>
                    <TableHead>{copy.table.status}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {historyRows.map((request) => {
                    const days = countInclusiveDays(
                      request.start_date,
                      request.end_date,
                    );
                    const statusInfo = STATUS_LABELS[request.status];
                    return (
                      <TableRow key={request.id}>
                        <TableCell>
                          <div className="font-medium">
                            {formatDateRange(
                              request.start_date,
                              request.end_date,
                            )}
                          </div>
                          {days ? (
                            <div className="text-xs text-muted-foreground">
                              {days} {copy.dayUnit}
                            </div>
                          ) : null}
                        </TableCell>
                        <TableCell>{getEmployeeName(request)}</TableCell>
                        <TableCell>{copy.types[request.leave_type]}</TableCell>
                        <TableCell className="max-w-xs truncate text-sm text-muted-foreground">
                          {request.reason ?? "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusInfo.variant}>
                            {statusInfo.label}
                          </Badge>
                          {request.status === "rejected" &&
                          request.rejected_reason ? (
                            <div className="mt-1 text-xs text-muted-foreground">
                              {request.rejected_reason}
                            </div>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog
        open={rejectTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRejectTarget(null);
            setRejectReason("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{copy.rejectDialogTitle}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              {rejectTarget
                ? getEmployeeName(rejectTarget)
                : copy.fallbackEmployee}{" "}
              ·{" "}
              {rejectTarget
                ? formatDateRange(
                    rejectTarget.start_date,
                    rejectTarget.end_date,
                  )
                : ""}
            </p>
            <div className="flex flex-col gap-2">
              <Label htmlFor="leave-reject-reason">
                {copy.rejectReasonLabel}
              </Label>
              <Textarea
                id="leave-reject-reason"
                value={rejectReason}
                onChange={(event) => setRejectReason(event.target.value)}
                maxLength={500}
                placeholder={copy.rejectReasonPlaceholder}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setRejectTarget(null)}
              disabled={isPending}
            >
              {ACTIONS_VI.cancel}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleReject}
              disabled={isPending}
            >
              {isPending ? <Spinner className="mr-2" /> : null}
              {copy.rejectSubmit}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
