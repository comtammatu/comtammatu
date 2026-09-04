"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check as IconCheck,
  CheckCircle2 as IconCheckCircle2,
  Circle as IconCircle,
  ClipboardCheck as IconClipboardCheck,
  Eye as IconEye,
  X as IconX,
} from "lucide-react";
import { ACTIONS_VI } from "@comtammatu/shared/messages";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Label } from "@comtammatu/ui/components/label";
import { Textarea } from "@comtammatu/ui/components/textarea";
import { toast } from "@comtammatu/ui/components/sonner";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemHeader,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { AppDialog } from "@/components/form/form-dialog";
import {
  AppListFrame,
  AppPageHeader,
} from "@/components/surface";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import {
  RowActionsContextMenuItems,
  RowActionsMenu,
  type RowActionItem,
} from "@/components/row-actions-menu";
import { messages } from "@lib/messages";
import type { CheckoutApprovalItem } from "@lib/staff-runtime/checkout-approvals/data";
import {
  approveCheckoutRequest,
  rejectCheckoutRequest,
} from "@lib/staff-runtime/clock/actions";

const copy = messages.hr.checkoutApprovalsQueue;

interface CheckoutApprovalsListClientProps {
  items: CheckoutApprovalItem[];
  canApprove: boolean;
  focusAttendanceId?: number;
}

