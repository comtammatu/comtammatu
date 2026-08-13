"use client";

/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: existing employee checkout approval surface keeps operational copy inline */

import Image from "next/image";
import { useEffect, useState, useTransition } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import {
  CheckCircle2 as IconCheck,
  ChevronRight as IconChevronRight,
  Circle as IconPending,
  ClipboardCheck as IconClipboardCheck,
  Image as IconImage,
  X as IconX,
} from "lucide-react";
import { cn } from "@comtammatu/ui";
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
import { Spinner } from "@comtammatu/ui/components/spinner";
import { toast } from "@comtammatu/ui/components/sonner";
import { confirm } from "@/components/confirm-dialog";

import { Textarea } from "@comtammatu/ui/components/textarea";
import { Label } from "@comtammatu/ui/components/label";
import { SectionLabel } from "@comtammatu/ui/components/section-label";
import { AppDialog } from "@/components/form/form-dialog";
import {
  AppEmptyState,
  AppDrawer,
} from "@/components/surface";
import {
  approveCheckoutRequest,
  getCheckoutChecklistTaskPhotoUrl,
  rejectCheckoutRequest,
} from "../clock/actions";
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
  shiftName: string;
  shiftLabel: string;
  requestKindLabel: string;
  checklist: {
    id: number;
    title: string;
    isDone: boolean;
    isRequired: boolean;
    allowsPhoto: boolean;
    hasPhoto: boolean;
  }[];
}

interface CheckoutApprovalsClientProps {
  items: CheckoutApprovalItem[];
  canApprove: boolean;
  focusAttendanceId?: number;
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
    onPointerLeave: longPress.onPointerLeave,
    onKeyDown: longPress.onKeyDown,
    onKeyUp: longPress.onKeyUp,
    role: longPress.role,
    tabIndex: longPress.tabIndex,
    onContextMenu: longPress.onContextMenu,
  };

  return (
    <div className="relative overflow-hidden rounded-md">
      <div
        className="absolute inset-y-0 right-0 flex w-35 items-stretch justify-end"
        {...swipe.actionRegionProps(String(item.id))}
      >
        <Button
          variant="destructive"
          size="touch"
          className="self-stretch rounded-none w-1/2 flex flex-col items-center justify-center p-0 gap-1"
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
          size="touch"
          className="bg-success text-success-foreground self-stretch rounded-none w-1/2 flex flex-col items-center justify-center p-0 gap-1"
          disabled={!canApprove || approving || isPending}
          onClick={() => {
            swipe.clearReveal();
            onApprove();
          }}
        >
          {approving ? (
            <Spinner className="size-5" />
          ) : (
            <IconCheck className="size-5" />
          )}
          <span className="text-2xs font-medium uppercase">Duyệt</span>
        </Button>
      </div>

      <div
        className={cn(
          "bg-card transition-transform duration-300 ease-out cursor-pointer touch-pan-y",
          isRevealed ? "-translate-x-35" : "translate-x-0",
        )}
        {...handlers}
      >
        <Item
          variant="outline"
          size="sm"
          className="min-h-20 pointer-events-none select-none bg-card"
          data-checkout-approval-row
        >
          <ItemContent className="min-w-0 gap-0.5">
            <ItemTitle size="heading" className="truncate">
              {item.employeeName}
            </ItemTitle>
            <ItemDescription className="font-mono tabular-nums">
              {item.checkInLabel} → {item.requestedLabel}
            </ItemDescription>
            <ItemDescription className="truncate">
              {item.shiftName}
            </ItemDescription>
          </ItemContent>
          <ItemActions className="shrink-0 self-center">
            <IconChevronRight
              className="size-4 text-muted-foreground"
              aria-hidden="true"
            />
          </ItemActions>
        </Item>
      </div>
    </div>
  );
}

