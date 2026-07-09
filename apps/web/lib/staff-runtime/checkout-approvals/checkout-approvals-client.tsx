"use client";

/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: existing employee checkout approval surface keeps operational copy inline */

import { useEffect, useState, useTransition } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import {
  CheckCircle2 as IconCheck,
  ClipboardCheck as IconClipboardCheck,
  X as IconX,
} from "lucide-react";
import { cn } from "@comtammatu/ui";
import { Alert, AlertDescription } from "@comtammatu/ui/components/alert";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { toast } from "@comtammatu/ui/components/sonner";
import { confirm } from "@comtammatu/ui/components/confirm-dialog";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
} from "@comtammatu/ui/components/drawer";
import { Textarea } from "@comtammatu/ui/components/textarea";
import { Label } from "@comtammatu/ui/components/label";
import { ScrollArea } from "@comtammatu/ui/components/scroll-area";
import { AppEmptyState } from "@/components/surface";
import { EmployeeDetailList } from "../components/staff-runtime-page";
import { approveCheckoutRequest, rejectCheckoutRequest } from "../clock/actions";
import { useSwipeReveal, type SwipeReveal } from "@lib/hooks/use-swipe-reveal";
import { useLongPress } from "@lib/hooks/use-long-press";

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
}

function ApprovalRow({
  item,
  canApprove,
  approving,
  isPending,
  swipe,
  onApprove,
  onReject,
  onOpenDetails,
}: {
  item: CheckoutApprovalItem;
  canApprove: boolean;
  approving: boolean;
  isPending: boolean;
  swipe: SwipeReveal;
  onApprove: () => void;
  onReject: () => void;
  onOpenDetails: () => void;
}) {
  const isRevealed = swipe.isRevealed(String(item.id));
  const swipeBindings = swipe.bindings(String(item.id));

  const longPress = useLongPress({
    onLongPress: onOpenDetails,
    onClick: () => {
      if (swipe.consumeSuppression(String(item.id))) {
        swipe.clearReveal();
        return;
      }
      if (isRevealed) {
        swipe.clearReveal();
        return;
      }
      onOpenDetails();
    },
  });

  const handlers = {
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
      swipeBindings.onPointerDown(e);
      longPress.onPointerDown(e);
    },
    onPointerMove: (e: ReactPointerEvent<HTMLElement>) => {
      swipeBindings.onPointerMove(e);
      longPress.onPointerMove(e);
    },
    onPointerUp: (e: ReactPointerEvent<HTMLElement>) => {
      swipeBindings.onPointerUp(e);
      longPress.onPointerUp();
    },
    onPointerCancel: (e: ReactPointerEvent<HTMLElement>) => {
      swipeBindings.onPointerCancel(e);
      longPress.onPointerCancel();
    },
    onContextMenu: longPress.onContextMenu,
  };

  return (
    <div className="relative overflow-hidden">
      <div className="absolute inset-y-0 right-0 flex w-35 items-stretch justify-end">
        <Button
          variant="destructive"
          className="h-full rounded-none w-1/2 flex flex-col items-center justify-center p-0 gap-1"
          disabled={!canApprove || approving || isPending}
          onClick={() => {
            swipe.clearReveal();
            onReject();
          }}
        >
          <IconX className="size-5" />
          <span className="text-2xs font-medium uppercase">Từ chối</span>
        </Button>
        <Button
          className="bg-success text-success-foreground h-full rounded-none w-1/2 flex flex-col items-center justify-center p-0 gap-1"
          disabled={!canApprove || approving || isPending}
          onClick={() => {
            swipe.clearReveal();
            onApprove();
          }}
        >
          {approving ? <Spinner className="size-5" /> : <IconCheck className="size-5" />}
          <span className="text-2xs font-medium uppercase">Duyệt</span>
        </Button>
      </div>

      <div
        className={cn(
          "bg-background transition-transform duration-300 ease-out cursor-pointer h-full border-r",
          isRevealed ? "-translate-x-35" : "translate-x-0"
        )}
        {...handlers}
      >
        <Item
          variant="outline"
          className="items-start flex flex-col gap-3 p-4 pointer-events-none select-none rounded-none border-0"
        >
          <div className="flex w-full items-start gap-3">
            <ItemMedia variant="icon" className="mt-0.5 shrink-0">
              <IconClipboardCheck />
            </ItemMedia>
            <ItemContent className="min-w-0">
              <ItemTitle className="text-sm font-semibold flex items-center flex-wrap gap-2">
                {item.employeeName}
                {item.employeeCode ? (
                  <span className="font-mono text-xs text-muted-foreground">
                    {item.employeeCode}
                  </span>
                ) : null}
              </ItemTitle>
              <ItemDescription className="text-xs text-muted-foreground mt-0.5">
                {item.requestKindLabel}
                {item.branchName ? ` · ${item.branchName}` : ""}
                {" · "}
                {item.shiftLabel}
              </ItemDescription>
              <div className="mt-3">
                <EmployeeDetailList
                  columns={3}
                  rows={[
                    {
                      label: "Vào ca",
                      value: <span className="font-mono">{item.checkInLabel}</span>,
                    },
                    {
                      label: "Yêu cầu ra",
                      value: <span className="font-mono">{item.requestedLabel}</span>,
                    },
                  ]}
                />
              </div>
              <div className="mt-3 flex items-center justify-between">
                <Badge variant="warning" className="pointer-events-none">
                  Chờ duyệt
                </Badge>
                {item.checklist && item.checklist.length > 0 ? (
                  <span className="text-xs font-semibold text-muted-foreground">
                    Checklist:{" "}
                    <span className="font-mono text-foreground font-bold">
                      {item.checklist.filter((c) => c.isDone).length}/
                      {item.checklist.length}
                    </span>{" "}
                    xong
                  </span>
                ) : null}
              </div>
            </ItemContent>
          </div>
        </Item>
      </div>
    </div>
  );
}

