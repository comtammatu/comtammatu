"use client";

import Link from "next/link";
import {
  Plus as IconPlus,
  Utensils as IconUtensils,
  Zap as IconZap,
} from "lucide-react";
import { formatCount, formatPercent } from "@comtammatu/shared/format";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Progress } from "@comtammatu/ui/components/progress";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { NoteCallout } from "@comtammatu/ui/components/note-callout";
import { AppSection } from "@/components/surface";
import { KpiCard } from "@/components/kpi/kpi-card";
import { withControlSurfaceBranchScope } from "@/lib/control-surface-scope";
import { messages } from "@lib/messages";

const copy = messages.inventory.shiftCockpit;

export interface InventoryShiftCockpitProps {
  branchId: number | null;
  grnCount: number;
  grnPriceCount: number;
  wasteCount: number;
  transferCount: number;
  canAccessProduction: boolean;
  canAccessProcurement: boolean;
}

function scopeHref(href: string, branchId: number | null): string {
  if (branchId == null) return href;
  return withControlSurfaceBranchScope(href, String(branchId) as `${number}`, {
    prefixes: ["/inventory"],
  });
}

interface DeficitItem {
  id: string;
  sku: string;
  name: string;
  category: string;
  sourceKind: "central_kitchen" | "central_supply" | "local_vendor";
  sourceLabel: string;
  available: number;
  allocated: number;
  deficit: number;
  unit: string;
  actionLabel: string;
  actionHref: string;
  isUrgent: boolean;
}

interface ProductionBatchItem {
  id: string;
  name: string;
  targetQty: number;
  actualQty: number;
  unit: string;
  status: "completed" | "in_progress" | "scheduled";
  statusLabel: string;
  progressPercent: number;
}

interface DispatchShipment {
  id: string;
  code: string;
  origin: string;
  destination: string;
  itemsCount: number;
  status: "in_transit" | "loading" | "pending_approval";
  statusLabel: string;
  driver?: string;
}

