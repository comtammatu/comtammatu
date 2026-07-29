/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: operator UI */
"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useState,
  useTransition,
  type MouseEvent,
} from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft as IconArrowLeft,
  Check as IconCheck,
  ChevronRight as IconChevronRight,
  PackageCheck as IconPackageCheck,
  X as IconX,
} from "lucide-react";
import { ACTIONS_VI } from "@comtammatu/shared/messages";
import { formatQuantity } from "@comtammatu/shared/format";
import { getWasteReasonLabelVi } from "@comtammatu/shared/labels";
import { formatVNDateTime } from "@comtammatu/shared/time";
import { Badge } from "@comtammatu/ui/components/badge";
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
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@comtammatu/ui/components/sheet";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { toast } from "@comtammatu/ui/components/sonner";
import { ReasonConfirmDialog } from "@comtammatu/ui/components/reason-confirm-dialog";
import { SectionLabel } from "@comtammatu/ui/components/section-label";
import { AppEmptyState } from "@/components/surface";
import {
  BranchOperatorControlBar,
  BranchOperatorPage,
  BranchOperatorPanel,
} from "@lib/branch-operator/components/branch-operator-page";
import { messages } from "@lib/messages";
import type { PendingWasteRow } from "@lib/inventory/waste-approval-model";
import { WasteTierBadge } from "@/(protected)/inventory/_components/waste-tier-badge";
import { approveWaste } from "@/(protected)/inventory/waste-actions";

type PendingDecision = {
  issueId: number;
  decision: "approved" | "rejected";
};

function getHighestTier(row: PendingWasteRow): number {
  return Math.max(0, ...row.items.map((item) => item.wasteTier ?? 0));
}

