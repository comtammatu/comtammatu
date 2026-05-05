"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@comtammatu/ui/components/card";
import { Label } from "@comtammatu/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { toast } from "@comtammatu/ui/components/sonner";
import { InventoryHeader } from "../../_components/inventory-header";
import { InventoryPageContent } from "../../_components/inventory-page-layout";
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
}

export function NewStocktakeSessionClient({
  branches,
  locations,
  defaultBranchId,
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
        toast.error(res.error ?? messages.inventory.stocktake.createSessionFailed);
        return;
      }
      toast.success(
        messages.inventory.stocktake.sessionCreated(
          res.data.sessionId,
          res.data.seededLines,
        ),
      );
      router.push(
        `/inventory/stocktake/${res.data.sessionId}/count?branchId=${branchId}`,
      );
    });
  }

  return (
    <>
      <InventoryHeader
        title={messages.inventory.stocktake.startTitle}
        description={messages.inventory.stocktake.startDescription}
      />
      <InventoryPageContent>
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>{messages.inventory.stocktake.modeTitle}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <StocktakeModeSelector value={mode} onChange={setMode} />

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>{BRANCH_VI.long}</Label>
                  <Select
                    value={branchId ? String(branchId) : ""}
                    onValueChange={(v) => {
                      setBranchId(Number(v));
                      setLocationId(null);
                    }}
                  >
                    <SelectTrigger>
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

                <div className="space-y-1.5">
                  <Label>{messages.inventory.stocktake.locationOptional}</Label>
                  <Select
                    value={locationId ? String(locationId) : "__all__"}
                    onValueChange={(v) =>
                      setLocationId(v === "__all__" ? null : Number(v))
                    }
                    disabled={!branchId || branchLocations.length === 0}
                  >
                    <SelectTrigger>
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

              <div className="flex items-center justify-between rounded-md border px-3 py-2">
                <div className="flex-1">
                  <div className="font-medium text-sm">
                    {messages.inventory.stocktake.blindMode}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {messages.inventory.stocktake.defaultByMode(
                      meta.defaultBlind
                        ? messages.inventory.stocktake.on
                        : messages.inventory.stocktake.off,
                    )}
                  </div>
                </div>
                <Badge variant={effectiveBlind ? "default" : "outline"}>
                  {effectiveBlind
                    ? messages.inventory.stocktake.on
                    : messages.inventory.stocktake.off}
                </Badge>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{messages.inventory.stocktake.summary}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
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
              <div className="pt-2">
                <Button
                  className="w-full"
                  onClick={submit}
                  disabled={pending || !branchId}
                >
                  {pending
                    ? messages.inventory.stocktake.creating
                    : messages.inventory.stocktake.startCounting}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </InventoryPageContent>
    </>
  );
}
