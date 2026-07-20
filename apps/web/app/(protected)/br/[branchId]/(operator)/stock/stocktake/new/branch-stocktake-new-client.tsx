/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: operator UI */
"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft as IconArrowLeft,
  ClipboardCheck as IconClipboardCheck,
} from "lucide-react";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Label } from "@comtammatu/ui/components/label";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { toast } from "@comtammatu/ui/components/sonner";
import { AppDetailFooter, AppEmptyState } from "@/components/surface";
import {
  BranchOperatorControlBar,
  BranchOperatorDetailList,
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
  const [locationId, setLocationId] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();
  const modeMeta = getModeMeta(mode);
  const selectedLocation = useMemo(
    () => locations.find((location) => location.id === locationId) ?? null,
    [locationId, locations],
  );

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

        <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1.35fr)_minmax(17rem,0.65fr)] lg:items-start">
          <BranchOperatorPanel
            title="Thiết lập phiên kiểm kê"
            description={branchName}
            icon={IconClipboardCheck}
            size="sm"
            contentClassName="gap-4"
          >
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
                  <SelectItem value="__all__" size="touch">
                    {stocktakeCopy.allLocations}
                  </SelectItem>
                  {locations.map((location) => (
                    <SelectItem
                      key={location.id}
                      value={String(location.id)}
                      size="touch"
                    >
                      {location.name}
                      {location.kind ? ` · ${location.kind}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

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
                  label: stocktakeCopy.location,
                  value: selectedLocation?.name ?? stocktakeCopy.allLocations,
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
