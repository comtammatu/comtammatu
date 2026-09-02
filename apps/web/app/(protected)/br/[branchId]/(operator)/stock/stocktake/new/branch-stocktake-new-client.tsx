/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: operator UI */
"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ClipboardCheck as IconClipboardCheck } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { toast } from "@comtammatu/ui/components/sonner";
import { AppBackLink, AppDetailFooter, AppEmptyState } from "@/components/surface";
import {
  BranchOperatorPage,
  BranchOperatorPanel,
} from "@lib/branch-operator/components/branch-operator-page";
import type { BranchStocktakeLocation } from "@lib/inventory/stocktake-model";
import { messages } from "@lib/messages";
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
  const [pending, startTransition] = useTransition();
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
      });
      if (!result.success || !result.data) {
        toast.error(result.error ?? stocktakeCopy.createSessionFailed);
        return;
      }

      toast.success(
        stocktakeCopy.sessionCreated(
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
        back={<AppBackLink href={stocktakeBasePath} />}
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
      back={<AppBackLink href={stocktakeBasePath} />}
    >
      <div className="flex min-w-0 touch-manipulation flex-col gap-3">
        <BranchOperatorPanel
          title={stocktakeCopy.startTitle}
          description={`${branchName} · ${selectedWarehouse?.name ?? "—"}`}
          icon={IconClipboardCheck}
          size="sm"
        >
          <p className="text-sm text-muted-foreground">
            {stocktakeCopy.startDescription}
          </p>
        </BranchOperatorPanel>

        <AppDetailFooter
          sticky
          trailing={
            <Button
              type="button"
              size="touch-lg"
              onClick={submit}
              disabled={pending || selectedWarehouse == null}
            >
              {pending ? stocktakeCopy.creating : stocktakeCopy.startCounting}
            </Button>
          }
        />
      </div>
    </BranchOperatorPage>
  );
}
