"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { z } from "zod";
import {
  CalendarX as IconCalendarX,
  Check as IconCheck,
  History as IconHistory,
  X as IconX,
} from "lucide-react";
import {
  formatVNBusinessDate,
  getVNMonthEndDateString,
  getVNMonthSequenceBack,
  getVNMonthString,
} from "@comtammatu/shared/time";
import { ACTIONS_VI } from "@comtammatu/shared/messages";
import { Button } from "@comtammatu/ui/components/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { Spinner } from "@comtammatu/ui/components/spinner";
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
  type LeaveRequestStatus,
} from "@lib/hr/leave-request-model";
import { countInclusiveDays } from "@lib/hr/payroll-day-math";
import { StatusBadge } from "@/components/status-badge";
import { AppEmptyState, AppListFrame, AppToolbar } from "@/components/surface";
import { useFormControlSize } from "@/components/form/control-size";
import { AppDialog, FormDialog, TextareaField } from "@/components/form";
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
import { getHrScopeBranchId, type HrBranchScope } from "@/lib/hr-scope";

interface LeaveRequestsTableProps {
  branches: BranchOption[];
  branchScope: HrBranchScope;
  historyPanelOpen?: boolean;
  embedded?: boolean;
}

const copy = messages.hr.leave;

const rejectFormSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

type RejectFormValues = z.infer<typeof rejectFormSchema>;

type HistoryStatusFilter = "all" | LeaveRequestStatus;

function formatDateRange(startDate: string, endDate: string): string {
  if (startDate === endDate) return formatVNBusinessDate(startDate);
  return `${formatVNBusinessDate(startDate)} - ${formatVNBusinessDate(endDate)}`;
}

function getEmployeeName(request: LeaveRequestRow): string {
  return getLeaveRequestEmployeeName(request, copy.fallbackEmployee);
}

