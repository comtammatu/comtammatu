"use client";

/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: existing employee checkout approval surface keeps operational copy inline */

import { useEffect, useState, useTransition } from "react";
import {
  CheckCircle2 as IconCheck,
  ChevronRight as IconChevronRight,
  ClipboardCheck as IconClipboardCheck,
  X as IconX,
} from "lucide-react";
import { Alert, AlertDescription } from "@comtammatu/ui/components/alert";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { confirm } from "@comtammatu/ui/components/confirm-dialog";
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
import { SectionLabel } from "@comtammatu/ui/components/section-label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@comtammatu/ui/components/sheet";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { toast } from "@comtammatu/ui/components/sonner";
import { Textarea } from "@comtammatu/ui/components/textarea";
import { AppEmptyState } from "@/components/surface";
import { useOperatorUrlState } from "@lib/branch-operator/use-operator-url-state";
import {
  approveCheckoutRequest,
  rejectCheckoutRequest,
} from "../clock/actions";
import { EmployeeDetailList } from "../components/staff-runtime-page";

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
  checklist: {
    id: number;
    title: string;
    isDone: boolean;
    isRequired: boolean;
  }[];
}

interface CheckoutApprovalsClientProps {
  items: CheckoutApprovalItem[];
  canApprove: boolean;
  focusAttendanceId?: number;
}

function ApprovalRow({
  item,
  onOpenDetails,
}: {
  item: CheckoutApprovalItem;
  onOpenDetails: () => void;
}) {
  const checklistDone = item.checklist.filter((entry) => entry.isDone).length;
  const requiredRemaining = item.checklist.filter(
    (entry) => entry.isRequired && !entry.isDone,
  ).length;

  return (
    <Item variant="outline" className="p-0">
      <Button
        type="button"
        variant="ghost"
        size="touch"
        className="h-auto w-full touch-manipulation flex-nowrap justify-start py-3 text-left"
        onClick={onOpenDetails}
      >
        <ItemMedia variant="icon" className="shrink-0">
          <IconClipboardCheck />
        </ItemMedia>
        <ItemContent className="min-w-0 gap-1">
          <ItemTitle size="heading" className="flex-wrap">
            {item.employeeName}
            {item.employeeCode ? (
              <span className="font-mono text-xs text-muted-foreground">
                {item.employeeCode}
              </span>
            ) : null}
          </ItemTitle>
          <ItemDescription className="line-clamp-none">
            {item.shiftLabel} · Yêu cầu ra {item.requestedLabel}
          </ItemDescription>
          {item.checklist.length > 0 ? (
            <ItemDescription>
              Checklist {checklistDone}/{item.checklist.length}
            </ItemDescription>
          ) : null}
        </ItemContent>
        <ItemActions className="shrink-0">
          {requiredRemaining > 0 ? (
            <Badge variant="warning">{requiredRemaining} bắt buộc</Badge>
          ) : null}
          <IconChevronRight className="size-4 text-muted-foreground" />
        </ItemActions>
      </Button>
    </Item>
  );
}

