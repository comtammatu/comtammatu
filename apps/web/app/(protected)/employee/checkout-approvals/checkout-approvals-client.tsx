"use client";

/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: existing employee checkout approval surface keeps operational copy inline */

import { useState, useTransition } from "react";
import {
  CheckCircle2 as IconCheck,
  ClipboardCheck as IconClipboardCheck,
  RotateCcw as IconAdjust,
} from "lucide-react";
import { Alert, AlertDescription } from "@comtammatu/ui/components/alert";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { Label } from "@comtammatu/ui/components/label";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { toast } from "@comtammatu/ui/components/sonner";
import { Textarea } from "@comtammatu/ui/components/textarea";
import { confirm } from "@comtammatu/ui/components/confirm-dialog";
import { AppEmptyState } from "@/components/surface";
import { EmployeeDetailList, EmployeeFrame } from "../components/employee-page";
import type {
  ConsumptionReportStatus,
  ConsumptionReportView,
} from "../consumption-actions";
import {
  approveConsumptionReport,
  requestConsumptionAdjustment,
} from "../consumption-actions";
import { approveCheckoutRequest } from "../clock/actions";

export interface CheckoutApprovalItem {
  id: number;
  employeeName: string;
  employeeCode: string | null;
  branchName: string | null;
  dateLabel: string;
  checkInLabel: string;
  requestedLabel: string;
  shiftLabel: string;
  requestKindLabel: string;
  requiresConsumptionReport: boolean;
  consumptionReport: ConsumptionReportView | null;
}

interface CheckoutApprovalsClientProps {
  items: CheckoutApprovalItem[];
  canApprove: boolean;
}

function hasApprovedConsumptionReport(item: CheckoutApprovalItem) {
  if (!item.requiresConsumptionReport) return true;
  const status = item.consumptionReport?.status;
  return status === "approved" || status === "applied";
}

function getCheckoutBlockLabel(item: CheckoutApprovalItem) {
  if (!item.requiresConsumptionReport) return null;
  const status = item.consumptionReport?.status;
  if (status === "approved" || status === "applied") return null;
  if (!status || status === "draft") return "Chưa gửi tiêu hao";
  if (status === "submitted") return "Cần duyệt tiêu hao";
  if (status === "needs_changes") return "Chờ nhân viên chỉnh sửa";
  return "Cần xử lý tiêu hao";
}

