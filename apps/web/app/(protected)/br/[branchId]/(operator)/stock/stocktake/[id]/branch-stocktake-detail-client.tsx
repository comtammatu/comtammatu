/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: operator UI */
"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft as IconArrowLeft,
  CircleAlert as IconCircleAlert,
  CircleCheck as IconCircleCheck,
  CircleX as IconCircleX,
  ClipboardCheck as IconClipboardCheck,
} from "lucide-react";
import { cn } from "@comtammatu/ui";
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
import { toast } from "@comtammatu/ui/components/sonner";
import { AppDetailFooter, AppEmptyState } from "@/components/surface";
import { getStatusBadgeMeta, StatusBadge } from "@/components/status-badge";
import {
  BranchOperatorControlBar,
  BranchOperatorDetailList,
  BranchOperatorInlineState,
  BranchOperatorPage,
  BranchOperatorPanel,
  BranchOperatorStatusStrip,
} from "@lib/branch-operator/components/branch-operator-page";
import {
  canCompleteBranchStocktake,
  getBranchStocktakeProgress,
  getBranchStocktakeVarianceTone,
  type BranchStocktakeDetail,
} from "@lib/inventory/stocktake-model";
import { messages } from "@lib/messages";
import { formatVNDateTime } from "@comtammatu/shared/time";
import { formatQty } from "@lib/inventory/format";
import {
  cancelStocktake,
  completeStocktake,
} from "@/(protected)/inventory/actions";

const stocktakeCopy = messages.inventory.stocktake;

const toneClassName = {
  default: "",
  success: "border-success/20 bg-success/10",
  warning: "border-warning/20 bg-warning/10",
  destructive: "border-destructive/20 bg-destructive/10",
} as const;

