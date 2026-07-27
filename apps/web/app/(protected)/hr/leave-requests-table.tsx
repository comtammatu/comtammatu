"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import { z } from "zod";
import {
  CalendarX as IconCalendarX,
  Check as IconCheck,
  X as IconX,
} from "lucide-react";
import {
  formatVNBusinessDate,
  getVNMonthEndDateString,
  getVNMonthSequenceBack,
  getVNMonthString,
} from "@comtammatu/shared/time";
import { ACTIONS_VI, BRANCH_VI } from "@comtammatu/shared/messages";
import { Button } from "@comtammatu/ui/components/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { AppPageTabs, TabsContent } from "@/components/app-page-tabs";
import { toast } from "@comtammatu/ui/components/sonner";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { messages } from "@lib/messages";
import {
  getLeaveRequestEmployeeName,
  type LeaveRequestRow,
} from "@lib/hr/leave-request-model";
import { countInclusiveDays } from "@lib/hr/payroll-day-math";
import { StatusBadge } from "@/components/status-badge";
import { AppEmptyState, AppListFrame, AppToolbar } from "@/components/surface";
import { useFormControlSize } from "@/components/form/control-size";
import { FormDialog, TextareaField } from "@/components/form";
import { useBranchOpsEvents } from "@/_hooks/use-branch-ops-events";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import {
  approveLeaveRequest,
  fetchLeaveRequests,
  rejectLeaveRequest,
} from "./leave-request-actions";
import type { BranchOption } from "./_types";

interface LeaveRequestsTableProps {
  branches: BranchOption[];
}

const copy = messages.hr.leave;

const rejectFormSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

type RejectFormValues = z.infer<typeof rejectFormSchema>;

function formatDateRange(startDate: string, endDate: string): string {
  if (startDate === endDate) return formatVNBusinessDate(startDate);
  return `${formatVNBusinessDate(startDate)} - ${formatVNBusinessDate(endDate)}`;
}

function getEmployeeName(request: LeaveRequestRow): string {
  return getLeaveRequestEmployeeName(request, copy.fallbackEmployee);
}

