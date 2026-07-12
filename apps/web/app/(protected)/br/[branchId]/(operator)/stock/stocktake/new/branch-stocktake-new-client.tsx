/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: operator UI */
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ClipboardCheck as IconClipboardCheck } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { Label } from "@comtammatu/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { toast } from "@comtammatu/ui/components/sonner";
import { AppDetailFooter, AppEmptyState } from "@/components/surface";
import { BranchOperatorPage } from "@lib/branch-operator/components/branch-operator-page";
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
  backHref,
  canManage,
  locations,
}: {
  branchId: number;
  branchName: string;
  backHref: string;
  canManage: boolean;
  locations: BranchStocktakeLocation[];
}) {
  const router = useRouter();
  const stocktakeBasePath = `/br/${branchId}/stock/stocktake`;
  const [mode, setMode] = useState<StocktakeMode>("daily");
  const [locationId, setLocationId] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();
  const modeMeta = getModeMeta(mode);

  function submit() {
    startTransition(async () => {
      const result = await startStocktake({
        branchId,
        locationId: locationId ?? undefined,
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
      backHref={backHref}
      backLabel="Kiểm kê"
    >
      <div className="flex min-w-0 touch-manipulation flex-col gap-3">
        <StocktakeModeSelector value={mode} onChange={setMode} />

        <div className="flex min-w-0 flex-col gap-1.5">
          <Label>{stocktakeCopy.locationOptional}</Label>
          <Select
            value={locationId === null ? "__all__" : String(locationId)}
            onValueChange={(value) =>
              setLocationId(value === "__all__" ? null : Number(value))
            }
          >
            <SelectTrigger
              aria-label={stocktakeCopy.locationOptional}
              size="touch"
              className="w-full"
            >
              <SelectValue placeholder={stocktakeCopy.allLocations} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">
                {stocktakeCopy.allLocations}
              </SelectItem>
              {locations.map((location) => (
                <SelectItem key={location.id} value={String(location.id)}>
                  {location.name}
                  {location.kind ? ` · ${location.kind}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <p className="text-sm text-muted-foreground">
          {stocktakeCopy.blindMode}:{" "}
          <span className="font-medium text-foreground">
            {modeMeta.defaultBlind ? stocktakeCopy.on : stocktakeCopy.off}
          </span>
          .{" "}
          {stocktakeCopy.defaultByMode(
            modeMeta.defaultBlind ? stocktakeCopy.on : stocktakeCopy.off,
          )}
        </p>

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
