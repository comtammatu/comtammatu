"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@comtammatu/ui/components/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { toast } from "@comtammatu/ui/components/sonner";
import { FormField } from "@/components/form";
import {
  AppDetailFooter,
  AppEmptyState,
  AppPageHeader,
  AppSection,
  DocumentFormFrame,
} from "@/components/surface";
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
  const [branchId, setBranchId] = useState<number | null>(defaultBranchId);
  const [pending, startTransition] = useTransition();
  const copy = messages.inventory.stocktake;

  useEffect(() => {
    setBranchId(defaultBranchId);
  }, [defaultBranchId]);

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
      toast.error(copy.selectBranchFirst);
      return;
    }
    if (!selectedWarehouse) {
      toast.error(copy.warehouseRequired);
      return;
    }
    startTransition(async () => {
      const res = await startStocktake({
        branchId,
        locationId: selectedWarehouse.id,
      });
      if (!res.success || !res.data) {
        toast.error(res.error ?? copy.createSessionFailed);
        return;
      }
      toast.success(
        copy.sessionCreated(res.data.sessionId, res.data.seededLines),
      );
      router.push(`${routeBase}/${res.data.sessionId}/count?branch=${branchId}`);
    });
  }

  const startButton = (
    <Button
      type="button"
      className="w-full"
      onClick={submit}
      disabled={pending || !branchId}
    >
      {pending ? copy.creating : copy.startCounting}
    </Button>
  );

  const header = <AppPageHeader title={copy.startTitle} />;

  if (loadFailed) {
    return (
      <DocumentFormFrame header={header}>
        <AppEmptyState compact mode="error" title={loadFailedTitle} />
      </DocumentFormFrame>
    );
  }

  return (
    <DocumentFormFrame
      header={header}
      scroll
      footer={<AppDetailFooter trailing={startButton} />}
    >
      <AppSection title={copy.startTitle} contentClassName="gap-4">
        <p className="text-sm text-muted-foreground">{copy.startDescription}</p>
        <FormField
          controlId="stocktake-branch"
          label={BRANCH_VI.long}
          description={branchId ? undefined : copy.selectBranchFirst}
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
        <p className="text-sm">
          <span className="text-muted-foreground">
            {messages.inventory.stock.filters.locationWarehouse}:{" "}
          </span>
          <span className="font-medium">{selectedWarehouse?.name ?? "—"}</span>
        </p>
      </AppSection>
    </DocumentFormFrame>
  );
}