export function LeaveRequestsTable({ branches }: LeaveRequestsTableProps) {
  const controlSize = useFormControlSize();
  const [requests, setRequests] = useState<LeaveRequestRow[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<number | null>(
    branches[0]?.id ?? null,
  );
  const [approvedMonth, setApprovedMonth] = useState(getVNMonthString);
  const [isPending, startTransition] = useTransition();
  const [rejectTarget, setRejectTarget] = useState<LeaveRequestRow | null>(
    null,
  );

  const load = useCallback((branchId: number) => {
    startTransition(async () => {
      const result = await fetchLeaveRequests({ branchId });
      if (result.success) {
        setRequests((result.data as LeaveRequestRow[]) ?? []);
      } else {
        toast.error(result.error ?? copy.loadFailed);
      }
    });
  }, []);

  useEffect(() => {
    if (selectedBranchId !== null) load(selectedBranchId);
  }, [selectedBranchId, load]);

  const reloadSelectedBranch = useCallback(() => {
    if (selectedBranchId !== null) load(selectedBranchId);
  }, [selectedBranchId, load]);

  useBranchOpsEvents({
    branchId: selectedBranchId,
    enabled: selectedBranchId !== null,
    onEvent: reloadSelectedBranch,
  });

  const pendingRows = useMemo(
    () => requests.filter((request) => request.status === "pending"),
    [requests],
  );
  const historyRows = useMemo(
    () => requests.filter((request) => request.status !== "pending"),
    [requests],
  );
  const approvedMonthRows = useMemo(() => {
    const [year, month] = approvedMonth.split("-").map(Number);
    const startDate = `${approvedMonth}-01`;
    const endDate = getVNMonthEndDateString(year!, month!);

    return historyRows.filter(
      (request) =>
        request.status === "approved" &&
        request.start_date <= endDate &&
        request.end_date >= startDate,
    );
  }, [approvedMonth, historyRows]);
  const approvedMonthOptions = getVNMonthSequenceBack(6).map(({ date }) =>
    date.slice(0, 7),
  );

  function handleApprove(request: LeaveRequestRow) {
    startTransition(async () => {
      const result = await approveLeaveRequest({
        requestId: request.id,
        branchId: request.branch_id,
      });
      if (!result.success) {
        toast.error(result.error ?? "Không thể duyệt yêu cầu nghỉ");
        return;
      }
      toast.success("Đã duyệt yêu cầu nghỉ");
      if (selectedBranchId !== null) load(selectedBranchId);
    });
  }

  async function handleReject(values: RejectFormValues) {
    if (!rejectTarget) {
      return { success: false, error: "Không tìm thấy yêu cầu." };
    }

    const reason = values.reason?.trim() ?? "";
    const result = await rejectLeaveRequest({
      requestId: rejectTarget.id,
      branchId: rejectTarget.branch_id,
      reason: reason || undefined,
    });
    if (!result.success) {
      return result;
    }

    setRequests((prev) =>
      prev.map((item) =>
        item.id === rejectTarget.id
          ? {
              ...item,
              status: "rejected",
              rejected_reason: reason || null,
            }
          : item,
      ),
    );
    return result;
  }

  function renderDateRange(request: LeaveRequestRow) {
    const days = countInclusiveDays(request.start_date, request.end_date);
    return (
      <div>
        <div className="font-medium">
          {formatDateRange(request.start_date, request.end_date)}
        </div>
        {days > 0 ? (
          <div className="text-xs text-muted-foreground">
            {days} {copy.dayUnit}
          </div>
        ) : null}
      </div>
    );
  }

  function renderAnnualBalance(request: LeaveRequestRow) {
    const balance = request.annual_leave_balance;
    if (request.leave_type !== "annual" || !balance) return "—";
    return copy.annualBalance(
      balance.remainingDays,
      balance.entitlementDays,
      balance.year,
    );
  }

  function renderMonthlyBalance(request: LeaveRequestRow) {
    const balance = request.monthly_leave_balance;
    if (request.leave_type !== "annual" || !balance) return "—";
    return copy.monthlyBalance(balance.remainingDays, balance.entitlementDays);
  }

  function renderPendingActions(request: LeaveRequestRow, touch = false) {
    return (
      <div className="flex justify-end gap-1">
        <Button
          type="button"
          size={touch ? "icon-touch" : "icon-sm"}
          variant="ghost"
          disabled={isPending}
          onClick={() => handleApprove(request)}
          aria-label={copy.approveAria}
        >
          <IconCheck data-icon="only" />
        </Button>
        <Button
          type="button"
          size={touch ? "icon-touch" : "icon-sm"}
          variant="ghost"
          disabled={isPending}
          onClick={() => setRejectTarget(request)}
          aria-label={copy.rejectAria}
        >
          <IconX data-icon="only" />
        </Button>
      </div>
    );
  }

  function renderHistoryStatus(request: LeaveRequestRow) {
    return (
      <div>
        <StatusBadge
          domain="leave-request"
          value={request.status}
          label={copy.status[request.status]}
        />
        {request.status === "rejected" && request.rejected_reason ? (
          <div className="mt-1 text-xs text-muted-foreground">
            {request.rejected_reason}
          </div>
        ) : null}
      </div>
    );
  }

  function renderLeaveMobileCard(
    request: LeaveRequestRow,
    actions?: React.ReactNode,
  ) {
    return (
      <Item variant="outline" className={isPending ? "opacity-60" : ""}>
        <ItemContent>
          <ItemTitle size="heading" className="line-clamp-none">
            {getEmployeeName(request)}
          </ItemTitle>
          <ItemDescription className="line-clamp-none text-sm leading-6">
            {formatDateRange(request.start_date, request.end_date)} ·{" "}
            {copy.types[request.leave_type]}
          </ItemDescription>
          {request.reason ? (
            <p className="mt-2 text-sm text-muted-foreground">
              {request.reason}
            </p>
          ) : null}
          {request.status !== "pending" ? (
            <div className="mt-2">{renderHistoryStatus(request)}</div>
          ) : null}
          {request.leave_type === "annual" ? (
            <div className="mt-2 flex flex-col gap-1 text-xs text-muted-foreground">
              <p>
                {copy.table.monthlyQuota}: {renderMonthlyBalance(request)}
              </p>
              <p>
                {copy.table.annualQuota}: {renderAnnualBalance(request)}
              </p>
            </div>
          ) : null}
        </ItemContent>
        {actions ? (
          <ItemActions className="basis-full justify-end">
            {actions}
          </ItemActions>
        ) : null}
      </Item>
    );
  }

  const pendingColumns: DataTableColumn<LeaveRequestRow>[] = [
    {
      key: "dateRange",
      header: copy.table.dateRange,
      render: renderDateRange,
    },
    {
      key: "employee",
      header: copy.table.employee,
      render: getEmployeeName,
    },
    {
      key: "type",
      header: copy.table.type,
      render: (request) => copy.types[request.leave_type],
    },
    {
      key: "monthlyQuota",
      header: copy.table.monthlyQuota,
      className: "text-sm text-muted-foreground",
      render: renderMonthlyBalance,
    },
    {
      key: "annualQuota",
      header: copy.table.annualQuota,
      className: "text-sm text-muted-foreground",
      render: renderAnnualBalance,
    },
    {
      key: "reason",
      header: copy.table.reason,
      className: "max-w-xs truncate text-sm text-muted-foreground",
      render: (request) => request.reason ?? "—",
    },
    {
      key: "actions",
      header: copy.table.actions,
      className: "w-32 text-right",
      render: (request) => renderPendingActions(request),
    },
  ];

  const historyColumns: DataTableColumn<LeaveRequestRow>[] = [
    {
      key: "dateRange",
      header: copy.table.dateRange,
      render: renderDateRange,
    },
    {
      key: "employee",
      header: copy.table.employee,
      render: getEmployeeName,
    },
    {
      key: "type",
      header: copy.table.type,
      render: (request) => copy.types[request.leave_type],
    },
    {
      key: "monthlyQuota",
      header: copy.table.monthlyQuota,
      className: "text-sm text-muted-foreground",
      render: renderMonthlyBalance,
    },
    {
      key: "annualQuota",
      header: copy.table.annualQuota,
      className: "text-sm text-muted-foreground",
      render: renderAnnualBalance,
    },
    {
      key: "reason",
      header: copy.table.reason,
      className: "max-w-xs truncate text-sm text-muted-foreground",
      render: (request) => request.reason ?? "—",
    },
    {
      key: "status",
      header: copy.table.status,
      render: renderHistoryStatus,
    },
  ];

  if (branches.length === 0) {
    return (
      <AppEmptyState
        title={copy.emptyBranchTitle}
        description={copy.emptyBranchDescription}
        icon={<IconCalendarX />}
      />
    );
  }

  return (
    <>
      <AppListFrame
        contentScroll
        toolbar={
          <AppToolbar
            variant="inline"
            filters={
              <Select
                value={selectedBranchId?.toString() ?? ""}
                onValueChange={(value) => setSelectedBranchId(Number(value))}
              >
                <SelectTrigger
                  size={controlSize}
                  className="w-full sm:w-48"
                  aria-label={BRANCH_VI.select}
                >
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
            }
            actions={
              <>
                <span className="text-sm text-muted-foreground">
                  {copy.summary(pendingRows.length, requests.length)}
                </span>
                {isPending ? <Spinner /> : null}
              </>
            }
          />
        }
      >
        <AppPageTabs
          defaultValue="pending"
          paramKey="leave-view"
          items={[
            { value: "pending", label: copy.pendingTab(pendingRows.length) },
            {
              value: "approved-month",
              label: copy.approvedMonthTab,
              count: approvedMonthRows.length,
            },
            { value: "history", label: copy.historyTab(historyRows.length) },
          ]}
        >
          <TabsContent value="pending" className="mt-0">
            {pendingRows.length === 0 && !isPending ? (
              <AppEmptyState
                title={copy.emptyPendingTitle}
                description={copy.emptyPendingDescription}
                icon={<IconCalendarX />}
              />
            ) : pendingRows.length === 0 ? null : (
              <DataTable
                columns={pendingColumns}
                data={pendingRows}
                getRowKey={(request) => request.id}
                mobileBreakpoint={1024}
                rowClassName={() => (isPending ? "opacity-60" : undefined)}
                mobileCardRender={(request) =>
                  renderLeaveMobileCard(
                    request,
                    renderPendingActions(request, true),
                  )
                }
              />
            )}
          </TabsContent>

          <TabsContent value="approved-month" className="mt-0">
            <AppToolbar
              variant="inline"
              filters={
                <Select value={approvedMonth} onValueChange={setApprovedMonth}>
                  <SelectTrigger
                    size={controlSize}
                    className="w-40"
                    aria-label={copy.approvedMonthMonthLabel}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {approvedMonthOptions.map((month) => (
                      <SelectItem key={month} value={month}>
                        {month}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              }
            />
            <DataTable
              columns={historyColumns}
              data={approvedMonthRows}
              pageSize={25}
              getRowKey={(request) => request.id}
              mobileBreakpoint={1024}
              rowClassName={() => (isPending ? "opacity-60" : undefined)}
              mobileCardRender={(request) => renderLeaveMobileCard(request)}
            />
          </TabsContent>

          <TabsContent value="history" className="mt-0">
            {historyRows.length === 0 && !isPending ? (
              <AppEmptyState
                title={copy.emptyHistoryTitle}
                description={copy.emptyHistoryDescription}
                icon={<IconCalendarX />}
              />
            ) : historyRows.length === 0 ? null : (
              <DataTable
                columns={historyColumns}
                data={historyRows}
                pageSize={25}
                getRowKey={(request) => request.id}
                mobileBreakpoint={1024}
                rowClassName={() => (isPending ? "opacity-60" : undefined)}
                mobileCardRender={(request) => renderLeaveMobileCard(request)}
              />
            )}
          </TabsContent>
        </AppPageTabs>
      </AppListFrame>

      <FormDialog
        open={rejectTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRejectTarget(null);
        }}
        title={copy.rejectDialogTitle}
        description={
          rejectTarget
            ? `${getEmployeeName(rejectTarget)} · ${formatDateRange(
                rejectTarget.start_date,
                rejectTarget.end_date,
              )}`
            : copy.fallbackEmployee
        }
        schema={rejectFormSchema}
        defaultValues={{ reason: "" }}
        entityKey={rejectTarget?.id ?? "none"}
        onSubmit={handleReject}
        successMessage="Đã từ chối yêu cầu nghỉ"
        submitLabel={copy.rejectSubmit}
        submitVariant="destructive"
        cancelLabel={ACTIONS_VI.cancel}
        contentClassName="sm:max-w-md"
      >
        {(form) => (
          <TextareaField
            control={form.control}
            name="reason"
            label={copy.rejectReasonLabel}
            maxLength={500}
            placeholder={copy.rejectReasonPlaceholder}
          />
        )}
      </FormDialog>
    </>
  );
}