export function InventoryShiftCockpit({
  branchId,
  wasteCount,
  transferCount,
  grnPriceCount,
}: InventoryShiftCockpitProps) {
  const sampleDeficits: DeficitItem[] = [
    {
      id: "ing-cha-trung",
      sku: "CK-CHA-01",
      name: copy.sampleItems.chaTrung,
      category: copy.sampleItems.catHalfDone,
      sourceKind: "central_kitchen",
      sourceLabel: copy.sources.centralKitchen,
      available: 45,
      allocated: 30,
      deficit: 15,
      unit: copy.sampleItems.unitPortion,
      actionLabel: copy.actionLabels.transfer,
      actionHref: "/inventory/transfers/new?source=kitchen",
      isUrgent: true,
    },
    {
      id: "ing-xiu-mai",
      sku: "CK-XMAI-02",
      name: copy.sampleItems.xiuMai,
      category: copy.sampleItems.catHalfDone,
      sourceKind: "central_kitchen",
      sourceLabel: copy.sources.centralKitchen,
      available: 0,
      allocated: 0,
      deficit: 105,
      unit: copy.sampleItems.unitPortion,
      actionLabel: copy.actionLabels.addToBatch,
      actionHref: "/inventory/production",
      isUrgent: true,
    },
    {
      id: "ing-gao-st25",
      sku: "CS-GAO-ST25",
      name: copy.sampleItems.gaoSt25,
      category: copy.sampleItems.catStaple,
      sourceKind: "central_supply",
      sourceLabel: copy.sources.centralSupply,
      available: 1500,
      allocated: 165,
      deficit: 165,
      unit: copy.sampleItems.unitKg,
      actionLabel: copy.actionLabels.transferWarehouse,
      actionHref: "/inventory/transfers/new?source=supply",
      isUrgent: false,
    },
    {
      id: "ing-da-bi",
      sku: "LV-DABI-20",
      name: copy.sampleItems.daBi,
      category: copy.sampleItems.catBeverageIce,
      sourceKind: "local_vendor",
      sourceLabel: copy.sources.localVendor,
      available: 0,
      allocated: 8,
      deficit: 8,
      unit: copy.sampleItems.unitBag,
      actionLabel: copy.actionLabels.directReceive,
      actionHref: "/inventory/grn/new?vendor=local",
      isUrgent: true,
    },
  ];

  const sampleBatchItems: ProductionBatchItem[] = [
    {
      id: "batch-1",
      name: copy.sampleItems.batchChaTrung,
      targetQty: 45,
      actualQty: 45,
      unit: copy.sampleItems.unitPan,
      status: "completed",
      statusLabel: copy.statuses.completed,
      progressPercent: 100,
    },
    {
      id: "batch-2",
      name: copy.sampleItems.batchXiuMai,
      targetQty: 105,
      actualQty: 40,
      unit: copy.sampleItems.unitPortion,
      status: "in_progress",
      statusLabel: copy.statuses.inProgress,
      progressPercent: 38,
    },
    {
      id: "batch-3",
      name: copy.sampleItems.batchSuon,
      targetQty: 80,
      actualQty: 0,
      unit: copy.sampleItems.unitKg,
      status: "scheduled",
      statusLabel: copy.statuses.scheduled,
      progressPercent: 0,
    },
  ];

  const sampleDispatches: DispatchShipment[] = [
    {
      id: "disp-1",
      code: "DC-0907-001",
      origin: copy.sources.centralKitchen,
      destination: copy.sampleItems.destQ1,
      itemsCount: 4,
      status: "in_transit",
      statusLabel: copy.statuses.inTransit,
      driver: copy.sampleItems.driverMinh,
    },
    {
      id: "disp-2",
      code: "DC-0907-002",
      origin: copy.sources.centralSupply,
      destination: copy.sampleItems.destLVS,
      itemsCount: 6,
      status: "loading",
      statusLabel: copy.statuses.loading,
      driver: copy.sampleItems.driverHung,
    },
    {
      id: "disp-3",
      code: "DC-0907-003",
      origin: copy.sources.centralKitchen,
      destination: copy.sampleItems.destTB,
      itemsCount: 3,
      status: "pending_approval",
      statusLabel: copy.statuses.pendingApproval,
    },
  ];

  const totalDeficits = sampleDeficits.length;
  const activeDispatches = sampleDispatches.filter(
    (d) => d.status === "in_transit" || d.status === "loading",
  ).length;
  const completedBatchLines = sampleBatchItems.filter(
    (b) => b.status === "completed",
  ).length;

  return (
    <div className="flex flex-col gap-4">
      {/* ZONE 1: KPI PULSE STRIP — REALTIME SHIFT HEALTH */}
      <div
        className="no-scrollbar flex touch-pan-x gap-3 overflow-x-auto overscroll-x-contain pb-1 sm:grid sm:grid-cols-2 lg:grid-cols-4 sm:overflow-visible"
        role="region"
        aria-label={copy.ariaRegion}
      >
        <KpiCard
          label={copy.deficitAlerts}
          value={formatCount(totalDeficits)}
          hint={copy.deficitAlertsHint}
          tone="destructive"
          href={scopeHref("/inventory/stock", branchId)}
        />

        <KpiCard
          label={copy.centralKitchenBatch}
          value={`${completedBatchLines}/${sampleBatchItems.length}`}
          hint={copy.centralKitchenBatchHint}
          tone="primary"
          href={scopeHref("/inventory/production", branchId)}
        />

        <KpiCard
          label={copy.transfersAndLogistics}
          value={formatCount(transferCount > 0 ? transferCount : activeDispatches)}
          hint={copy.transfersAndLogisticsHint}
          tone="neutral"
          href={scopeHref("/inventory/transfers", branchId)}
        />

        <KpiCard
          label={copy.wasteAndExceptions}
          value={formatCount(wasteCount + grnPriceCount)}
          hint={wasteCount > 0 ? copy.wastePendingCount(wasteCount) : copy.wasteAndExceptionsHintNormal}
          tone={wasteCount > 0 ? "warning" : "neutral"}
          href={scopeHref("/inventory/waste/approvals", branchId)}
        />
      </div>

      {/* ZONE 2 & 3: MAIN TWO-COLUMN WORKFLOW ON DESKTOP (60% / 40%) */}
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-12">
        {/* LEFT COLUMN: CHAIN DEFICIT RADAR (60% W = 7 cols on lg) */}
        <section
          className="flex flex-col gap-3 lg:col-span-7"
          aria-label={copy.deficitRadarAria}
        >
          <AppSection
            title={copy.deficitRadarTitle}
            headingLevel="h2"
            action={
              <Badge variant="outline" className="font-mono text-xs">
                {copy.deficitBadge(totalDeficits)}
              </Badge>
            }
          >
            <ItemGroup className="gap-2">
              {sampleDeficits.map((item) => (
                <Item
                  key={item.id}
                  variant="outline"
                  className="flex-col items-start gap-2 p-3 transition-colors hover:bg-muted/30 sm:flex-row sm:items-center sm:justify-between"
                >
                  <ItemContent className="min-w-0 flex-1 gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-medium text-muted-foreground">
                        {item.sku}
                      </span>
                      <ItemTitle className="font-heading text-sm font-semibold text-foreground">
                        {item.name}
                      </ItemTitle>
                      <Badge
                        variant={item.isUrgent ? "destructive" : "warning"}
                        className="text-2xs"
                      >
                        {copy.deficitAmount(item.deficit, item.unit)}
                      </Badge>
                    </div>

                    <ItemDescription className="flex flex-wrap items-center gap-2 text-xs">
                      <span>
                        {copy.sourcePrefix}{" "}
                        <span className="font-medium text-foreground">
                          {item.sourceLabel}
                        </span>
                      </span>
                      <span>·</span>
                      <span>
                        {copy.stockPrefix}{" "}
                        <span className="font-mono font-medium text-foreground">
                          {item.available} {item.unit}
                        </span>
                      </span>
                      <span>·</span>
                      <span>
                        {copy.needTransferPrefix}{" "}
                        <span className="font-mono font-medium text-destructive">
                          {item.allocated > 0 ? item.allocated : item.deficit}{" "}
                          {item.unit}
                        </span>
                      </span>
                    </ItemDescription>
                  </ItemContent>

                  <ItemActions className="w-full shrink-0 sm:w-auto">
                    <Button
                      variant={item.isUrgent ? "default" : "outline"}
                      size="sm"
                      className="w-full sm:w-auto"
                      render={<Link href={scopeHref(item.actionHref, branchId)} />}
                    >
                      <IconZap data-icon="inline-start" className="size-4" />
                      <span>{item.actionLabel}</span>
                    </Button>
                  </ItemActions>
                </Item>
              ))}
            </ItemGroup>

            <div className="flex items-center justify-between rounded-md bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              <span>{copy.formulaHint}</span>
              <Link
                href={scopeHref("/inventory/stock", branchId)}
                className="font-medium text-primary hover:underline"
              >
                {copy.viewFullMatrix}
              </Link>
            </div>
          </AppSection>
        </section>

        {/* RIGHT COLUMN: CENTRAL KITCHEN & FULFILLMENT DISPATCH (40% W = 5 cols on lg) */}
        <section
          className="flex flex-col gap-4 lg:col-span-5"
          aria-label={copy.batchAria}
        >
          {/* Section A: Central Kitchen Daily Batch */}
          <AppSection
            title={copy.batchTitle}
            headingLevel="h2"
            action={
              <Badge variant="outline" className="text-2xs font-mono">
                {copy.morningShift}
              </Badge>
            }
          >
            <div className="flex flex-col gap-3">
              {sampleBatchItems.map((batch) => (
                <div key={batch.id} className="flex flex-col gap-1 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium text-foreground">
                      {batch.name}
                    </span>
                    <Badge
                      variant={
                        batch.status === "completed"
                          ? "success"
                          : batch.status === "in_progress"
                            ? "warning"
                            : "outline"
                      }
                      className="text-2xs"
                    >
                      {batch.statusLabel}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between font-mono text-2xs text-muted-foreground">
                    <span>
                      {copy.progressLabel(batch.actualQty, batch.targetQty, batch.unit)}
                    </span>
                    <span>{formatPercent(batch.progressPercent / 100)}</span>
                  </div>
                  <Progress
                    value={batch.progressPercent}
                    className="h-1.5 w-full bg-muted"
                  />
                </div>
              ))}

              <div className="flex gap-2 pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 text-xs"
                  render={<Link href={scopeHref("/inventory/production", branchId)} />}
                >
                  <IconPlus data-icon="inline-start" className="size-4" />
                  {copy.addToBatch}
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  className="flex-1 text-xs"
                  render={<Link href={scopeHref("/inventory/production", branchId)} />}
                >
                  {copy.manageProduction}
                </Button>
              </div>
            </div>
          </AppSection>

          {/* Section B: Fulfillment & Dispatch Queue */}
          <AppSection
            title={copy.dispatchQueueTitle}
            headingLevel="h2"
            action={
              <Badge variant="outline" className="text-2xs font-mono">
                {copy.shipmentCountBadge(sampleDispatches.length)}
              </Badge>
            }
          >
            <ItemGroup className="gap-2">
              {sampleDispatches.map((shipment) => (
                <Item
                  key={shipment.id}
                  variant="outline"
                  size="sm"
                  className="items-center justify-between p-2.5 text-xs transition-colors hover:bg-muted/30"
                >
                  <ItemContent className="min-w-0 gap-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-medium text-foreground">
                        {shipment.code}
                      </span>
                      <span className="text-muted-foreground">→</span>
                      <span className="truncate font-medium text-foreground">
                        {shipment.destination}
                      </span>
                    </div>
                    <ItemDescription className="truncate text-2xs text-muted-foreground">
                      {shipment.origin} · {copy.itemCount(shipment.itemsCount)}
                      {shipment.driver ? ` · ${shipment.driver}` : ""}
                    </ItemDescription>
                  </ItemContent>

                  <ItemActions>
                    <Badge
                      variant={
                        shipment.status === "in_transit"
                          ? "info"
                          : shipment.status === "loading"
                            ? "warning"
                            : "outline"
                      }
                      className="shrink-0 text-2xs"
                    >
                      {shipment.statusLabel}
                    </Badge>
                  </ItemActions>
                </Item>
              ))}
            </ItemGroup>

            <Button
              variant="outline"
              size="sm"
              className="w-full text-xs"
              render={<Link href={scopeHref("/inventory/transfers", branchId)} />}
            >
              {copy.viewAllTransfers(sampleDispatches.length)}
            </Button>
          </AppSection>
        </section>
      </div>

      {/* ZONE 4: REALTIME POS CONSUMPTION & EXCEPTION AUDIT STRIP */}
      <AppSection
        title={copy.posConsumptionTitle}
        headingLevel="h2"
      >
        <div className="flex flex-col gap-3 py-1 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
              <IconUtensils className="size-4" aria-hidden />
            </div>
            <div className="flex flex-col gap-1">
              <h3 className="font-heading text-sm font-semibold text-foreground">
                {copy.autoDeductionTitle}
              </h3>
              <p className="text-xs text-muted-foreground">
                {copy.autoDeductionDesc(85, 42, 12)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Badge variant="outline" className="font-mono text-xs">
              {copy.kdsStreamActive}
            </Badge>
            <Button
              variant="outline"
              size="sm"
              className="text-xs"
              render={<Link href={scopeHref("/inventory/consumption", branchId)} />}
            >
              {copy.consumptionDetailAction}
            </Button>
          </div>
        </div>

        {wasteCount > 0 ? (
          <div className="mt-2">
            <NoteCallout tone="warning" className="w-full">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-xs">
                  {copy.wasteAlertCallout(wasteCount)}
                </span>
                <Link
                  href={scopeHref("/inventory/waste/approvals", branchId)}
                  className="font-semibold text-xs underline hover:no-underline"
                >
                  {copy.resolveNow}
                </Link>
              </div>
            </NoteCallout>
          </div>
        ) : null}
      </AppSection>
    </div>
  );
}