export function CheckoutApprovalsClient({
  items,
  canApprove,
  focusAttendanceId,
}: CheckoutApprovalsClientProps) {
  const [localItems, setLocalItems] = useState(items);
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setLocalItems(items);
  }, [items]);

  const [rejectTarget, setRejectTarget] = useState<CheckoutApprovalItem | null>(
    null,
  );
  const [rejectReason, setRejectReason] = useState("");

  const [detailsTarget, setDetailsTarget] =
    useState<CheckoutApprovalItem | null>(
      () => items.find((item) => item.id === focusAttendanceId) ?? null,
    );
  const [photoPreview, setPhotoPreview] = useState<{
    url: string;
    title: string;
    employeeName: string;
  } | null>(null);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [pendingPhotoItemId, setPendingPhotoItemId] = useState<number | null>(
    null,
  );

  const swipe = useSwipeReveal({ revealWidth: 140 });

  async function openChecklistPhoto(
    item: CheckoutApprovalItem,
    checklistItem: CheckoutApprovalItem["checklist"][number],
  ) {
    if (!checklistItem.hasPhoto) return;
    setPendingPhotoItemId(checklistItem.id);
    startTransition(async () => {
      const result = await getCheckoutChecklistTaskPhotoUrl({
        attendanceId: item.id,
        itemId: checklistItem.id,
      });
      setPendingPhotoItemId(null);
      if (!result.success || !result.data?.url) {
        toast.error(result.error ?? "Không mở được ảnh minh chứng.");
        return;
      }
      setPhotoPreview({
        url: result.data.url,
        title: checklistItem.title,
        employeeName: item.employeeName,
      });
      setPhotoOpen(true);
    });
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
                label: "Việc trong ca",
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
      <AppDrawer
        open={detailsTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDetailsTarget(null);
        }}
        title="Chi tiết kết ca"
        description={
          detailsTarget
            ? `${detailsTarget.employeeName} · ${detailsTarget.shiftLabel} · ${detailsTarget.checkInLabel}→${detailsTarget.requestedLabel}`
            : undefined
        }
        contentClassName="flex max-h-dvh-80 flex-col overflow-hidden"
        headerClassName="shrink-0"
        footerClassName="shrink-0 flex-row gap-3 pt-2"
        footer={
          <>
            <Button
              variant="outline"
              size="touch"
              className="flex-1 border-destructive text-destructive hover:bg-destructive/10"
              disabled={!canApprove || isPending}
              onClick={() => {
                if (detailsTarget) {
                  setRejectTarget(detailsTarget);
                  setDetailsTarget(null);
                }
              }}
            >
              <IconX className="size-4 mr-1.5" />
              Từ chối
            </Button>
            <Button
              size="touch"
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
          </>
        }
      >
            <div className="pb-4">
              {detailsTarget?.checklist &&
              detailsTarget.checklist.length > 0 ? (
                <div className="flex flex-col gap-3">
                  <SectionLabel as="h3">Việc trong ca</SectionLabel>
                  <ItemGroup className="gap-2">
                    {detailsTarget.checklist.map((c) => (
                      <Item
                        key={c.id}
                        role="listitem"
                        variant="muted"
                        size="sm"
                        className="items-start"
                      >
                        <ItemMedia variant="icon" aria-hidden="true">
                          {c.isDone ? <IconCheck /> : <IconPending />}
                        </ItemMedia>
                        <ItemContent className="gap-2">
                          <ItemTitle
                            className={cn(
                              "line-clamp-none",
                              c.isDone && "text-muted-foreground line-through",
                            )}
                          >
                            {c.title}
                          </ItemTitle>
                          <ItemDescription className="flex flex-wrap gap-1.5">
                            <Badge variant={c.isDone ? "success" : "outline"}>
                              {c.isDone ? "Đã xong" : "Chưa xong"}
                            </Badge>
                            {c.isRequired ? (
                              <Badge variant="destructive">Bắt buộc</Badge>
                            ) : null}
                            {c.allowsPhoto ? (
                              <Badge
                                variant={c.hasPhoto ? "success" : "outline"}
                              >
                                {c.hasPhoto ? "Có ảnh" : "Chưa kèm ảnh"}
                              </Badge>
                            ) : null}
                          </ItemDescription>
                          {c.allowsPhoto && c.hasPhoto ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="touch"
                              className="w-full sm:w-fit"
                              disabled={
                                isPending || pendingPhotoItemId === c.id
                              }
                              onClick={() =>
                                openChecklistPhoto(detailsTarget, c)
                              }
                            >
                              {pendingPhotoItemId === c.id ? (
                                <Spinner data-icon="inline-start" />
                              ) : (
                                <IconImage data-icon="inline-start" />
                              )}
                              Xem ảnh minh chứng
                            </Button>
                          ) : null}
                        </ItemContent>
                      </Item>
                    ))}
                  </ItemGroup>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic">
                  Không có việc trong ca.
                </p>
              )}
            </div>
      </AppDrawer>

      <AppDialog
        open={photoOpen}
        onOpenChange={(open) => {
          setPhotoOpen(open);
          if (!open) setPhotoPreview(null);
        }}
        title="Ảnh minh chứng việc trong ca"
        description="Đường dẫn xem ảnh có hiệu lực trong 5 phút."
        contentClassName="sm:max-w-lg"
      >
        {photoPreview ? (
          <Image
            src={photoPreview.url}
            alt={`Ảnh minh chứng «${photoPreview.title}» của ${photoPreview.employeeName}`}
            width={960}
            height={720}
            className="h-auto max-h-dvh-80 w-full rounded-md object-contain"
            unoptimized
          />
        ) : null}
      </AppDialog>

      {/* Reject Reason Drawer */}
      <AppDrawer
        open={rejectTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRejectTarget(null);
            setRejectReason("");
          }
        }}
        title="Từ chối kết ca"
        description="Nhập lý do từ chối để nhân viên biết và sửa lỗi."
        footerClassName="pt-2"
        footer={
          <Button
            variant="destructive"
            size="touch"
            className="w-full"
            disabled={rejectReason.length < 3 || isPending}
            onClick={handleReject}
          >
            {isPending ? <Spinner data-icon="inline-start" /> : null}
            Xác nhận Từ chối
          </Button>
        }
      >
          <div className="flex flex-col gap-4">
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
      </AppDrawer>
    </div>
  );
}