export function LeaveRequestsTable({
  branches,
  branchScope,
  historyPanelOpen = false,
  embedded = false,
}: LeaveRequestsTableProps) {
  const controlSize = useFormControlSize();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [requests, setRequests] = useState<LeaveRequestRow[]>([]);
  const [historyMonth, setHistoryMonth] = useState(getVNMonthString);
  const [historyStatus, setHistoryStatus] =
    useState<HistoryStatusFilter>("all");
  const [isPending, startTransition] = useTransition();
  const [rejectTarget, setRejectTarget] = useState<LeaveRequestRow | null>(
    null,
  );

  const branchIds = useMemo(() => {
    if (branchScope === "office") return [];
    if (branchScope === "all") return branches.map((branch) => branch.id);
    const branchId = getHrScopeBranchId(branchScope);
    return branchId != null && branches.some((branch) => branch.id === branchId)
      ? [branchId]
      : [];
  }, [branches, branchScope]);
  const eventBranchId = branchIds.length === 1 ? branchIds[0]! : null;
  const canLoad =
    branchScope === "office" ||
    branchIds.length > 0 ||
    (branchScope === "all" && branches.length > 0);

  const setHistoryPanelOpen = useCallback(
    (open: boolean) => {
      const params = new URLSearchParams(searchParams.toString());
      if (open) params.set("panel", "leave-history");
      else params.set("panel", "leave");
      const q = params.toString();
      router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const load = useCallback(() => {
    if (branchScope !== "office" && branchIds.length === 0) {
      setRequests([]);
      return;
    }
    startTransition(async () => {
      const results =
        branchScope === "office"
          ? [await fetchLeaveRequests({ branchId: null })]
          : await Promise.all(
              branchIds.map((branchId) => fetchLeaveRequests({ branchId })),
            );
      const failed = results.find((result) => !result.success);
      if (failed && !failed.success) {
        toast.error(failed.error ?? copy.loadFailed);
        return;
      }
      const byId = new Map<number, LeaveRequestRow>();
      for (const result of results) {
        if (!result.success) continue;
        for (const request of (result.data as LeaveRequestRow[]) ?? []) {
          byId.set(request.id, request);
        }
      }
      setRequests(
        [...byId.values()].sort((a, b) =>
          b.created_at.localeCompare(a.created_at),
        ),
      );
    });
  }, [branchIds, branchScope]);

  useEffect(() => {
    load();
  }, [load]);

  const reloadSelectedBranch = useCallback(() => {
    load();
  }, [load]);

  useBranchOpsEvents({
    branchId: eventBranchId,
    enabled: eventBranchId !== null,
    filter: { tables: ["leave_requests"] },
    onEvent: reloadSelectedBranch,
  });

  const pendingRows = useMemo(
    () => requests.filter((request) => request.status === "pending"),
    [requests],
  );
  const historyRows = useMemo(() => {
    const [year, month] = historyMonth.split("-").map(Number);
    const startDate = `${historyMonth}-01`;
    const endDate = getVNMonthEndDateString(year!, month!);

    return requests.filter((request) => {
      if (request.status === "pending") return false;
      if (historyStatus !== "all" && request.status !== historyStatus) {
        return false;
      }
      return request.start_date <= endDate && request.end_date >= startDate;
    });
  }, [historyMonth, historyStatus, requests]);
  const historyMonthOptions = getVNMonthSequenceBack(6).map(({ date }) =>
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
      load();
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

  function leaveColumns(
    mode: "pending" | "history",
  ): DataTableColumn<LeaveRequestRow>[] {
    return [
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
      mode === "pending"
        ? {
            key: "actions",
            header: copy.table.actions,
            className: "w-32 text-right",
            render: (request) => renderPendingActions(request),
          }
        : {
            key: "status",
            header: copy.table.status,
            render: renderHistoryStatus,
          },
    ];
  }

  const pendingColumns = leaveColumns("pending");
  const historyColumns = leaveColumns("history");

  if (!canLoad) {
    return (
      <AppEmptyState
        title={copy.emptyBranchTitle}
        description={copy.emptyBranchDescription}
        icon={<IconCalendarX />}
      />
    );
  }

  const pendingBody =
    pendingRows.length === 0 && !isPending ? (
      <AppEmptyState
        title={copy.emptyPendingTitle}
        description={copy.emptyPendingDescription}
        icon={<IconCalendarX />}
      />
    ) : pendingRows.length === 0 ? (
      <div className="flex items-center justify-center py-4">
        <Spinner />
      </div>
    ) : (
      <DataTable
        columns={pendingColumns}
        data={pendingRows}
        getRowKey={(request) => request.id}
        mobileBreakpoint={1024}
        rowClassName={() => (isPending ? "opacity-60" : undefined)}
        mobileCardRender={(request) =>
          renderLeaveMobileCard(request, renderPendingActions(request, true))
        }
      />
    );

  return (
    <>
      {embedded ? (
        pendingBody
      ) : (
        <AppListFrame
          contentScroll
          toolbar={
            <AppToolbar
              variant="inline"
              actions={
                <>
                  <span className="text-sm text-muted-foreground">
                    {copy.pendingTab(pendingRows.length)}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size={controlSize === "touch" ? "touch" : "default"}
                    onClick={() => setHistoryPanelOpen(true)}
                  >
                    <IconHistory data-icon="inline-start" />
                    {copy.historyAction}
                  </Button>
                  {isPending ? <Spinner /> : null}
                </>
              }
            />
          }
        >
          {pendingBody}
        </AppListFrame>
      )}

      <AppDialog
        open={historyPanelOpen}
        onOpenChange={setHistoryPanelOpen}
        title={copy.historyDialogTitle}
        description={copy.historyDialogDescription}
        contentClassName="sm:max-w-4xl"
      >
        <AppToolbar
          variant="inline"
          filters={
            <>
              <Select value={historyMonth} onValueChange={setHistoryMonth}>
                <SelectTrigger
                  size={controlSize}
                  className="w-40"
                  aria-label={copy.approvedMonthMonthLabel}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {historyMonthOptions.map((month) => (
                    <SelectItem key={month} value={month}>
                      {month}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={historyStatus}
                onValueChange={(value) => {
                  if (
                    value === "all" ||
                    value === "approved" ||
                    value === "rejected" ||
                    value === "cancelled"
                  ) {
                    setHistoryStatus(value);
                  }
                }}
              >
                <SelectTrigger
                  size={controlSize}
                  className="w-44"
                  aria-label={copy.historyStatusFilterLabel}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{copy.historyStatusAll}</SelectItem>
                  <SelectItem value="approved">
                    {copy.status.approved}
                  </SelectItem>
                  <SelectItem value="rejected">
                    {copy.status.rejected}
                  </SelectItem>
                  <SelectItem value="cancelled">
                    {copy.status.cancelled}
                  </SelectItem>
                </SelectContent>
              </Select>
            </>
          }
        />
        {historyRows.length === 0 ? (
          <AppEmptyState
            title={copy.emptyHistoryTitle}
            description={copy.emptyHistoryDescription}
            icon={<IconCalendarX />}
          />
        ) : (
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
      </AppDialog>

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