export function CheckoutApprovalsListClient({
  items: initialItems,
  canApprove,
  focusAttendanceId,
}: CheckoutApprovalsListClientProps) {
  const router = useRouter();
  const [items, setItems] = useState<CheckoutApprovalItem[]>(initialItems);
  const [isPending, startTransition] = useTransition();

  // Rejection Dialog State
  const [rejectTarget, setRejectTarget] = useState<CheckoutApprovalItem | null>(
    null,
  );
  const [rejectReason, setRejectReason] = useState("");

  // Details Dialog State
  const [detailsTarget, setDetailsTarget] =
    useState<CheckoutApprovalItem | null>(() => {
      if (focusAttendanceId) {
        return (
          initialItems.find((item) => item.id === focusAttendanceId) ?? null
        );
      }
      return null;
    });

  const handleApprove = async (item: CheckoutApprovalItem) => {
    if (!canApprove || isPending) return;

    startTransition(async () => {
      const result = await approveCheckoutRequest({ attendanceId: item.id });
      if (result.success) {
        toast.success(`Đã duyệt kết ca cho ${item.employeeName}`);
        setItems((prev) => prev.filter((i) => i.id !== item.id));
        if (detailsTarget?.id === item.id) {
          setDetailsTarget(null);
        }
        router.refresh();
      } else {
        toast.error(result.error ?? "Duyệt kết ca thất bại");
      }
    });
  };

  const handleReject = async () => {
    if (!rejectTarget || isPending) return;
    if (rejectReason.trim().length < 3) {
      toast.error("Vui lòng nhập lý do từ chối ít nhất 3 ký tự");
      return;
    }

    const item = rejectTarget;
    startTransition(async () => {
      const result = await rejectCheckoutRequest({
        attendanceId: item.id,
        note: rejectReason.trim(),
      });
      if (result.success) {
        toast.success(`Đã từ chối kết ca cho ${item.employeeName}`);
        setItems((prev) => prev.filter((i) => i.id !== item.id));
        setRejectTarget(null);
        setRejectReason("");
        if (detailsTarget?.id === item.id) {
          setDetailsTarget(null);
        }
        router.refresh();
      } else {
        toast.error(result.error ?? "Từ chối kết ca thất bại");
      }
    });
  };

  const rowActions = (item: CheckoutApprovalItem): RowActionItem[] => [
    {
      key: "approve",
      label: copy.approveCheckout,
      icon: <IconCheck className="size-4" />,
      disabled: !canApprove || isPending,
      onSelect: () => handleApprove(item),
    },
    {
      key: "details",
      label: ACTIONS_VI.viewDetails,
      icon: <IconEye className="size-4" />,
      onSelect: () => setDetailsTarget(item),
    },
    {
      key: "reject",
      label: ACTIONS_VI.reject,
      icon: <IconX className="size-4" />,
      disabled: !canApprove || isPending,
      destructive: true,
      onSelect: () => {
        setRejectReason("");
        setRejectTarget(item);
      },
    },
  ];

  const columns: DataTableColumn<CheckoutApprovalItem>[] = [
    {
      key: "time",
      header: "Thời gian",
      sortable: true,
      sortValue: (row) => row.requestedLabel,
      render: (row) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium text-foreground">
            {row.requestedLabel}
          </span>
          <span className="text-2xs text-muted-foreground">
            {row.dateLabel}
          </span>
        </div>
      ),
    },
    {
      key: "employee",
      header: copy.colEmployee,
      sortable: true,
      sortValue: (row) => row.employeeName,
      render: (row) => (
        <div className="flex flex-col gap-1">
          <span className="font-semibold text-foreground">
            {row.employeeName}
          </span>
          {row.employeeCode ? (
            <span className="text-2xs text-muted-foreground font-mono">
              {row.employeeCode}
            </span>
          ) : null}
        </div>
      ),
    },
    {
      key: "branch",
      header: copy.colBranch,
      sortable: true,
      sortValue: (row) => row.branchName ?? "",
      render: (row) => (
        <span className="text-sm text-foreground">
          {row.branchName ?? copy.allChain}
        </span>
      ),
    },
    {
      key: "shift",
      header: copy.colShift,
      render: (row) => (
        <div className="flex flex-col gap-1">
          <span className="text-sm text-foreground">{row.shiftName}</span>
          <span className="text-2xs text-muted-foreground">
            {copy.clockInLabel(row.checkInLabel)}
          </span>
        </div>
      ),
    },
    {
      key: "checklist",
      header: copy.colTasks,
      render: (row) => {
        const total = row.checklist.length;
        const done = row.checklist.filter((c) => c.isDone).length;
        const allDone = total > 0 && done === total;
        return (
          <div className="flex items-center gap-2">
            <Badge
              variant={allDone ? "success" : done > 0 ? "warning" : "outline"}
              className="text-2xs font-normal"
            >
              {total > 0 ? copy.tasksCount(done, total) : copy.noTasks}
            </Badge>
          </div>
        );
      },
    },
    {
      key: "actions",
      header: <span className="sr-only">{copy.actionsAria}</span>,
      className: "text-end",
      render: (row) => (
        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!canApprove || isPending}
            onClick={(e) => {
              e.stopPropagation();
              handleApprove(row);
            }}
          >
            <IconCheck className="size-3.5 mr-1" />
            {copy.approveAction}
          </Button>
          <RowActionsMenu
            items={rowActions(row)}
            triggerSize="icon-sm"
            label={copy.menuAria}
          />
        </div>
      ),
    },
  ];

  return (
    <>
      <AppPageHeader
        title={copy.pageTitle}
        description={copy.pageDescription}
      />
      <AppListFrame>
        <DataTable
          columns={columns}
          data={items}
          getRowKey={(row) => row.id}
          mobileBreakpoint={1024}
          emptyTitle={copy.emptyTitle}
          emptyDescription={copy.emptyDescription}
          emptyIcon={<IconClipboardCheck className="size-8 text-muted-foreground" />}
          emptyMode="no-data"
          onRowClick={(row) => setDetailsTarget(row)}
          renderRowContextMenu={(row) => (
            <RowActionsContextMenuItems items={rowActions(row)} />
          )}
          mobileCardRender={(row) => {
            const total = row.checklist.length;
            const done = row.checklist.filter((c) => c.isDone).length;
            return (
              <Item variant="outline" className="w-full text-left">
                <ItemHeader>
                  <ItemTitle className="font-semibold">
                    {row.employeeName}
                  </ItemTitle>
                  <Badge
                    variant={done === total && total > 0 ? "success" : "outline"}
                    className="text-xs"
                  >
                    {total > 0 ? `${done}/${total} việc` : "Không có việc"}
                  </Badge>
                </ItemHeader>
                <ItemContent className="min-w-0 text-left">
                  <ItemDescription className="text-xs text-muted-foreground">
                    {row.branchName ?? copy.allChain} · {row.shiftName}
                  </ItemDescription>
                  <ItemDescription className="text-xs text-muted-foreground">
                    {copy.clockInPrefix} {row.checkInLabel} · {copy.requestedPrefix} {row.requestedLabel}
                  </ItemDescription>
                </ItemContent>
                <ItemActions className="basis-full justify-end gap-2 pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!canApprove || isPending}
                    onClick={() => {
                      setRejectReason("");
                      setRejectTarget(row);
                    }}
                  >
                    {ACTIONS_VI.reject}
                  </Button>
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    disabled={!canApprove || isPending}
                    onClick={() => handleApprove(row)}
                  >
                    <IconCheck className="size-3.5 mr-1" />
                    {copy.approveAction}
                  </Button>
                </ItemActions>
              </Item>
            );
          }}
        />
      </AppListFrame>

      {/* Reject Dialog */}
      <AppDialog
        open={rejectTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRejectTarget(null);
            setRejectReason("");
          }
        }}
        title={copy.rejectDialogTitle}
        description={
          rejectTarget
            ? copy.rejectDialogDescription(rejectTarget.employeeName)
            : undefined
        }
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="default"
              disabled={isPending}
              onClick={() => {
                setRejectTarget(null);
                setRejectReason("");
              }}
            >
              {ACTIONS_VI.cancel}
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="default"
              disabled={isPending || rejectReason.trim().length < 3}
              onClick={handleReject}
            >
              {copy.rejectButton}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-2 py-2">
          <Label htmlFor="reject-reason">{copy.rejectReasonLabel}</Label>
          <Textarea
            id="reject-reason"
            placeholder={copy.rejectReasonPlaceholder}
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            rows={3}
          />
        </div>
      </AppDialog>

      {/* Details Dialog */}
      <AppDialog
        open={detailsTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDetailsTarget(null);
        }}
        title={detailsTarget ? copy.detailsTitle(detailsTarget.employeeName) : ""}
        description={
          detailsTarget
            ? `${detailsTarget.branchName ?? copy.allChain} · ${detailsTarget.shiftLabel} · ${copy.requestedPrefix} ${detailsTarget.requestedLabel}`
            : undefined
        }
        footer={
          <div className="flex items-center justify-between w-full">
            <Button
              type="button"
              variant="outline"
              size="default"
              onClick={() => setDetailsTarget(null)}
            >
              {ACTIONS_VI.close}
            </Button>
            {detailsTarget && canApprove ? (
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="default"
                  disabled={isPending}
                  onClick={() => {
                    const item = detailsTarget;
                    setRejectReason("");
                    setRejectTarget(item);
                  }}
                >
                  {ACTIONS_VI.reject}
                </Button>
                <Button
                  type="button"
                  variant="default"
                  size="default"
                  disabled={isPending}
                  onClick={() => handleApprove(detailsTarget)}
                >
                  <IconCheck className="size-4 mr-1" />
                  {copy.approveCheckout}
                </Button>
              </div>
            ) : null}
          </div>
        }
      >
        {detailsTarget ? (
          <div className="flex flex-col gap-4 py-2">
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                {copy.shiftTasksHeader(detailsTarget.checklist.filter((c) => c.isDone).length, detailsTarget.checklist.length)}
              </h4>
              {detailsTarget.checklist.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">
                  {copy.noTasksForShift}
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {detailsTarget.checklist.map((item) => (
                    <Item
                      key={item.id}
                      variant="outline"
                      size="sm"
                      className="w-full text-left"
                    >
                      <ItemHeader>
                        <div className="flex items-center gap-2 min-w-0">
                          {item.isDone ? (
                            <IconCheckCircle2 className="size-4 text-success shrink-0" />
                          ) : (
                            <IconCircle className="size-4 text-muted-foreground/60 shrink-0" />
                          )}
                          <ItemTitle
                            className={`text-sm ${
                              item.isDone
                                ? "text-foreground font-medium"
                                : "text-muted-foreground"
                            }`}
                          >
                            {item.title}
                          </ItemTitle>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {item.isRequired ? (
                            <Badge variant="outline" className="text-2xs">
                              {copy.taskRequired}
                            </Badge>
                          ) : null}
                          {item.hasPhoto ? (
                            <Badge variant="secondary" className="text-2xs">
                              {copy.taskHasPhoto}
                            </Badge>
                          ) : null}
                        </div>
                      </ItemHeader>
                    </Item>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : null}
      </AppDialog>
    </>
  );
}