export function BranchWasteApprovalsClient({
  branchId,
  branchName,
  canApproveWaste,
  loadFailed,
  initial,
}: {
  branchId: number;
  branchName: string;
  canApproveWaste: boolean;
  loadFailed: boolean;
  initial: PendingWasteRow[];
}) {
  const router = useRouter();
  const copy = messages.inventory.waste.approvals;
  const stockBasePath = `/br/${branchId}/stock`;
  const [rows, setRows] = useState(initial);
  const [selectedIssueId, setSelectedIssueId] = useState<number | null>(null);
  const [reviewNotes, setReviewNotes] = useState<Record<number, string>>({});
  const [pendingDecision, setPendingDecision] =
    useState<PendingDecision | null>(null);
  const [rejectingIssueId, setRejectingIssueId] = useState<number | null>(null);
  const [isTransitionPending, startTransition] = useTransition();

  useEffect(() => {
    setRows(initial);
    setSelectedIssueId((current) =>
      current !== null && !initial.some((row) => row.issueId === current)
        ? null
        : current,
    );
  }, [initial]);

  const selectedRow = useMemo(
    () => rows.find((row) => row.issueId === selectedIssueId) ?? null,
    [rows, selectedIssueId],
  );
  const isSubmitting = pendingDecision !== null || isTransitionPending;
  const hasUnsavedNotes = Object.values(reviewNotes).some(
    (note) => note.trim().length > 0,
  );

  useEffect(() => {
    if (!hasUnsavedNotes) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedNotes]);

  async function requestLeave() {
    if (isSubmitting) return;
    if (hasUnsavedNotes) {
      const confirmed = await confirm({
        title: "Bỏ lý do từ chối?",
        description: "Lý do từ chối chưa gửi sẽ bị mất.",
        confirmText: "Bỏ lý do",
        cancelText: "Tiếp tục duyệt",
        variant: "destructive",
      });
      if (!confirmed) return;
    }
    router.push(stockBasePath);
  }

  function handleLeaveClick(event: MouseEvent<HTMLAnchorElement>) {
    if (!isSubmitting && !hasUnsavedNotes) return;
    event.preventDefault();
    if (!isSubmitting) void requestLeave();
  }

  async function requestDecision(
    row: PendingWasteRow,
    decision: "approved" | "rejected",
  ) {
    if (row.isSelfCreated) {
      toast.error("Không thể tự duyệt phiếu của mình (4-eye principle)");
      return;
    }
    if (isSubmitting) return;

    if (decision === "approved") {
      const confirmed = await confirm({
        title: "Duyệt phiếu hao hụt?",
        description: row.issueNumber,
        confirmText: copy.approve,
        cancelText: ACTIONS_VI.cancel,
      });
      if (!confirmed) return;
    }

    setPendingDecision({ issueId: row.issueId, decision });
    startTransition(async () => {
      try {
        const result = await approveWaste({
          issueId: row.issueId,
          decision,
          note:
            decision === "rejected"
              ? reviewNotes[row.issueId]?.trim()
              : undefined,
        });
        if (!result.success) {
          toast.error(result.error ?? "Không duyệt được");
          return;
        }

        toast.success(
          decision === "approved"
            ? `Đã duyệt phiếu ${row.issueNumber}`
            : `Đã từ chối phiếu ${row.issueNumber}`,
        );
        setRows((current) =>
          current.filter((currentRow) => currentRow.issueId !== row.issueId),
        );
        setReviewNotes((current) => {
          const next = { ...current };
          delete next[row.issueId];
          return next;
        });
        setSelectedIssueId(null);
        setRejectingIssueId(null);
        router.refresh();
      } catch (error) {
        console.error("branch.waste_approval.failed", error);
        toast.error("Không duyệt được");
      } finally {
        setPendingDecision(null);
      }
    });
  }

  if (!canApproveWaste) {
    return (
      <BranchOperatorPage
        title={copy.title}
        description={branchName}
        hideHeaderOnMobile
      >
        <AppEmptyState
          compact
          mode="no-access"
          icon={<IconPackageCheck aria-hidden="true" />}
          title="Không có quyền duyệt hao hụt"
          description="Tài khoản này không được duyệt phiếu hao hụt tại chi nhánh này."
        />
      </BranchOperatorPage>
    );
  }

  if (loadFailed) {
    return (
      <BranchOperatorPage
        title={copy.title}
        description={branchName}
        hideHeaderOnMobile
      >
        <AppEmptyState
          compact
          mode="no-data"
          icon={<IconPackageCheck aria-hidden="true" />}
          title="Không tải được phiếu chờ duyệt"
          description="Hãy tải lại để lấy các phiếu hao hụt đang chờ xử lý."
        >
          <Button type="button" size="touch" onClick={() => router.refresh()}>
            Tải lại
          </Button>
        </AppEmptyState>
      </BranchOperatorPage>
    );
  }

  return (
    <BranchOperatorPage
      title={copy.title}
      description={branchName}
      hideHeaderOnMobile
    >
      <div className="flex min-w-0 touch-manipulation flex-col gap-3 pb-4">
        <BranchOperatorControlBar className="sm:hidden">
          <Button
            variant="ghost"
            size="icon-touch"
            render={
              <Link
                href={stockBasePath}
                aria-label="Quay lại kho"
                aria-disabled={isSubmitting || undefined}
                className={
                  isSubmitting ? "pointer-events-none opacity-50" : undefined
                }
                onClick={handleLeaveClick}
              />
            }
          >
            <IconArrowLeft aria-hidden="true" />
          </Button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{copy.title}</p>
            <p className="truncate text-xs text-muted-foreground">
              {branchName}
            </p>
          </div>
        </BranchOperatorControlBar>

        <BranchOperatorPanel
          title="Phiếu chờ duyệt"
          description={copy.principle}
          icon={IconPackageCheck}
          size="sm"
          contentClassName="gap-3"
          action={<Badge variant="secondary">{copy.count(rows.length)}</Badge>}
        >
          {rows.length === 0 ? (
            <AppEmptyState
              compact
              mode="no-data"
              icon={<IconPackageCheck aria-hidden="true" />}
              title={copy.empty}
              description="Không còn phiếu hao hụt cần xử lý tại chi nhánh này."
            />
          ) : (
            <ItemGroup className="gap-2" role="list">
              {rows.map((row) => {
                const highestTier = getHighestTier(row);
                return (
                  <div key={row.issueId} role="listitem">
                    <Item
                      variant="outline"
                      className="min-h-20 touch-manipulation"
                      render={
                        <button
                          type="button"
                          className="w-full text-left"
                          onClick={() => setSelectedIssueId(row.issueId)}
                          disabled={isSubmitting}
                        />
                      }
                    >
                      <ItemContent className="min-w-0 gap-1">
                        <ItemTitle className="line-clamp-none break-words text-sm font-semibold">
                          {row.issueNumber}
                        </ItemTitle>
                        <ItemDescription className="line-clamp-none break-words text-xs">
                          {row.createdByName} · {formatVNDateTime(row.issuedAt)}
                        </ItemDescription>
                        <ItemDescription className="line-clamp-none text-xs">
                          {row.shiftKey || "Chưa có ca"} ·{" "}
                          {copy.lineCount(row.items.length)}
                        </ItemDescription>
                        {row.isSelfCreated ? (
                          <Badge variant="outline" className="w-fit text-xs">
                            {copy.selfCreatedBadge}
                          </Badge>
                        ) : null}
                      </ItemContent>
                      <ItemActions className="shrink-0">
                        <WasteTierBadge tier={highestTier} compact />
                        <IconChevronRight
                          aria-hidden="true"
                          className="size-4 text-muted-foreground"
                        />
                      </ItemActions>
                    </Item>
                  </div>
                );
              })}
            </ItemGroup>
          )}
        </BranchOperatorPanel>

        <Sheet
          open={selectedRow !== null}
          onOpenChange={(open) => {
            if (!open) setSelectedIssueId(null);
          }}
        >
          <SheetContent
            side="bottom"
            className="max-h-dvh-95 bg-background p-0 text-foreground"
            showCloseButton={false}
          >
            {selectedRow ? (
              <>
                <SheetHeader>
                  <SectionLabel density="dense">
                    Phiếu hao hụt chờ duyệt
                  </SectionLabel>
                  <SheetTitle className="text-lg font-semibold">
                    {selectedRow.issueNumber}
                  </SheetTitle>
                  <p className="text-xs text-muted-foreground">
                    {selectedRow.createdByName} ·{" "}
                    {formatVNDateTime(selectedRow.issuedAt)}
                  </p>
                </SheetHeader>

                <div className="min-h-0 overflow-y-auto overscroll-contain p-4">
                  <div className="flex min-w-0 flex-col gap-3">
                    <div className="flex items-start justify-between gap-3 border-b pb-3">
                      <div>
                        <p className="text-xs text-muted-foreground">
                          {selectedRow.shiftKey || "Chưa có ca"}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {copy.lineCount(selectedRow.items.length)}
                        </p>
                      </div>
                    </div>

                    <ItemGroup className="gap-2" role="list">
                      {selectedRow.items.map((item) => (
                        <Item key={item.itemId} variant="outline" size="sm">
                          <ItemContent className="min-w-0 gap-1">
                            <ItemTitle className="line-clamp-none break-words text-sm font-semibold">
                              {item.ingredientName}
                            </ItemTitle>
                            <ItemDescription className="line-clamp-none break-words text-xs">
                              {formatQuantity(item.quantity)} {item.unit}
                            </ItemDescription>
                            <ItemDescription className="line-clamp-none break-words text-xs">
                              {copy.reason(
                                getWasteReasonLabelVi(item.reasonCode),
                              )}
                            </ItemDescription>
                            {item.photoUrls.length > 0 ? (
                              <div className="flex flex-wrap gap-2 pt-1">
                                {item.photoUrls.map((url, index) => (
                                  <a
                                    key={url}
                                    href={url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-xs text-primary underline"
                                    aria-label={`Xem ảnh bằng chứng ${index + 1} cho ${item.ingredientName}`}
                                  >
                                    {copy.viewPhoto}
                                  </a>
                                ))}
                              </div>
                            ) : null}
                          </ItemContent>
                          <ItemActions className="shrink-0 flex-col items-end gap-1">
                            <WasteTierBadge tier={item.wasteTier} compact />
                          </ItemActions>
                        </Item>
                      ))}
                    </ItemGroup>

                    {selectedRow.notes ? (
                      <p className="border-t pt-3 text-xs italic break-words text-muted-foreground">
                        {copy.notes(selectedRow.notes)}
                      </p>
                    ) : null}
                  </div>
                </div>

                <SheetFooter>
                  {selectedRow.isSelfCreated ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="touch-lg"
                      className="w-full"
                      onClick={() => setSelectedIssueId(null)}
                    >
                      {ACTIONS_VI.close}
                    </Button>
                  ) : (
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="destructive"
                        size="touch-lg"
                        className="flex-1"
                        onClick={() => setRejectingIssueId(selectedRow.issueId)}
                        disabled={isSubmitting}
                      >
                        {pendingDecision?.issueId === selectedRow.issueId &&
                        pendingDecision.decision === "rejected" ? (
                          <Spinner className="size-5" />
                        ) : (
                          <IconX aria-hidden="true" data-icon="inline-start" />
                        )}
                        {copy.reject}
                      </Button>
                      <Button
                        type="button"
                        size="touch-lg"
                        className="flex-1"
                        onClick={() =>
                          void requestDecision(selectedRow, "approved")
                        }
                        disabled={isSubmitting}
                      >
                        {pendingDecision?.issueId === selectedRow.issueId &&
                        pendingDecision.decision === "approved" ? (
                          <Spinner className="size-5" />
                        ) : (
                          <IconCheck
                            aria-hidden="true"
                            data-icon="inline-start"
                          />
                        )}
                        {copy.approve}
                      </Button>
                    </div>
                  )}
                </SheetFooter>
              </>
            ) : null}
          </SheetContent>
        </Sheet>
        <ReasonConfirmDialog
          open={rejectingIssueId !== null}
          onOpenChange={(open) => {
            if (!open && !isSubmitting) {
              setRejectingIssueId(null);
              if (rejectingIssueId !== null) {
                setReviewNotes((current) => {
                  const next = { ...current };
                  delete next[rejectingIssueId];
                  return next;
                });
              }
            }
          }}
          title={copy.rejectTitle}
          description={selectedRow?.issueNumber}
          reasonId="branch-waste-reject-reason"
          reason={
            rejectingIssueId === null
              ? ""
              : (reviewNotes[rejectingIssueId] ?? "")
          }
          onReasonChange={(reason) => {
            if (rejectingIssueId === null) return;
            setReviewNotes((current) => ({
              ...current,
              [rejectingIssueId]: reason,
            }));
          }}
          reasonLabel={copy.rejectReason}
          reasonPlaceholder={copy.reviewNotePlaceholder}
          reasonMinLength={5}
          reasonTextareaProps={{ maxLength: 500, autoFocus: true }}
          cancelLabel={copy.rejectCancel}
          cancelDisabled={isSubmitting}
          confirmLabel={copy.reject}
          confirmVariant="destructive"
          actionSize="touch"
          isPending={
            pendingDecision?.issueId === rejectingIssueId &&
            pendingDecision.decision === "rejected"
          }
          onConfirm={() => {
            const row = rows.find(
              (candidate) => candidate.issueId === rejectingIssueId,
            );
            if (row) void requestDecision(row, "rejected");
          }}
        />
      </div>
    </BranchOperatorPage>
  );
}
