"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Label } from "@comtammatu/ui/components/label";
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
import {
  AppDetailFooter,
  AppPageHeader,
  AppSection,
  DocumentFormFrame,
} from "@/components/surface";
import {
  StocktakeModeSelector,
  getModeMeta,
  type StocktakeMode,
} from "../../_components/stocktake-mode-selector";
import { OperatorFlowSteps } from "../../_components/operator-flow-steps";
import { startStocktake } from "../../stocktake-actions";
import { messages } from "@lib/messages";

import { BRANCH_VI } from "@comtammatu/shared/messages";

const eyebrowLabel = "Kiểm kê";
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
  embedded?: boolean;
}

export function NewStocktakeSessionClient({
  branches,
  locations,
  defaultBranchId,
  routeBase = "/inventory/stocktake",
  embedded = false,
}: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<StocktakeMode>("daily");
  const [branchId, setBranchId] = useState<number | null>(defaultBranchId);
  const [locationId, setLocationId] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setBranchId(defaultBranchId);
    setLocationId(null);
  }, [defaultBranchId]);

  const meta = getModeMeta(mode);
  const effectiveBlind = meta.defaultBlind;

  const branchLocations = useMemo(
    () => (branchId ? locations.filter((l) => l.branchId === branchId) : []),
    [branchId, locations],
  );
  const operatorFlow = messages.inventory.operatorFlow;

  function submit() {
    if (!branchId) {
      toast.error(messages.inventory.stocktake.selectBranchFirst);
      return;
    }
    startTransition(async () => {
      const res = await startStocktake({
        branchId,
        locationId: locationId ?? undefined,
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
        `${routeBase}/${res.data.sessionId}/count?branchId=${branchId}`,
      );
    });
  }

  const startButton = (
    <Button
      type="button"
      size={embedded ? "touch-lg" : "default"}
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
    <AppPageHeader
      eyebrow={eyebrowLabel}
      title={messages.inventory.stocktake.startTitle}
      description={messages.inventory.stocktake.startDescription}
    />
  );

  const content = (
    <>
      <OperatorFlowSteps
        title={operatorFlow.stocktakeListTitle}
        description={operatorFlow.stocktakeListDescription}
        steps={operatorFlow.stocktakeSteps}
        currentStep={1}
      />
      <div
        className={
          embedded ? "flex flex-col gap-4" : "grid gap-4 lg:grid-cols-3"
        }
      >
        <AppSection
          title={messages.inventory.stocktake.modeTitle}
          className={embedded ? undefined : "lg:col-span-2"}
          contentClassName="gap-4"
        >
          <StocktakeModeSelector value={mode} onChange={setMode} />

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label>{BRANCH_VI.long}</Label>
              <Select
                value={branchId ? String(branchId) : ""}
                onValueChange={(v) => {
                  setBranchId(Number(v));
                  setLocationId(null);
                }}
              >
                <SelectTrigger
                  size={embedded ? "touch" : "default"}
                  className="w-full"
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
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>{messages.inventory.stocktake.locationOptional}</Label>
              <Select
                value={locationId ? String(locationId) : "__all__"}
                onValueChange={(v) =>
                  setLocationId(v === "__all__" ? null : Number(v))
                }
                disabled={!branchId || branchLocations.length === 0}
              >
                <SelectTrigger
                  size={embedded ? "touch" : "default"}
                  className="w-full"
                >
                  <SelectValue
                    placeholder={messages.inventory.stocktake.allLocations}
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">
                    {messages.inventory.stocktake.allLocations}
                  </SelectItem>
                  {branchLocations.map((l) => (
                    <SelectItem key={l.id} value={String(l.id)}>
                      {l.name}
                      {l.kind ? ` · ${l.kind}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
              {messages.inventory.stocktake.location}
            </span>
            <span className="font-medium">
              {locations.find((l) => l.id === locationId)?.name ??
                messages.inventory.common.all}
            </span>
          </div>
          {embedded ? null : startButton}
        </AppSection>
        {embedded ? (
          <AppDetailFooter
            sticky
            className="lg:col-span-3"
            trailing={startButton}
          />
        ) : null}
      </div>
    </>
  );

  if (embedded) {
    return <div className="flex w-full flex-col gap-3">{content}</div>;
  }

  return (
    <DocumentFormFrame header={header} scroll>
      {content}
    </DocumentFormFrame>
  );
}
