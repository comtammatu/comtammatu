"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import {
  CalendarCheck as IconCalendarCheck,
  CalendarX as IconCalendarX,
  Check as IconCheck,
  ChevronRight as IconChevronRight,
  ShieldAlert as IconShieldAlert,
  X as IconX,
} from "lucide-react";
import { ACTIONS_VI } from "@comtammatu/shared/messages";
import {
  formatVNBusinessDate,
  formatVNDateTime,
} from "@comtammatu/shared/time";
import { Button } from "@comtammatu/ui/components/button";
import { confirm } from "@comtammatu/ui/components/confirm-dialog";
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
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@comtammatu/ui/components/sheet";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { Tabs, TabsList, TabsTrigger } from "@comtammatu/ui/components/tabs";
import { Textarea } from "@comtammatu/ui/components/textarea";
import { toast } from "@comtammatu/ui/components/sonner";
import { StatusBadge } from "@/components/status-badge";
import { AppEmptyState } from "@/components/surface";
import { useBranchOpsEvents } from "@/_hooks/use-branch-ops-events";
import { employee } from "@lib/messages/employee";
import {
  BranchOperatorDetailList,
  BranchOperatorPage,
  BranchOperatorPanel,
} from "@lib/branch-operator/components/branch-operator-page";
import {
  getLeaveRequestEmployeeName,
  type LeaveRequestRow,
} from "@lib/hr/leave-request-model";
import { countInclusiveDays } from "@lib/hr/payroll-day-math";
import { messages } from "@lib/messages";
import {
  approveLeaveRequest,
  fetchLeaveRequests,
  rejectLeaveRequest,
} from "@/(protected)/hr/leave-request-actions";

type QueueView = "pending" | "history";
type PendingAction = "approve" | "reject" | null;

const copy = messages.hr.leave;

function formatDateRange(startDate: string, endDate: string): string {
  if (startDate === endDate) return formatVNBusinessDate(startDate);
  return `${formatVNBusinessDate(startDate)} - ${formatVNBusinessDate(endDate)}`;
}

function annualBalance(request: LeaveRequestRow): string | null {
  const balance = request.annual_leave_balance;
  if (request.leave_type !== "annual" || !balance) return null;
  return copy.annualBalance(
    balance.remainingDays,
    balance.entitlementDays,
    balance.year,
  );
}

function monthlyBalance(request: LeaveRequestRow): string | null {
  const balance = request.monthly_leave_balance;
  if (request.leave_type !== "annual" || !balance) return null;
  return copy.monthlyBalance(balance.remainingDays, balance.entitlementDays);
}