export function CheckoutApprovalsClient({
  items,
  canApprove,
  focusAttendanceId,
}: CheckoutApprovalsClientProps) {
  const { replaceParams } = useOperatorUrlState();
  const [localItems, setLocalItems] = useState(items);
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(
    () => items.find((item) => item.id === focusAttendanceId)?.id ?? null,
  );
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [isPending, startTransition] = useTransition();

  const selected = localItems.find((item) => item.id === selectedId) ?? null;

  useEffect(() => {
    setLocalItems(items);
  }, [items]);

  useEffect(() => {
    if (
      selectedId !== null &&
      !localItems.some((item) => item.id === selectedId)
    ) {
      setSelectedId(null);
      setRejecting(false);
      setRejectReason("");
      replaceParams({ attendanceId: null });
    }
  }, [localItems, replaceParams, selectedId]);

  function openReview(item: CheckoutApprovalItem) {
    setSelectedId(item.id);
    setRejecting(false);
    setRejectReason("");
    replaceParams({ attendanceId: String(item.id) });
  }

  function closeReview() {
    setSelectedId(null);
    setRejecting(false);
    setRejectReason("");
    replaceParams({ attendanceId: null });
  }

  async function approve(item: CheckoutApprovalItem) {
    const checklistTotal = item.checklist.length;
    const checklistDone = item.checklist.filter((entry) => entry.isDone).length;
    const requiredRemaining = item.checklist.filter(
      (entry) => entry.isRequired && !entry.isDone,
    ).length;
    const ok = await confirm({
      title: "Duyệt kết ca?",
      description:
        requiredRemaining > 0
          ? "Ca còn việc bắt buộc chưa đánh dấu xong. Nếu vẫn duyệt, giờ ra sẽ được ghi vào bảng công."
          : "Giờ ra sẽ được ghi vào bảng công của nhân viên và không thể hoàn tác.",
      details: [
        { label: "Nhân viên", value: item.employeeName },
        { label: "Giờ ra", value: item.requestedLabel },
        ...(checklistTotal > 0
          ? [
              {
                label: "Checklist",
                value: `${checklistDone}/${checklistTotal} xong`,
              },
            ]
          : []),
      ],
      confirmText: "Duyệt",
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
      closeReview();
    });
  }

  function handleReject() {
    if (!selected) return;
    const item = selected;

    setPendingId(item.id);
    startTransition(async () => {
      const result = await rejectCheckoutRequest({
        attendanceId: item.id,
        note: rejectReason.trim() || undefined,
      });
      setPendingId(null);

      if (!result.success) {
        toast.error(result.error ?? "Không thể từ chối kết ca.");
        return;
      }

      setLocalItems((current) =>
        current.filter((currentItem) => currentItem.id !== item.id),
      );
      toast.success(`Đã từ chối kết ca cho ${item.employeeName}`);
      closeReview();
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

  const selectedChecklistDone =
    selected?.checklist.filter((entry) => entry.isDone).length ?? 0;
  const selectedRequiredRemaining =
    selected?.checklist.filter((entry) => entry.isRequired && !entry.isDone)
      .length ?? 0;

  return (
    <div className="flex flex-col gap-3">
      {!canApprove ? (
        <Alert className="border-warning/20 bg-warning/10">
          <AlertDescription>
            Tài khoản này chưa có quyền duyệt kết ca cho chi nhánh hiện tại.
          </AlertDescription>
        </Alert>
      ) : null}

      <ItemGroup className="gap-2">
        {localItems.map((item) => (
          <ApprovalRow
            key={item.id}
            item={item}
            onOpenDetails={() => openReview(item)}
          />
        ))}
      </ItemGroup>

      <Sheet
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open && !isPending) closeReview();
        }}
      >
        <SheetContent
          side="bottom"
          className="max-h-dvh-95 overflow-hidden bg-background p-0"
        >
          {selected ? (
            <>
              <SheetHeader>
                <SheetTitle>
                  {rejecting ? "Từ chối kết ca" : selected.employeeName}
                </SheetTitle>
                <SheetDescription>
                  {selected.employeeName} · {selected.shiftLabel}
                </SheetDescription>
              </SheetHeader>

              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
                <EmployeeDetailList
                  columns={3}
                  rows={[
                    { label: "Ngày", value: selected.dateLabel },
                    {
                      label: "Vào ca",
                      value: (
                        <span className="font-mono">
                          {selected.checkInLabel}
                        </span>
                      ),
                    },
                    {
                      label: "Yêu cầu ra",
                      value: (
                        <span className="font-mono">
                          {selected.requestedLabel}
                        </span>
                      ),
                    },
                  ]}
                />

                {rejecting ? (
                  <div className="mt-4 flex flex-col gap-2">
                    <Label htmlFor="checkout-reject-reason">
                      Lý do từ chối
                    </Label>
                    <Textarea
                      id="checkout-reject-reason"
                      name="rejectReason"
                      rows={3}
                      maxLength={500}
                      value={rejectReason}
                      disabled={isPending}
                      onChange={(event) => setRejectReason(event.target.value)}
                      placeholder="Nêu việc nhân viên cần hoàn tất trước khi ra ca"
                      autoFocus
                    />
                  </div>
                ) : (
                  <div className="mt-4 flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-3">
                      <SectionLabel>Checklist công việc</SectionLabel>
                      {selected.checklist.length > 0 ? (
                        <span className="font-mono text-xs text-muted-foreground">
                          {selectedChecklistDone}/{selected.checklist.length}
                        </span>
                      ) : null}
                    </div>

                    {selectedRequiredRemaining > 0 ? (
                      <Alert className="border-warning/20 bg-warning/10">
                        <AlertDescription>
                          Còn {selectedRequiredRemaining} việc bắt buộc chưa
                          xong.
                        </AlertDescription>
                      </Alert>
                    ) : null}

                    {selected.checklist.length > 0 ? (
                      <div className="flex flex-col divide-y rounded-md border">
                        {selected.checklist.map((entry) => (
                          <div
                            key={entry.id}
                            className="flex min-h-11 items-center gap-3 px-3 py-2 text-sm"
                          >
                            {entry.isDone ? (
                              <IconCheck className="size-4 shrink-0 text-success" />
                            ) : (
                              <span className="size-4 shrink-0 rounded-full border border-muted-foreground" />
                            )}
                            <span
                              className={
                                entry.isDone
                                  ? "flex-1 text-muted-foreground line-through"
                                  : "flex-1"
                              }
                            >
                              {entry.title}
                            </span>
                            {entry.isRequired ? (
                              <Badge variant="outline">Bắt buộc</Badge>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Không có checklist công việc.
                      </p>
                    )}
                  </div>
                )}
              </div>

              <SheetFooter className="workflow-safe-pb sticky bottom-0 flex-row bg-background/95 backdrop-blur">
                {rejecting ? (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      size="touch"
                      className="flex-1"
                      disabled={isPending}
                      onClick={() => {
                        setRejecting(false);
                        setRejectReason("");
                      }}
                    >
                      Hủy
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      size="touch-lg"
                      className="flex-1"
                      disabled={rejectReason.trim().length < 3 || isPending}
                      onClick={handleReject}
                    >
                      {pendingId === selected.id && isPending ? (
                        <Spinner className="size-5" />
                      ) : (
                        <IconX className="size-4" />
                      )}
                      Xác nhận từ chối
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      size="touch"
                      className="flex-1"
                      disabled={!canApprove || isPending}
                      onClick={() => setRejecting(true)}
                    >
                      <IconX className="size-4" />
                      Từ chối
                    </Button>
                    <Button
                      type="button"
                      size="touch-lg"
                      className="flex-1 bg-success text-success-foreground"
                      disabled={!canApprove || isPending}
                      onClick={() => void approve(selected)}
                    >
                      {pendingId === selected.id && isPending ? (
                        <Spinner className="size-5" />
                      ) : (
                        <IconCheck className="size-4" />
                      )}
                      Duyệt
                    </Button>
                  </>
                )}
              </SheetFooter>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