export function CheckoutApprovalsClient({
  items,
  canApprove,
}: CheckoutApprovalsClientProps) {
  const [localItems, setLocalItems] = useState(items);
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [pendingConsumptionId, setPendingConsumptionId] = useState<
    number | null
  >(null);
  const [adjustingReportId, setAdjustingReportId] = useState<number | null>(
    null,
  );
  const [adjustmentNote, setAdjustmentNote] = useState("");
  const [isPending, startTransition] = useTransition();

  async function approve(item: CheckoutApprovalItem) {
    if (!hasApprovedConsumptionReport(item)) {
      toast.error("Cần duyệt báo cáo tiêu hao trước khi duyệt kết ca.");
      return;
    }

    const ok = await confirm({
      title: "Duyệt kết ca?",
      description:
        "Giờ ra sẽ được ghi vào bảng công của nhân viên và không thể hoàn tác.",
      details: [
        { label: "Nhân viên", value: item.employeeName },
        { label: "Giờ ra", value: item.requestedLabel },
      ],
      confirmText: "Duyệt",
      variant: "destructive",
    });
    if (!ok) return;
    setPendingId(item.id);
    startTransition(async () => {
      const result = await approveCheckoutRequest({ attendanceId: item.id });
      setPendingId(null);

      if (!result.success) {
        toast.error(result.error ?? "Không thể duyệt kết ca.");
        return;
      }

      setLocalItems((current) =>
        current.filter((currentItem) => currentItem.id !== item.id),
      );
      toast.success(`Đã duyệt kết ca cho ${item.employeeName}`);
    });
  }

  async function approveConsumption(item: CheckoutApprovalItem) {
    const report = item.consumptionReport;
    if (!report) return;

    const ok = await confirm({
      title: report.noConsumption
        ? "Duyệt không phát sinh?"
        : "Duyệt và áp Inventory?",
      description: report.noConsumption
        ? "Báo cáo sẽ được đánh dấu đã duyệt, không sinh phiếu tiêu hao."
        : "Thao tác này ghi nhận tiêu hao vào Inventory và không thể hoàn tác từ màn này.",
      details: [
        { label: "Nhân viên", value: item.employeeName },
        {
          label: "Tiêu hao",
          value: report.noConsumption
            ? "Không phát sinh"
            : `${report.lines.length} dòng nguyên liệu`,
        },
      ],
      confirmText: report.noConsumption ? "Duyệt" : "Duyệt & áp Inventory",
      variant: report.noConsumption ? "default" : "destructive",
    });
    if (!ok) return;

    setPendingConsumptionId(report.id);
    startTransition(async () => {
      const result = await approveConsumptionReport({ reportId: report.id });
      setPendingConsumptionId(null);

      if (!result.success) {
        toast.error(result.error ?? "Không thể duyệt tiêu hao.");
        return;
      }

      setLocalItems((current) =>
        current.map((currentItem) =>
          currentItem.id === item.id && currentItem.consumptionReport
            ? {
                ...currentItem,
                consumptionReport: {
                  ...currentItem.consumptionReport,
                  status:
                    result.data?.stockIssueId == null ? "approved" : "applied",
                  stockIssueId:
                    result.data?.stockIssueId ??
                    currentItem.consumptionReport.stockIssueId,
                },
              }
            : currentItem,
        ),
      );
      toast.success(
        result.data?.stockIssueId == null
          ? "Đã duyệt xác nhận không phát sinh tiêu hao."
          : "Đã duyệt tiêu hao và ghi nhận Inventory.",
      );
    });
  }

  function requestAdjustment(item: CheckoutApprovalItem) {
    const reportId = item.consumptionReport?.id;
    if (!reportId) return;
    if (adjustmentNote.trim().length < 3) {
      toast.error("Nhập lý do cần chỉnh sửa.");
      return;
    }

    setPendingConsumptionId(reportId);
    startTransition(async () => {
      const result = await requestConsumptionAdjustment({
        reportId,
        reviewNote: adjustmentNote,
      });
      setPendingConsumptionId(null);

      if (!result.success) {
        toast.error(result.error ?? "Không thể yêu cầu chỉnh sửa.");
        return;
      }

      setLocalItems((current) =>
        current.map((currentItem) =>
          currentItem.id === item.id && currentItem.consumptionReport
            ? {
                ...currentItem,
                consumptionReport: {
                  ...currentItem.consumptionReport,
                  status: "needs_changes",
                  reviewNote: adjustmentNote,
                },
              }
            : currentItem,
        ),
      );
      setAdjustingReportId(null);
      setAdjustmentNote("");
      toast.success("Đã yêu cầu nhân viên chỉnh sửa báo cáo tiêu hao.");
    });
  }

  if (localItems.length === 0) {
    return (
      <AppEmptyState
        title="Không có yêu cầu chờ duyệt"
        description="Khi nhân viên gửi kết ca, yêu cầu sẽ xuất hiện tại đây."
        icon={<IconClipboardCheck />}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {!canApprove ? (
        <Alert className="border-warning/30 bg-warning/10">
          <AlertDescription>
            Tài khoản này chưa có quyền duyệt kết ca cho chi nhánh hiện tại.
          </AlertDescription>
        </Alert>
      ) : null}

      <ItemGroup className="gap-2">
        {localItems.map((item) => {
          const approving = pendingId === item.id && isPending;
          const consumptionPending =
            item.consumptionReport?.id === pendingConsumptionId && isPending;
          const checkoutBlockLabel = getCheckoutBlockLabel(item);
          const blocksCheckout = checkoutBlockLabel !== null;
          return (
            <Item key={item.id} variant="outline" className="items-start">
              <ItemMedia variant="icon">
                <IconClipboardCheck />
              </ItemMedia>
              <ItemContent>
                <ItemTitle>
                  {item.employeeName}
                  {item.employeeCode ? (
                    <span className="ml-2 font-mono text-xs text-muted-foreground">
                      {item.employeeCode}
                    </span>
                  ) : null}
                </ItemTitle>
                <ItemDescription>
                  {item.requestKindLabel}
                  {item.branchName ? ` · ${item.branchName}` : ""}
                  {" · "}
                  {item.shiftLabel}
                </ItemDescription>
                <EmployeeDetailList
                  columns={3}
                  rows={[
                    {
                      label: "Ngày",
                      value: (
                        <span className="font-mono">{item.dateLabel}</span>
                      ),
                    },
                    {
                      label: "Vào ca",
                      value: (
                        <span className="font-mono">{item.checkInLabel}</span>
                      ),
                    },
                    {
                      label: "Yêu cầu ra",
                      value: (
                        <span className="font-mono">{item.requestedLabel}</span>
                      ),
                    },
                  ]}
                />
                {item.requiresConsumptionReport ? (
                  <ConsumptionReview
                    item={item}
                    pending={consumptionPending}
                    adjustingReportId={adjustingReportId}
                    adjustmentNote={adjustmentNote}
                    onApprove={() => approveConsumption(item)}
                    onStartAdjustment={() => {
                      setAdjustingReportId(item.consumptionReport?.id ?? null);
                      setAdjustmentNote(
                        item.consumptionReport?.reviewNote ?? "",
                      );
                    }}
                    onCancelAdjustment={() => {
                      setAdjustingReportId(null);
                      setAdjustmentNote("");
                    }}
                    onAdjustmentNoteChange={setAdjustmentNote}
                    onSubmitAdjustment={() => requestAdjustment(item)}
                  />
                ) : null}
              </ItemContent>
              <ItemActions>
                <Badge variant="warning">Chờ duyệt</Badge>
                {checkoutBlockLabel ? (
                  <Badge
                    variant={
                      item.consumptionReport?.status === "needs_changes"
                        ? "destructive"
                        : "warning"
                    }
                  >
                    {checkoutBlockLabel}
                  </Badge>
                ) : null}
                <Button
                  size="sm"
                  disabled={
                    !canApprove || approving || isPending || blocksCheckout
                  }
                  onClick={() => approve(item)}
                >
                  {approving ? (
                    <Spinner data-icon="inline-start" />
                  ) : (
                    <IconCheck data-icon="inline-start" />
                  )}
                  Duyệt kết ca
                </Button>
              </ItemActions>
            </Item>
          );
        })}
      </ItemGroup>
    </div>
  );
}

const consumptionStatusLabel: Record<ConsumptionReportStatus, string> = {
  draft: "Nháp",
  submitted: "Chờ duyệt tiêu hao",
  needs_changes: "Cần chỉnh sửa",
  approved: "Đã duyệt - không phát sinh",
  applied: "Đã áp Inventory",
  cancelled: "Đã hủy",
};

function consumptionBadgeVariant(
  status: ConsumptionReportStatus,
): "secondary" | "warning" | "destructive" | "success" {
  if (status === "submitted") return "warning";
  if (status === "needs_changes") return "destructive";
  if (status === "approved" || status === "applied") return "success";
  return "secondary";
}

function ConsumptionReview({
  item,
  pending,
  adjustingReportId,
  adjustmentNote,
  onApprove,
  onStartAdjustment,
  onCancelAdjustment,
  onAdjustmentNoteChange,
  onSubmitAdjustment,
}: {
  item: CheckoutApprovalItem;
  pending: boolean;
  adjustingReportId: number | null;
  adjustmentNote: string;
  onApprove: () => void;
  onStartAdjustment: () => void;
  onCancelAdjustment: () => void;
  onAdjustmentNoteChange: (value: string) => void;
  onSubmitAdjustment: () => void;
}) {
  const report = item.consumptionReport;
  if (!report) {
    return (
      <Alert className="mt-3 border-warning/30 bg-warning/10">
        <AlertDescription>
          Chưa có báo cáo tiêu hao bếp cho ca này, nên chưa thể duyệt kết ca.
        </AlertDescription>
      </Alert>
    );
  }

  const canReview = report.status === "submitted";
  const isAdjusting = adjustingReportId === report.id;

  return (
    <EmployeeFrame pad="sm" className="mt-3 flex flex-col gap-3 bg-muted/20">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">Tiêu hao bếp trong ngày</p>
          <p className="text-xs text-muted-foreground">
            Chỉ áp Inventory sau khi duyệt.
          </p>
        </div>
        <Badge variant={consumptionBadgeVariant(report.status)}>
          {consumptionStatusLabel[report.status]}
        </Badge>
      </div>

      {report.reviewNote ? (
        <Alert className="border-warning/30 bg-warning/10">
          <AlertDescription>
            <span className="font-medium">Lý do chỉnh sửa: </span>
            {report.reviewNote}
          </AlertDescription>
        </Alert>
      ) : null}

      {report.lines.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          {report.lines.map((line) => (
            <EmployeeFrame
              key={line.id}
              pad="sm"
              className="grid gap-2 bg-background text-sm sm:grid-cols-[minmax(0,1fr)_120px_minmax(0,1fr)]"
            >
              <span className="font-medium">{line.ingredientName}</span>
              <span className="font-mono">
                {line.quantity} {line.unit}
              </span>
              <span className="text-muted-foreground">{line.note ?? "—"}</span>
            </EmployeeFrame>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          {report.noConsumption
            ? "Nhân viên xác nhận không phát sinh tiêu hao trong ca này."
            : "Báo cáo chưa có dòng nguyên liệu."}
        </p>
      )}

      {canReview ? (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            disabled={pending}
            onClick={onApprove}
          >
            {pending ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <IconCheck data-icon="inline-start" />
            )}
            {report.noConsumption
              ? "Duyệt không phát sinh"
              : "Duyệt & áp Inventory"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={onStartAdjustment}
          >
            <IconAdjust data-icon="inline-start" />
            Yêu cầu chỉnh sửa
          </Button>
        </div>
      ) : null}

      {isAdjusting ? (
        <div className="flex flex-col gap-2">
          <Label>Lý do cần chỉnh sửa</Label>
          <Textarea
            value={adjustmentNote}
            onChange={(event) => onAdjustmentNoteChange(event.target.value)}
            placeholder="Ví dụ: số lượng sườn chưa khớp tồn cuối ca"
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              disabled={pending}
              onClick={onSubmitAdjustment}
            >
              Gửi yêu cầu chỉnh sửa
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={onCancelAdjustment}
            >
              Hủy
            </Button>
          </div>
        </div>
      ) : null}
    </EmployeeFrame>
  );
}