export function BranchLeaveApprovalsClient({
  branchId,
  branchName,
  canApprove,
  initialRows,
  loadFailed,
}: {
  branchId: number;
  branchName: string;
  canApprove: boolean;
  initialRows: LeaveRequestRow[];
  loadFailed: boolean;
}) {
  const [rows, setRows] = useState(initialRows);
  const [view, setView] = useState<QueueView>("pending");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [isPending, startTransition] = useTransition();

  const pendingRows = useMemo(
    () => rows.filter((request) => request.status === "pending"),
    [rows],
  );
  const historyRows = useMemo(
    () => rows.filter((request) => request.status !== "pending"),
    [rows],
  );
  const visibleRows = view === "pending" ? pendingRows : historyRows;
  const selected = rows.find((request) => request.id === selectedId) ?? null;

  useEffect(() => setRows(initialRows), [initialRows]);

  const reload = useCallback(() => {
    if (!canApprove) return;
    startTransition(async () => {
      const result = await fetchLeaveRequests({ branchId });
      if (!result.success) {
        toast.error(result.error ?? copy.loadFailed);
        return;
      }
      setRows(result.data ?? []);
    });
  }, [branchId, canApprove]);

  useBranchOpsEvents({
    branchId,
    enabled: canApprove,
    onEvent: reload,
  });

  function closeReview() {
    setSelectedId(null);
    setRejecting(false);
    setRejectReason("");
    setPendingAction(null);
  }

  async function approveSelected() {
    if (!selected) return;
    const employeeName = getLeaveRequestEmployeeName(
      selected,
      copy.fallbackEmployee,
    );
    const ok = await confirm({
      title: copy.approveAria,
      description: `${employeeName} · ${formatDateRange(
        selected.start_date,
        selected.end_date,
      )}`,
      confirmText: ACTIONS_VI.approve,
    });
    if (!ok) return;

    setPendingAction("approve");
    startTransition(async () => {
      const result = await approveLeaveRequest({
        requestId: selected.id,
        branchId,
      });
      setPendingAction(null);
      if (!result.success) {
        toast.error(result.error ?? "Không thể duyệt yêu cầu nghỉ");
        return;
      }
      toast.success("Đã duyệt yêu cầu nghỉ");
      setRows((current) =>
        current.map((request) =>
          request.id === selected.id
            ? { ...request, status: "approved" }
            : request,
        ),
      );
      closeReview();
      reload();
    });
  }

  function rejectSelected() {
    if (!selected) return;
    setPendingAction("reject");
    startTransition(async () => {
      const reason = rejectReason.trim();
      const result = await rejectLeaveRequest({
        requestId: selected.id,
        branchId,
        reason: reason || undefined,
      });
      setPendingAction(null);
      if (!result.success) {
        toast.error(result.error ?? "Không thể từ chối yêu cầu nghỉ");
        return;
      }
      toast.success("Đã từ chối yêu cầu nghỉ");
      setRows((current) =>
        current.map((request) =>
          request.id === selected.id
            ? {
                ...request,
                status: "rejected",
                rejected_reason: reason || null,
              }
            : request,
        ),
      );
      closeReview();
      reload();
    });
  }

  if (!canApprove) {
    return (
      <BranchOperatorPage
        title={copy.approvalsTitle}
        description={branchName}
        hideHeaderOnMobile
      >
        <AppEmptyState
          icon={<IconShieldAlert />}
          title={copy.approvalsNoAccessTitle}
          description={copy.approvalsNoAccessDescription}
        />
      </BranchOperatorPage>
    );
  }

  return (
    <BranchOperatorPage
      title={copy.approvalsTitle}
      description={branchName}
      hideHeaderOnMobile
    >
      <Tabs value={view} onValueChange={(value) => setView(value as QueueView)}>
        <TabsList size="touch" className="grid w-full grid-cols-2">
          <TabsTrigger value="pending">
            {copy.pendingTab(pendingRows.length)}
          </TabsTrigger>
          <TabsTrigger value="history">
            {copy.historyTab(historyRows.length)}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <BranchOperatorPanel
        title={
          view === "pending"
            ? copy.approvalsTitle
            : copy.historyTab(historyRows.length)
        }
        description={copy.summary(pendingRows.length, rows.length)}
        icon={view === "pending" ? IconCalendarCheck : IconCalendarX}
        badge={{ children: visibleRows.length }}
        size="sm"
      >
        {loadFailed ? (
          <AppEmptyState
            compact
            mode="error"
            icon={<IconCalendarX />}
            title={copy.loadFailed}
          >
            <Button size="touch" onClick={reload}>
              {ACTIONS_VI.retry}
            </Button>
          </AppEmptyState>
        ) : visibleRows.length === 0 ? (
          <AppEmptyState
            compact
            mode="no-data"
            icon={<IconCalendarCheck />}
            title={
              view === "pending"
                ? copy.emptyPendingTitle
                : copy.emptyHistoryTitle
            }
            description={
              view === "pending"
                ? copy.emptyPendingDescription
                : copy.emptyHistoryDescription
            }
          />
        ) : (
          <ItemGroup className="grid gap-2 md:grid-cols-2">
            {visibleRows.map((request) => {
              const days = countInclusiveDays(
                request.start_date,
                request.end_date,
              );
              return (
                <Item
                  key={request.id}
                  variant="outline"
                  className="min-h-20 touch-manipulation"
                  render={
                    <button
                      type="button"
                      onClick={() => setSelectedId(request.id)}
                    />
                  }
                >
                  <ItemContent className="min-w-0 gap-1 text-left">
                    <ItemTitle size="heading">
                      {getLeaveRequestEmployeeName(
                        request,
                        copy.fallbackEmployee,
                      )}
                    </ItemTitle>
                    <ItemDescription className="line-clamp-none">
                      {formatDateRange(request.start_date, request.end_date)} ·{" "}
                      {days} {copy.dayUnit}
                    </ItemDescription>
                    <ItemDescription className="line-clamp-2 break-words">
                      {copy.types[request.leave_type]}
                      {request.reason ? ` · ${request.reason}` : ""}
                    </ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    <StatusBadge
                      domain="leave-request"
                      value={request.status}
                      label={copy.status[request.status]}
                      size="sm"
                    />
                    <IconChevronRight className="size-4 text-muted-foreground" />
                  </ItemActions>
                </Item>
              );
            })}
          </ItemGroup>
        )}
      </BranchOperatorPanel>

      <Sheet
        open={selected != null}
        onOpenChange={(open) => {
          if (!open) closeReview();
        }}
      >
        <SheetContent
          side="bottom"
          className="max-h-dvh-95 overflow-y-auto overscroll-contain bg-background p-0"
        >
          {selected ? (
            <>
              <SheetHeader>
                <SheetTitle>
                  {getLeaveRequestEmployeeName(selected, copy.fallbackEmployee)}
                </SheetTitle>
                <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <span>
                    {formatDateRange(selected.start_date, selected.end_date)}
                  </span>
                  <StatusBadge
                    domain="leave-request"
                    value={selected.status}
                    label={copy.status[selected.status]}
                    size="sm"
                  />
                </div>
              </SheetHeader>

              <div className="flex flex-col gap-4 px-4 pb-4">
                <BranchOperatorDetailList
                  columns={2}
                  rows={[
                    {
                      label: copy.table.type,
                      value: copy.types[selected.leave_type],
                    },
                    {
                      label: copy.table.dateRange,
                      value: `${countInclusiveDays(
                        selected.start_date,
                        selected.end_date,
                      )} ${copy.dayUnit}`,
                    },
                    {
                      label: copy.table.monthlyQuota,
                      value: monthlyBalance(selected) ?? "—",
                    },
                    {
                      label: copy.table.annualQuota,
                      value: annualBalance(selected) ?? "—",
                    },
                    {
                      label: "Gửi lúc",
                      value: formatVNDateTime(selected.created_at),
                    },
                  ]}
                />

                <div className="rounded-md bg-muted/30 p-3">
                  <p className="text-xs font-medium text-muted-foreground">
                    {copy.table.reason}
                  </p>
                  <p className="mt-1 break-words text-sm leading-6">
                    {selected.reason ?? "Không có lý do"}
                  </p>
                </div>

                {selected.rejected_reason ? (
                  <div className="rounded-md bg-destructive/10 p-3">
                    <p className="text-xs font-medium text-destructive">
                      {employee.leave.rejectedReason}
                    </p>
                    <p className="mt-1 break-words text-sm leading-6">
                      {selected.rejected_reason}
                    </p>
                  </div>
                ) : null}

                {rejecting ? (
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="branch-leave-reject-reason">
                      {copy.rejectReasonLabel}
                    </Label>
                    <Textarea
                      id="branch-leave-reject-reason"
                      name="rejectReason"
                      rows={3}
                      maxLength={500}
                      value={rejectReason}
                      disabled={isPending}
                      onChange={(event) => setRejectReason(event.target.value)}
                      placeholder={copy.rejectReasonPlaceholder}
                    />
                  </div>
                ) : null}
              </div>

              <SheetFooter className="sticky bottom-0 border-t bg-background/95 backdrop-blur">
                {selected.status === "pending" ? (
                  rejecting ? (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        size="touch"
                        disabled={isPending}
                        onClick={() => {
                          setRejecting(false);
                          setRejectReason("");
                        }}
                      >
                        {ACTIONS_VI.cancel}
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        size="touch-lg"
                        disabled={isPending}
                        onClick={rejectSelected}
                      >
                        {pendingAction === "reject" ? (
                          <Spinner className="size-5" />
                        ) : (
                          <IconX className="size-4" />
                        )}
                        {copy.rejectSubmit}
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        size="touch"
                        disabled={isPending}
                        onClick={() => setRejecting(true)}
                      >
                        <IconX className="size-4" />
                        {copy.rejectSubmit}
                      </Button>
                      <Button
                        type="button"
                        size="touch-lg"
                        disabled={isPending}
                        onClick={() => void approveSelected()}
                      >
                        {pendingAction === "approve" ? (
                          <Spinner className="size-5" />
                        ) : (
                          <IconCheck className="size-4" />
                        )}
                        {ACTIONS_VI.approve}
                      </Button>
                    </>
                  )
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="touch"
                    onClick={closeReview}
                  >
                    {ACTIONS_VI.close}
                  </Button>
                )}
              </SheetFooter>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </BranchOperatorPage>
  );
}
