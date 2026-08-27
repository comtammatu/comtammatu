"use client";

import { useMemo, useState, useTransition } from "react";
import { ACTIONS_VI } from "@comtammatu/shared/messages";
import { LEAVE_TYPE_LABELS_VI } from "@comtammatu/shared/labels";
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
import { CalendarX as IconCalendarX, Plus as IconPlus, X as IconX } from "lucide-react";
import {
  EmployeeActionBar,
  EmployeePanel,
} from "../components/staff-runtime-page";
import {
  BranchOperatorActionBar,
  BranchOperatorPanel,
} from "@lib/branch-operator/components/branch-operator-page";
import { cancelLeaveRequest, submitLeaveRequest } from "./actions";
import type { LeaveRequestRow } from "./page";
import {
  LeaveRequestFields,
  countInclusiveDays,
  formatLeaveDateRange,
  leaveRequestDefaults,
  leaveRequestSchema,
  type LeaveRequestFormValues,
} from "./leave-request-form";
import { messages } from "@lib/messages";
import { AppEmptyState } from "@/components/surface";
import { FormDialog, FormSheet } from "@/components/form";
import { StatusBadge } from "@/components/status-badge";

interface LeaveRequestClientProps {
  branchId: number | null;
  initialRequests: LeaveRequestRow[];
  plane?: "employee" | "branch";
}

const copy = messages.employee.leave;

export function LeaveRequestClient({
  branchId,
  initialRequests,
  plane = "employee",
}: LeaveRequestClientProps) {
  const [requests, setRequests] = useState<LeaveRequestRow[]>(initialRequests);
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const defaultValues = useMemo(() => leaveRequestDefaults(), [open]);
  const todayIso = defaultValues.startDate;
  const Panel = plane === "branch" ? BranchOperatorPanel : EmployeePanel;
  const ActionBar =
    plane === "branch" ? BranchOperatorActionBar : EmployeeActionBar;
  const LeaveForm = plane === "branch" ? FormSheet : FormDialog;

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
        toast.error(result.error ?? copy.submitFailed);
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
      <Panel title={copy.myRequestsTitle}>
        <div className="flex flex-col gap-3">
          <ActionBar>
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
          </ActionBar>
          {requests.length === 0 ? (
            <AppEmptyState
              title={copy.emptyTitle}
              description={copy.emptyDescription}
              icon={<IconCalendarX />}
            />
          ) : (
            <ItemGroup className="grid gap-2 lg:grid-cols-2">
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
                        {formatLeaveDateRange(
                          request.start_date,
                          request.end_date,
                        )}
                        {days ? ` · ${days} ${copy.dayUnit}` : null}
                        {request.reason ? ` · ${request.reason}` : null}
                      </ItemDescription>
                      {request.status === "rejected" &&
                      request.rejected_reason ? (
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
                          size="icon-touch"
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
        </div>
      </Panel>

      <LeaveForm
        open={open}
        onOpenChange={setOpen}
        title={copy.dialogTitle}
        schema={leaveRequestSchema}
        defaultValues={defaultValues}
        entityKey={open ? "open" : "closed"}
        onSubmit={handleSubmit}
        successMessage={copy.submittedToast}
        submitLabel={copy.submit}
        cancelLabel={ACTIONS_VI.cancel}
        contentClassName="sm:max-w-md"
      >
        {(form) => <LeaveRequestFields form={form} todayIso={todayIso} />}
      </LeaveForm>
    </>
  );
}
