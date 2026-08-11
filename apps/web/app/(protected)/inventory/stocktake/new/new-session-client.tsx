"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { toast } from "@comtammatu/ui/components/sonner";
import { FormField } from "@/components/form";
import {
  AppDetailFooter,
  AppEmptyState,
  AppPageHeader,
  AppSection,
  DocumentFormFrame,
} from "@/components/surface";
import {
  StocktakeModeSelector,
  getModeMeta,
  type StocktakeMode,
} from "../../_components/stocktake-mode-selector";
import { startStocktake } from "../../stocktake-actions";
import { messages } from "@lib/messages";

import { BRANCH_VI } from "@comtammatu/shared/messages";

interface BranchOpt {
  id: number;
  name: string;
}

interface LocationOpt {
  id: number;
  name: string;
  branchId: number;
  kind: string | null;
}

interface Props {
  branches: BranchOpt[];
  locations: LocationOpt[];
  defaultBranchId: number | null;
  routeBase?: string;
  loadFailed?: boolean;
  loadFailedTitle?: string;
}

export function NewStocktakeSessionClient({
  branches,
  locations,
  defaultBranchId,
  routeBase = "/inventory/stocktake",
  loadFailed = false,
  loadFailedTitle = messages.inventory.stocktake.startLoadFailed,
}: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<StocktakeMode>("daily");
  const [branchId, setBranchId] = useState<number | null>(defaultBranchId);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setBranchId(defaultBranchId);
  }, [defaultBranchId]);

  const meta = getModeMeta(mode);
  const effectiveBlind = meta.defaultBlind;

  const branchLocations = useMemo(
    () => (branchId ? locations.filter((l) => l.branchId === branchId) : []),
    [branchId, locations],
  );
  const selectedWarehouse = useMemo(
    () =>
      branchLocations.find((location) => location.kind === "warehouse") ??
      branchLocations[0] ??
      null,
    [branchLocations],
  );
  function submit() {
    if (!branchId) {
      toast.error(messages.inventory.stocktake.selectBranchFirst);
      return;
    }
    if (!selectedWarehouse) {
      toast.error(messages.inventory.stocktake.warehouseRequired);
      return;
    }
    startTransition(async () => {
      const res = await startStocktake({
        branchId,
        locationId: selectedWarehouse.id,
        mode,
      });
      if (!res.success || !res.data) {
        toast.error(
          res.error ?? messages.inventory.stocktake.createSessionFailed,
        );
        return;
      }
      toast.success(
        messages.inventory.stocktake.sessionCreated(
          res.data.sessionId,
          res.data.seededLines,
        ),
      );
      router.push(
        `${routeBase}/${res.data.sessionId}/count?branch=${branchId}`,
      );
    });
  }

  const startButton = (
    <Button
      type="button"
      className="w-full"
      onClick={submit}
      disabled={pending || !branchId}
    >
      {pending
        ? messages.inventory.stocktake.creating
        : messages.inventory.stocktake.startCounting}
    </Button>
  );

  const header = (
    <AppPageHeader title={messages.inventory.stocktake.startTitle} />
  );

  if (loadFailed) {
    return (
      <DocumentFormFrame header={header}>
        <AppEmptyState compact mode="error" title={loadFailedTitle} />
      </DocumentFormFrame>
    );
  }

  const content = (
    <div className="grid gap-4 lg:grid-cols-3">
        <AppSection
          title={messages.inventory.stocktake.modeTitle}
          className="lg:col-span-2"
          contentClassName="gap-4"
        >
          <StocktakeModeSelector value={mode} onChange={setMode} />

          <div className="grid gap-3 sm:grid-cols-2">
            <FormField
              controlId="stocktake-branch"
              label={BRANCH_VI.long}
              description={
                branchId
                  ? undefined
                  : messages.inventory.stocktake.selectBranchFirst
              }
              required
            >
              <Select
                value={branchId ? String(branchId) : ""}
                onValueChange={(v) => setBranchId(Number(v))}
              >
                <SelectTrigger
                  id="stocktake-branch"
                  size="field"
                  className="w-full"
                  aria-required
                >
                  <SelectValue placeholder={BRANCH_VI.select} />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={String(b.id)}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>

          </div>

          <Item variant="outline" size="sm">
            <ItemContent className="min-w-0 flex-1">
              <ItemTitle className="text-sm font-medium">
                {messages.inventory.stocktake.blindMode}
              </ItemTitle>
              <ItemDescription className="text-xs text-muted-foreground">
                {messages.inventory.stocktake.defaultByMode(
                  meta.defaultBlind
                    ? messages.inventory.stocktake.on
                    : messages.inventory.stocktake.off,
                )}
              </ItemDescription>
            </ItemContent>
            <Badge
              variant={effectiveBlind ? "default" : "outline"}
              className="shrink-0"
            >
              {effectiveBlind
                ? messages.inventory.stocktake.on
                : messages.inventory.stocktake.off}
            </Badge>
          </Item>
        </AppSection>

        <AppSection
          title={messages.inventory.stocktake.summary}
          contentClassName="gap-2 text-sm"
        >
          <div className="flex justify-between">
            <span className="text-muted-foreground">
              {messages.inventory.stocktake.mode}
            </span>
            <span className="font-medium">{mode}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">
              {messages.inventory.stocktake.blind}
            </span>
            <span className="font-medium">
              {effectiveBlind
                ? messages.inventory.stocktake.on
                : messages.inventory.stocktake.off}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">{BRANCH_VI.long}</span>
            <span className="font-medium">
              {branches.find((b) => b.id === branchId)?.name ?? "—"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">
              {messages.inventory.stock.filters.locationWarehouse}
            </span>
            <span className="font-medium">
              {selectedWarehouse?.name ?? "—"}
            </span>
          </div>
        </AppSection>
    </div>
  );

  return (
    <DocumentFormFrame
      header={header}
      scroll
      footer={<AppDetailFooter trailing={startButton} />}
    >
      {content}
    </DocumentFormFrame>
  );
}
