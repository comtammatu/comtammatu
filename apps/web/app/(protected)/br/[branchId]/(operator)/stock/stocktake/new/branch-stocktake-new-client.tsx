/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: operator UI */
"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft as IconArrowLeft,
  ClipboardCheck as IconClipboardCheck,
} from "lucide-react";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { toast } from "@comtammatu/ui/components/sonner";
import { AppDetailFooter, AppEmptyState } from "@/components/surface";
import {
  BranchOperatorControlBar,
  BranchOperatorDetailList,
  BRANCH_OPERATOR_DETAIL_GRID_CLASSNAME,
  BranchOperatorPage,
  BranchOperatorPanel,
} from "@lib/branch-operator/components/branch-operator-page";
import type { BranchStocktakeLocation } from "@lib/inventory/stocktake-model";
import { messages } from "@lib/messages";
import {
  getModeMeta,
  StocktakeModeSelector,
  type StocktakeMode,
} from "@/(protected)/inventory/_components/stocktake-mode-selector";
import { startStocktake } from "@/(protected)/inventory/stocktake-actions";

const stocktakeCopy = messages.inventory.stocktake;

export function BranchStocktakeNewClient({
  branchId,
  branchName,
  canManage,
  locations,
}: {
  branchId: number;
  branchName: string;
  canManage: boolean;
  locations: BranchStocktakeLocation[];
}) {
  const router = useRouter();
  const stocktakeBasePath = `/br/${branchId}/stock/stocktake`;
  const [mode, setMode] = useState<StocktakeMode>("daily");
  const [pending, startTransition] = useTransition();
  const modeMeta = getModeMeta(mode);
  const selectedWarehouse =
    locations.find((location) => location.kind === "warehouse") ??
    locations[0] ??
    null;

  function submit() {
    if (!selectedWarehouse) {
      toast.error(stocktakeCopy.warehouseRequired);
      return;
    }
    startTransition(async () => {
      const result = await startStocktake({
        branchId,
        locationId: selectedWarehouse.id,
        mode,
      });
      if (!result.success || !result.data) {
        toast.error(result.error ?? stocktakeCopy.createSessionFailed);
        return;
      }

      toast.success(
        stocktakeCopy.sessionCreated(
          result.data.sessionId,
          result.data.seededLines,
        ),
      );
      router.push(`${stocktakeBasePath}/${result.data.sessionId}/count`);
    });
  }

  if (!canManage) {
    return (
      <BranchOperatorPage
        title={stocktakeCopy.startTitle}
        description={branchName}
        hideHeaderOnMobile
      >
        <AppEmptyState
          compact
          mode="no-access"
          icon={<IconClipboardCheck />}
          title="Không có quyền mở đợt kiểm kê"
          description="Tài khoản này chỉ có thể xem các phiên kiểm kê được cấp quyền."
        />
      </BranchOperatorPage>
    );
  }

  return (
    <BranchOperatorPage
      title={stocktakeCopy.startTitle}
      description={stocktakeCopy.startDescription}
      hideHeaderOnMobile
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
            <p className="truncate text-sm font-semibold">
              {stocktakeCopy.startTitle}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {branchName}
            </p>
          </div>
        </BranchOperatorControlBar>

        <div className={BRANCH_OPERATOR_DETAIL_GRID_CLASSNAME}>
          <BranchOperatorPanel
            title="Thiết lập phiên kiểm kê"
            description={branchName}
            icon={IconClipboardCheck}
            size="sm"
            contentClassName="gap-4"
          >
            <StocktakeModeSelector value={mode} onChange={setMode} />

            <Item variant="outline" size="sm">
              <ItemContent className="min-w-0 flex-1">
                <ItemTitle className="text-sm font-medium">
                  {stocktakeCopy.blindMode}
                </ItemTitle>
                <ItemDescription className="line-clamp-none text-xs">
                  {stocktakeCopy.defaultByMode(
                    modeMeta.defaultBlind
                      ? stocktakeCopy.on
                      : stocktakeCopy.off,
                  )}
                </ItemDescription>
              </ItemContent>
              <Badge
                variant={modeMeta.defaultBlind ? "default" : "outline"}
                className="shrink-0"
              >
                {modeMeta.defaultBlind ? stocktakeCopy.on : stocktakeCopy.off}
              </Badge>
            </Item>
          </BranchOperatorPanel>

          <BranchOperatorPanel title={stocktakeCopy.summary} size="sm">
            <BranchOperatorDetailList
              columns={1}
              rows={[
                { label: "Chi nhánh", value: branchName },
                { label: stocktakeCopy.mode, value: mode },
                {
                  label: messages.inventory.stock.filters.locationWarehouse,
                  value: selectedWarehouse?.name ?? "—",
                },
                {
                  label: stocktakeCopy.blindMode,
                  value: modeMeta.defaultBlind
                    ? stocktakeCopy.on
                    : stocktakeCopy.off,
                },
              ]}
            />
          </BranchOperatorPanel>
        </div>

        <AppDetailFooter
          sticky
          trailing={
            <Button
              type="button"
              size="touch-lg"
              onClick={submit}
              disabled={pending}
            >
              {pending ? stocktakeCopy.creating : stocktakeCopy.startCounting}
            </Button>
          }
        />
      </div>
    </BranchOperatorPage>
  );
}
