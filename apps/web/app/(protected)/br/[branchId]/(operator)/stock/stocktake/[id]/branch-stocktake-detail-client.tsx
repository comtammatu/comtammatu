/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: operator UI */
"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CircleAlert as IconCircleAlert,
  CircleCheck as IconCircleCheck,
  CircleX as IconCircleX,
  ClipboardCheck as IconClipboardCheck,
} from "lucide-react";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { confirm } from "@/components/confirm-dialog";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { toast } from "@comtammatu/ui/components/sonner";
import { AppBackLink, AppDetailFooter, AppEmptyState } from "@/components/surface";
import { getStatusBadgeMeta } from "@/components/status-badge";
import {
  BranchOperatorDetailList,
  BranchOperatorInlineState,
  BRANCH_OPERATOR_DETAIL_GRID_CLASSNAME,
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
import {
  cancelStocktake,
  completeStocktake,
} from "@/(protected)/inventory/actions";
import { StocktakePrintDialog } from "@/components/inventory/stocktake-print-dialog";
import { formatMultiUnitBreakdown } from "@lib/inventory/multiunit-count";

const stocktakeCopy = messages.inventory.stocktake;



export function BranchStocktakeDetailClient({
  data,
  stockBasePath,
}: {
  data: BranchStocktakeDetail;
  stockBasePath: string;
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
                className="min-h-16 flex-col items-stretch gap-2 bg-card touch-manipulation"
              >
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <ItemContent className="min-w-0 gap-1">
                    <ItemTitle className="line-clamp-none text-sm font-semibold">
                      {line.ingredientName}
                    </ItemTitle>
                    <ItemDescription className="line-clamp-none text-xs">
                      Hệ thống {formatMultiUnitBreakdown(line.systemQuantity, line.units, { fallbackUnit: line.unit, showBaseSecondary: true })}{" "}
                      · thực đếm {formatMultiUnitBreakdown(line.countedQuantity, line.units, { fallbackUnit: line.unit, showBaseSecondary: true })}
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
                    {formatMultiUnitBreakdown(variance, line.units, { fallbackUnit: line.unit, signed: true })}
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
                      : `Đã đếm ${formatMultiUnitBreakdown(line.countedQuantity, line.units, { fallbackUnit: line.unit, showBaseSecondary: true })}`}
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

  const printLines = lines.map((line) => ({
    id: line.id,
    ingredientId: line.ingredientId,
    ingredientName: line.ingredientName,
    unit: line.unit,
    systemQuantity: line.systemQuantity,
    countedQuantity: line.countedQuantity,
    variance: line.variance,
    varianceReason: line.varianceReason,
  }));

  const printSession = {
    id: session.id,
    sessionNumber: session.sessionNumber,
    branchId: session.branchId,
    startedAt: session.startedAt,
    completedAt: session.completedAt,
    createdAt: session.createdAt,
    createdByName: session.createdByName,
    status: session.status,
    notes: session.notes,
    currentRound: session.currentRound,
  };

  return (
    <BranchOperatorPage
      title={`KK-${session.id}`}
      description={formatVNDateTime(session.startedAt ?? session.createdAt)}
      badge={{ children: statusBadge.label, variant: statusBadge.variant }}
      back={<AppBackLink href={stocktakeBasePath} />}
    >
      <div className="flex min-w-0 touch-manipulation flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {session.status === "in_progress" && data.canCancel ? (
            <Button
              size="touch"
              className="min-w-36 flex-1"
              render={<Link href={`${stocktakeBasePath}/${session.id}/count`} />}
            >
              Tiếp tục đếm
            </Button>
          ) : null}
          <StocktakePrintDialog
            session={printSession}
            lines={printLines}
            unitOptionsByIngredient={data.unitOptionsByIngredient}
            buttonSize="touch"
            buttonVariant="outline"
            className={
              session.status === "in_progress" && data.canCancel
                ? "min-w-36 flex-1"
                : "w-full"
            }
          />
        </div>

        <div className={BRANCH_OPERATOR_DETAIL_GRID_CLASSNAME}>
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
                    value: session.createdByName,
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