export function CheckoutApprovalsClient({
  items,
  canApprove,
}: CheckoutApprovalsClientProps) {
  const [localItems, setLocalItems] = useState(items);
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setLocalItems(items);
  }, [items]);

  const [rejectTarget, setRejectTarget] = useState<CheckoutApprovalItem | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const [detailsTarget, setDetailsTarget] = useState<CheckoutApprovalItem | null>(null);

  const swipe = useSwipeReveal({ revealWidth: 140 });

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
      setDetailsTarget(null);
    });
  }

  function handleReject() {
    if (!rejectTarget) return;
    const item = rejectTarget;
    setPendingId(item.id);
    startTransition(async () => {
      const result = await rejectCheckoutRequest({
        attendanceId: item.id,
        note: rejectReason || undefined,
      });
      setPendingId(null);
      setRejectTarget(null);
      setRejectReason("");
      setDetailsTarget(null);

      if (!result.success) {
        toast.error(result.error ?? "Không thể từ chối kết ca.");
        return;
      }

      setLocalItems((current) =>
        current.filter((currentItem) => currentItem.id !== item.id),
      );
      toast.success(`Đã từ chối kết ca cho ${item.employeeName}`);
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
        <Alert className="border-warning/20 bg-warning/10">
          <AlertDescription>
            Tài khoản này chưa có quyền duyệt kết ca cho chi nhánh hiện tại.
          </AlertDescription>
        </Alert>
      ) : null}

      <ItemGroup className="gap-2 overflow-hidden sm:overflow-visible">
        {localItems.map((item) => {
          const approving = pendingId === item.id && isPending;
          return (
            <ApprovalRow
              key={item.id}
              item={item}
              canApprove={canApprove}
              approving={approving}
              isPending={isPending}
              swipe={swipe}
              onApprove={() => approve(item)}
              onReject={() => setRejectTarget(item)}
              onOpenDetails={() => setDetailsTarget(item)}
            />
          );
        })}
      </ItemGroup>

      {/* Details Drawer */}
      <Drawer
        open={detailsTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDetailsTarget(null);
        }}
      >
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Chi tiết kết ca</DrawerTitle>
            <DrawerDescription>
              {detailsTarget?.employeeName} - {detailsTarget?.shiftLabel}
            </DrawerDescription>
          </DrawerHeader>
          <ScrollArea className="px-4" style={{ maxHeight: "60vh" }}>
            <div className="pb-4">
              {detailsTarget?.checklist && detailsTarget.checklist.length > 0 ? (
                <div className="flex flex-col gap-3">
                  <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                    Checklist công việc
                  </h4>
                  <div className="flex flex-col gap-2 rounded-lg bg-muted/50 p-4 border">
                    {detailsTarget.checklist.map((c) => (
                      <div
                        key={c.id}
                        className="flex items-start gap-2 text-sm text-foreground"
                      >
                        {c.isDone ? (
                          <IconCheck className="size-4 text-success shrink-0 mt-0.5" />
                        ) : (
                          <div className="size-4 rounded-full border border-muted-foreground shrink-0 mt-0.5 bg-background" />
                        )}
                        <span className={c.isDone ? "line-through text-muted-foreground" : ""}>
                          {c.title}
                        </span>
                        {c.isRequired ? (
                          <span className="text-2xs leading-none bg-destructive/10 text-destructive px-1.5 py-0.5 rounded-md shrink-0 font-medium">
                            Bắt buộc
                          </span>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic">
                  Không có checklist công việc.
                </p>
              )}
            </div>
          </ScrollArea>
          <DrawerFooter className="flex-row gap-3 pt-2">
            <Button
              variant="outline"
              className="flex-1 border-destructive text-destructive hover:bg-destructive/10"
              disabled={!canApprove || isPending}
              onClick={() => {
                if (detailsTarget) setRejectTarget(detailsTarget);
              }}
            >
              <IconX className="size-4 mr-1.5" />
              Từ chối
            </Button>
            <Button
              className="flex-1 bg-success text-success-foreground"
              disabled={!canApprove || isPending}
              onClick={() => {
                if (detailsTarget) approve(detailsTarget);
              }}
            >
              {pendingId === detailsTarget?.id && isPending ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <IconCheck data-icon="inline-start" />
              )}
              Duyệt
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      {/* Reject Reason Drawer */}
      <Drawer
        open={rejectTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRejectTarget(null);
            setRejectReason("");
          }
        }}
      >
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Từ chối kết ca</DrawerTitle>
            <DrawerDescription>
              Nhập lý do từ chối để nhân viên biết và sửa lỗi.
            </DrawerDescription>
          </DrawerHeader>
          <div className="px-4 pb-4 flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="reject-reason">Lý do từ chối</Label>
              <Textarea
                id="reject-reason"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Ví dụ: Chưa lau dọn bếp, Chưa đếm tồn..."
                rows={4}
                autoFocus
              />
            </div>
          </div>
          <DrawerFooter className="pt-2">
            <Button
              variant="destructive"
              className="w-full"
              disabled={rejectReason.length < 3 || isPending}
              onClick={handleReject}
            >
              {isPending ? <Spinner data-icon="inline-start" /> : null}
              Xác nhận Từ chối
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
