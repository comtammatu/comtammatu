"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
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
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";

import { confirm } from "@/components/confirm-dialog";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { Label } from "@comtammatu/ui/components/label";
import { RadioGroup, RadioGroupItem } from "@comtammatu/ui/components/radio-group";
import { Spinner } from "@comtammatu/ui/components/spinner";

import { Textarea } from "@comtammatu/ui/components/textarea";
import { toast } from "@comtammatu/ui/components/sonner";
import { StatusBadge } from "@/components/status-badge";
import { AppBackLink, AppEmptyState, AppSheet } from "@/components/surface";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@comtammatu/ui/components/tabs";
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
  fetchLeaveShiftConflicts,
  rejectLeaveRequest,
} from "@/(protected)/hr/leave-request-actions";


type QueueView = "pending" | "history";
type PendingAction = "approve" | "reject" | null;

const copy = messages.hr.leave;

function formatDateRange(startDate: string, endDate: string): string {
  if (startDate === endDate) return formatVNBusinessDate(startDate);
  return `${formatVNBusinessDate(startDate)} - ${formatVNBusinessDate(endDate)}`;
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
  const [conflictShifts, setConflictShifts] = useState<
    {
      id: number;
      workDate: string;
      shiftId: number;
      shiftName: string;
      startTime: string;
      endTime: string;
    }[]
  >([]);
  const [availableSubstitutes, setAvailableSubstitutes] = useState<
    {
      employeeId: number;
      employeeCode: string | null;
      fullName: string;
      positionLabel: string | null;
    }[]
  >([]);
  const [substitutionMode, setSubstitutionMode] = useState<
    "substitute" | "unassign" | "keep"
  >("substitute");
  const [selectedSubstituteId, setSelectedSubstituteId] = useState<string>("");
  const [conflictSheetOpen, setConflictSheetOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const requestedView = searchParams.get("view");
  const view: QueueView = requestedView === "history" ? "history" : "pending";
  const setView = useCallback(
    (next: QueueView) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === "pending") params.delete("view");
      else params.set("view", next);
      const q = params.toString();
      router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );


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
    setConflictSheetOpen(false);
  }

  async function approveSelected() {
    if (!selected) return;
    const employeeName = getLeaveRequestEmployeeName(
      selected,
      copy.fallbackEmployee,
    );

    setPendingAction("approve");
    const conflictResult = await fetchLeaveShiftConflicts({
      employeeId: selected.employees?.id ?? 0,
      startDate: selected.start_date,
      endDate: selected.end_date,
      branchId,
    });

    if (
      conflictResult.success &&
      conflictResult.data &&
      conflictResult.data.shifts.length > 0
    ) {
      const conflictData = conflictResult.data;
      setConflictShifts(conflictData.shifts);
      setAvailableSubstitutes(conflictData.availableEmployees);
      setSubstitutionMode(
        conflictData.availableEmployees.length > 0
          ? "substitute"
          : "unassign",
      );
      setSelectedSubstituteId(
        conflictData.availableEmployees[0]?.employeeId
          ? String(conflictData.availableEmployees[0].employeeId)
          : "",
      );
      setConflictSheetOpen(true);
      setPendingAction(null);
      return;
    }


    const ok = await confirm({
      title: copy.approveAria,
      description: `${employeeName} · ${formatDateRange(
        selected.start_date,
        selected.end_date,
      )}`,
      confirmText: ACTIONS_VI.approve,
    });
    if (!ok) {
      setPendingAction(null);
      return;
    }

    startTransition(async () => {
      const result = await approveLeaveRequest({
        requestId: selected.id,
        branchId,
      });
      setPendingAction(null);
      if (!result.success) {
        toast.error(result.error ?? copy.approveFailed);
        return;
      }
      toast.success(copy.approveSuccess);
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

  function confirmApprovalWithSubstitution() {
    if (!selected) return;
    setPendingAction("approve");
    startTransition(async () => {
      const result = await approveLeaveRequest({
        requestId: selected.id,
        branchId,
        replacementEmployeeId:
          substitutionMode === "substitute" && selectedSubstituteId
            ? Number(selectedSubstituteId)
            : null,
        unassignShifts: substitutionMode === "unassign",
        employeeId: selected.employees?.id,
        startDate: selected.start_date,
        endDate: selected.end_date,
      });
      setPendingAction(null);
      setConflictSheetOpen(false);
      if (!result.success) {
        toast.error(result.error ?? copy.approveFailed);
        return;
      }
      if (substitutionMode === "substitute" && selectedSubstituteId) {
        toast.success(copy.approveSuccessWithSubstitution);
      } else if (substitutionMode === "unassign") {
        toast.success(copy.approveSuccessWithUnassign);
      } else {
        toast.success(copy.approveSuccess);
      }
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
        toast.error(result.error ?? copy.rejectFailed);
        return;
      }
      toast.success(copy.rejectSuccess);
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
      <BranchOperatorPage title={copy.approvalsTitle} description={branchName}>
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
      back={<AppBackLink href={`/br/${branchId}/team`} />}
    >
      <div className="flex flex-col gap-3">
        <Tabs
          value={view}
          onValueChange={(val) => setView(val as QueueView)}
          className="w-full"
        >
          <TabsList
            size="touch"
            aria-label={copy.approvalsTitle}
            className="grid w-full grid-cols-2"
          >
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
            <ItemGroup className="grid gap-2 lg:grid-cols-2">
              {visibleRows.map((request) => {
                const days = countInclusiveDays(
                  request.start_date,
                  request.end_date,
                );
                return (
                  <Item
                    key={request.id}
                    variant="outline"
                    className="min-h-20 min-w-0 flex-nowrap touch-manipulation"
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
                        {formatDateRange(request.start_date, request.end_date)}{" "}
                        · {days} {copy.dayUnit}
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
      </div>

      <AppSheet
        open={selected != null}
        onOpenChange={(open) => {
          if (!open) closeReview();
        }}
        title={
          selected
            ? getLeaveRequestEmployeeName(selected, copy.fallbackEmployee)
            : ""
        }
        description={
          selected ? (
            <span className="flex flex-wrap items-center gap-2">
              <span>
                {formatDateRange(selected.start_date, selected.end_date)}
              </span>
              <StatusBadge
                domain="leave-request"
                value={selected.status}
                label={copy.status[selected.status]}
                size="sm"
              />
            </span>
          ) : undefined
        }
        side="bottom"
        contentClassName="max-h-dvh-95 sm:mx-auto sm:max-w-2xl"
        footerClassName="sticky bottom-0 border-t"
        footer={
          selected ? (
            selected.status === "pending" ? (
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
            )
          ) : null
        }
      >
        {selected ? (
          <div className="flex flex-col gap-4">
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
                  label: copy.submittedAt,
                  value: formatVNDateTime(selected.created_at),
                },
              ]}
            />

            <div className="rounded-md bg-muted/30 p-3">
              <p className="text-xs font-medium text-muted-foreground">
                {copy.table.reason}
              </p>
              <p className="mt-1 break-words text-sm leading-6">
                {selected.reason ?? copy.noReason}
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
        ) : null}
      </AppSheet>

      <AppSheet
        open={conflictSheetOpen}
        onOpenChange={setConflictSheetOpen}
        title={copy.leaveShiftConflictTitle}
        description={
          selected
            ? copy.leaveShiftConflictDescription(
                getLeaveRequestEmployeeName(selected, copy.fallbackEmployee),
                conflictShifts.map((s) => s.shiftName).join(", "),
                formatDateRange(selected.start_date, selected.end_date),
              )
            : ""
        }
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
              onClick={() => setConflictSheetOpen(false)}
            >
              {ACTIONS_VI.cancel}
            </Button>
            <Button
              type="button"
              variant="default"
              size="touch"
              className="flex-1"
              disabled={

                isPending ||
                (substitutionMode === "substitute" && !selectedSubstituteId)
              }
              onClick={confirmApprovalWithSubstitution}
            >
              {isPending ? (
                <Spinner className="size-4" />
              ) : (
                <IconCheck className="size-4" />
              )}
              {copy.approveAndApply}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <p className="text-muted-foreground text-xs font-medium">
              {copy.conflictShiftsHeader}
            </p>
            <ItemGroup className="gap-1.5">
              {conflictShifts.map((shift) => (
                <Item key={shift.id} variant="outline" className="p-2.5">
                  <ItemContent className="min-w-0">
                    <ItemTitle className="text-xs font-semibold">
                      {shift.shiftName} ({shift.startTime.slice(0, 5)}–
                      {shift.endTime.slice(0, 5)})
                    </ItemTitle>
                    <ItemDescription className="text-2xs">
                      {formatVNBusinessDate(shift.workDate)}
                    </ItemDescription>
                  </ItemContent>
                </Item>
              ))}
            </ItemGroup>
          </div>

          <div className="flex flex-col gap-3">
            <RadioGroup
              value={substitutionMode}
              onValueChange={(val) =>
                setSubstitutionMode(val as "substitute" | "unassign" | "keep")
              }
            >
              {availableSubstitutes.length > 0 ? (
                <div className="flex items-start gap-2">
                  <RadioGroupItem
                    value="substitute"
                    id="mode-substitute"
                    size="touch"
                    className="mt-0.5"
                  />
                  <div className="flex flex-1 flex-col gap-1.5">
                    <Label
                      htmlFor="mode-substitute"
                      className="cursor-pointer text-sm font-medium"
                    >
                      {copy.substitutionSelectLabel}
                    </Label>
                    {substitutionMode === "substitute" ? (
                      <div className="flex max-h-48 flex-col gap-1 overflow-y-auto pt-1">
                        {availableSubstitutes.map((emp) => {
                          const active =
                            selectedSubstituteId === String(emp.employeeId);
                          return (
                            <Item
                              key={emp.employeeId}
                              variant="outline"
                              className={
                                active
                                  ? "border-primary bg-primary/10 p-2"
                                  : "cursor-pointer p-2 opacity-80 hover:opacity-100"
                              }
                              onClick={() =>
                                setSelectedSubstituteId(String(emp.employeeId))
                              }
                            >
                              <ItemContent className="min-w-0">
                                <ItemTitle className="text-xs font-medium">
                                  {emp.fullName}
                                </ItemTitle>
                                <ItemDescription className="text-2xs">
                                  {emp.positionLabel || "—"}
                                </ItemDescription>
                              </ItemContent>
                              {active ? (
                                <Badge variant="default" className="text-2xs">
                                  {copy.selectedBadge}
                                </Badge>
                              ) : null}

                            </Item>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}


              <div className="flex items-center gap-2">
                <RadioGroupItem
                  value="unassign"
                  id="mode-unassign"
                  size="touch"
                />
                <Label
                  htmlFor="mode-unassign"
                  className="cursor-pointer text-sm font-normal"
                >
                  {copy.unassignOption}
                </Label>
              </div>

              <div className="flex items-center gap-2">
                <RadioGroupItem value="keep" id="mode-keep" size="touch" />
                <Label
                  htmlFor="mode-keep"
                  className="cursor-pointer text-sm font-normal"
                >
                  {copy.keepShiftOption}
                </Label>
              </div>
            </RadioGroup>
          </div>
        </div>
      </AppSheet>
    </BranchOperatorPage>
  );
}