export function BranchStocktakeDetailClient({
  data,
  stockBasePath,
  countUnavailable = false,
}: {
  data: BranchStocktakeDetail;
  stockBasePath: string;
  countUnavailable?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const stocktakeBasePath = `${stockBasePath}/stocktake`;
  const { session, lines } = data;
  const statusBadge = getStatusBadgeMeta("inventory", session.status);
  const countedItems = lines.filter(
    (line) => line.countedQuantity !== null,
  ).length;
  const progress = getBranchStocktakeProgress({
    totalItems: lines.length,
    countedItems,
  });
  const recountItems = lines.filter((line) => line.needsRecount).length;
  const varianceItems = lines.filter(
    (line) => line.variance !== null && line.variance !== 0,
  ).length;
  const canComplete =
    data.canComplete &&
    session.status === "in_progress" &&
    canCompleteBranchStocktake(lines);
  const blockedReason =
    recountItems > 0
      ? "Còn dòng cần đếm lại trước khi hoàn tất."
      : progress.counted < progress.total
        ? `Còn ${progress.total - progress.counted} dòng chưa đếm.`
        : null;

  async function handleComplete() {
    const approved = await confirm({
      title: stocktakeCopy.detail.completeDialogTitle,
      description: stocktakeCopy.detail.completeDialogDescription,
      confirmText: stocktakeCopy.detail.completeResultAction,
      cancelText: "Quay lại",
    });
    if (!approved) return;

    startTransition(async () => {
      const result = await completeStocktake(session.id);
      if (!result.success) {
        toast.error(result.error ?? stocktakeCopy.detail.completeFailed);
        return;
      }
      toast.success(stocktakeCopy.detail.completeOk);
      router.refresh();
    });
  }

  async function handleCancel() {
    const approved = await confirm({
      title: stocktakeCopy.detail.cancelDialogTitle,
      description: stocktakeCopy.detail.cancelDialogDescription,
      confirmText: stocktakeCopy.detail.confirmCancelAction,
      cancelText: "Quay lại",
      variant: "destructive",
    });
    if (!approved) return;

    startTransition(async () => {
      const result = await cancelStocktake(session.id);
      if (!result.success) {
        toast.error(result.error ?? stocktakeCopy.detail.cancelFailed);
        return;
      }
      toast.success(stocktakeCopy.detail.cancelOk);
      router.refresh();
    });
  }

  const reviewContent =
    session.status === "cancelled" ? (
      <AppEmptyState
        compact
        mode="no-data"
        icon={<IconCircleX />}
        title={stocktakeCopy.detail.cancelledTitle}
        description={stocktakeCopy.detail.cancelledDescription}
      />
    ) : session.status === "completed" ? (
      <ItemGroup className="gap-2" role="list">
        {lines.map((line) => {
          const tone = getBranchStocktakeVarianceTone(line);
          const variance = line.variance ?? 0;
          return (
            <div key={line.id} role="listitem">
              <Item
                variant="outline"
                className={cn(
                  "min-h-16 flex-col items-stretch gap-2 touch-manipulation",
                  toneClassName[tone],
                )}
              >
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <ItemContent className="min-w-0 gap-1">
                    <ItemTitle className="line-clamp-none text-sm font-semibold">
                      {line.ingredientName}
                    </ItemTitle>
                    <ItemDescription className="line-clamp-none text-xs">
                      Hệ thống {formatQty(line.systemQuantity ?? 0)} {line.unit}{" "}
                      · thực đếm {formatQty(line.countedQuantity ?? 0)}{" "}
                      {line.unit}
                    </ItemDescription>
                  </ItemContent>
                  <Badge
                    variant={
                      tone === "destructive"
                        ? "destructive"
                        : tone === "warning"
                          ? "warning"
                          : tone === "success"
                            ? "success"
                            : "secondary"
                    }
                    className="shrink-0 font-mono tabular-nums"
                  >
                    {variance > 0 ? "+" : ""}
                    {formatQty(variance)}
                  </Badge>
                </div>
                {line.varianceReason ? (
                  <ItemDescription className="line-clamp-none text-xs">
                    {line.varianceReason}
                  </ItemDescription>
                ) : null}
              </Item>
            </div>
          );
        })}
      </ItemGroup>
    ) : (
      <>
        {countUnavailable ? (
          <BranchOperatorInlineState
            icon={IconCircleAlert}
            tone="info"
            title="Màn đếm chưa sẵn sàng"
            description="Phiên kiểm kê vẫn được giữ nguyên. Liên hệ quản lý hệ thống để bật màn đếm mới cho chi nhánh này."
          />
        ) : null}
        {blockedReason ? (
          <BranchOperatorInlineState
            icon={IconCircleAlert}
            tone="warning"
            title="Chưa thể hoàn tất"
            description={blockedReason}
          />
        ) : null}
        <ItemGroup className="gap-2" role="list">
          {lines.map((line) => (
            <div key={line.id} role="listitem">
              <Item variant="outline" className="min-h-16 touch-manipulation">
                <ItemContent className="min-w-0 gap-1">
                  <ItemTitle className="line-clamp-none text-sm font-semibold">
                    {line.ingredientName}
                  </ItemTitle>
                  <ItemDescription className="line-clamp-none text-xs">
                    {line.countedQuantity === null
                      ? "Chưa đếm"
                      : `Đã đếm ${formatQty(line.countedQuantity)} ${line.unit}`}
                  </ItemDescription>
                </ItemContent>
                <ItemActions className="self-center">
                  {line.needsRecount ? (
                    <Badge variant="warning">Đếm lại</Badge>
                  ) : line.countedQuantity !== null ? (
                    <Badge variant="success">Đã ghi nhận</Badge>
                  ) : null}
                </ItemActions>
              </Item>
            </div>
          ))}
        </ItemGroup>
      </>
    );

  return (
    <BranchOperatorPage
      title={`KK-${session.id}`}
      description={formatVNDateTime(session.startedAt ?? session.createdAt)}
      hideHeaderOnMobile
      badge={{ children: statusBadge.label, variant: statusBadge.variant }}
    >
      <div className="flex min-w-0 touch-manipulation flex-col gap-3">
        <BranchOperatorControlBar className="sm:hidden">
          <Button
            variant="ghost"
            size="icon-touch"
            render={
              <Link href={stocktakeBasePath} aria-label="Quay lại kiểm kê" />
            }
          >
            <IconArrowLeft />
          </Button>
          <div className="min-w-0 flex-1">
            <p className="truncate font-mono text-sm font-semibold">
              KK-{session.id}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {formatVNDateTime(session.startedAt ?? session.createdAt)}
            </p>
          </div>
          <StatusBadge domain="inventory" value={session.status} size="sm" />
        </BranchOperatorControlBar>

        <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1.35fr)_minmax(17rem,0.65fr)] lg:items-start">
          <div className="flex min-w-0 flex-col gap-3">
            <BranchOperatorPanel
              title={
                session.status === "completed"
                  ? "Kết quả kiểm kê"
                  : "Tiến độ kiểm kê"
              }
              icon={IconClipboardCheck}
              size="sm"
              contentClassName="gap-3"
              action={
                session.status === "in_progress" &&
                data.canCancel &&
                !countUnavailable ? (
                  <Button
                    size="touch"
                    render={
                      <Link href={`${stocktakeBasePath}/${session.id}/count`} />
                    }
                  >
                    Tiếp tục đếm
                  </Button>
                ) : null
              }
            >
              {reviewContent}
            </BranchOperatorPanel>
          </div>

          <div className="flex min-w-0 flex-col gap-3">
            <BranchOperatorPanel title="Tổng quan" size="sm">
              <BranchOperatorStatusStrip
                items={[
                  {
                    label: "Trạng thái",
                    value: statusBadge.label,
                  },
                  {
                    label: "Đã đếm",
                    value: `${progress.counted}/${progress.total}`,
                    mono: true,
                  },
                  ...(session.status === "completed"
                    ? [
                        {
                          label: "Có chênh lệch",
                          value: String(varianceItems),
                          mono: true,
                          muted: varianceItems === 0,
                        },
                      ]
                    : []),
                ]}
              />
              <BranchOperatorDetailList
                columns={1}
                className="mt-3"
                rows={[
                  {
                    label: "Bắt đầu",
                    value: formatVNDateTime(
                      session.startedAt ?? session.createdAt,
                    ),
                  },
                  ...(session.completedAt
                    ? [
                        {
                          label: "Hoàn tất",
                          value: formatVNDateTime(session.completedAt),
                        },
                      ]
                    : []),
                  {
                    label: "Người tạo",
                    value: session.createdBy,
                  },
                  {
                    label: "Kiểm kê mù",
                    value: session.blindMode ? "Có" : "Không",
                  },
                ]}
              />
              {session.notes ? (
                <p className="mt-3 text-sm text-muted-foreground">
                  {session.notes}
                </p>
              ) : null}
            </BranchOperatorPanel>
          </div>
        </div>

        {session.status === "in_progress" &&
        (data.canCancel || data.canComplete) ? (
          <AppDetailFooter
            sticky
            trailing={
              <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-end">
                {data.canCancel ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="touch"
                    onClick={handleCancel}
                    disabled={isPending}
                  >
                    {stocktakeCopy.detail.cancelAction}
                  </Button>
                ) : null}
                {data.canComplete ? (
                  <Button
                    type="button"
                    size="touch-lg"
                    onClick={handleComplete}
                    disabled={isPending || !canComplete}
                  >
                    <IconCircleCheck data-icon="inline-start" />
                    {stocktakeCopy.detail.completeAction}
                  </Button>
                ) : null}
              </div>
            }
          />
        ) : null}
      </div>
    </BranchOperatorPage>
  );
}
