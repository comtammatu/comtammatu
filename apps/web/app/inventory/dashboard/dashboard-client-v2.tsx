"use client";

import { Badge } from "@comtammatu/ui/components/badge";
import { Card, CardContent } from "@comtammatu/ui/components/card";
import { DashboardSummaryCards } from "@/inventory/_components/dashboard-summary-cards";
import { LocationBreakdownTable } from "@/inventory/_components/location-breakdown-table";
import { AlertsDrawer } from "@/inventory/_components/alerts-drawer";
import { DashboardRefreshButton } from "@/inventory/_components/dashboard-refresh-button";
import type { InventoryDashboard } from "@/inventory/dashboard-actions";
import { messages } from "@lib/messages";

interface Props {
  branchId: number;
  branchName: string;
  branchKind: string;
  dashboard: InventoryDashboard;
}

/**
 * Inventory dashboard v2 (S12) — composes 4 sections:
 *   1. Header với refresh button (server-clock synced)
 *   2. Summary cards (4 KPIs)
 *   3. Location breakdown table
 *   4. Alerts drawer (right-side Sheet)
 *
 * Flag-gated by `inv_s12_dashboard_v2`; legacy `/inventory` remains available.
 */
export function DashboardClientV2({
  branchId,
  branchName,
  branchKind,
  dashboard,
}: Props) {
  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
            Inventory dashboard
            <Badge variant="outline" className="ml-2 text-xs">
              v2 pilot
            </Badge>
          </h1>
          <p className="text-sm text-muted-foreground">
            {branchName}
            <Badge variant="secondary" className="ml-2 text-xs">
              {branchKind}
            </Badge>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <AlertsDrawer
            branchId={branchId}
            initial={dashboard.topAlerts}
            alertsCount={dashboard.summary.alertsCount}
          />
          <DashboardRefreshButton computedAt={dashboard.computedAt} />
        </div>
      </header>

      <DashboardSummaryCards
        summary={dashboard.summary}
        inTransit={dashboard.inTransit}
        canViewCost={dashboard.canViewCost}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <LocationBreakdownTable
            locations={dashboard.locations}
            canViewCost={dashboard.canViewCost}
          />
        </div>

        <aside className="space-y-3">
          <TopAlertsCard dashboard={dashboard} />
          <InTransitCard dashboard={dashboard} />
        </aside>
      </div>
    </div>
  );
}

function TopAlertsCard({ dashboard }: { dashboard: InventoryDashboard }) {
  const alerts = dashboard.topAlerts;
  return (
    <Card>
      <CardContent className="p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-heading text-sm font-semibold">
          {messages.inventory.dashboard.topAlerts}
        </h3>
        {alerts.length > 0 ? (
          <Badge
            variant="outline"
            className="bg-tier-note/15 text-tier-note-foreground border-tier-note/40"
          >
            {alerts.length}
          </Badge>
        ) : null}
      </div>
      {alerts.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {messages.inventory.dashboard.noAlertShort}
        </p>
      ) : (
        <ul className="space-y-2 text-sm">
          {alerts.map((a) => (
            <li
              key={`${a.ingredientId}-${a.locationId}`}
              className="flex items-start justify-between gap-2 rounded-md border border-muted bg-muted/30 px-2 py-1.5"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{a.ingredientName}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {messages.inventory.dashboard.stockLevel(
                    a.locationName,
                    a.currentQuantity,
                  )}
                  {a.reorderPoint !== null
                    ? messages.inventory.dashboard.reorderPointSuffix(
                        a.reorderPoint,
                      )
                    : ""}
                </div>
              </div>
              <Badge
                variant="outline"
                className={
                  a.alertType === "negative_stock"
                    ? "border-destructive/40 text-destructive"
                    : a.alertType === "out_of_stock"
                      ? "border-tier-note/40 text-tier-note-foreground"
                      : "border-warning/40 text-warning-foreground"
                }
              >
                {Math.round(a.shortageRatio * 100)}%
              </Badge>
            </li>
          ))}
        </ul>
      )}
      </CardContent>
    </Card>
  );
}

function InTransitCard({ dashboard }: { dashboard: InventoryDashboard }) {
  const items = dashboard.inTransit;
  return (
    <Card>
      <CardContent className="p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-heading text-sm font-semibold">
          {messages.inventory.dashboard.inTransitTitle}
        </h3>
        {items.length > 0 ? (
          <Badge variant="secondary">{items.length}</Badge>
        ) : null}
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {messages.inventory.dashboard.noTransfers}
        </p>
      ) : (
        <ul className="space-y-1.5 text-sm">
          {items.slice(0, 10).map((t) => (
            <li
              key={t.ingredientId}
              className="flex items-center justify-between gap-2"
            >
              <span className="truncate">{t.ingredientName}</span>
              <span className="tabular-nums text-muted-foreground">
                {messages.inventory.dashboard.transferCount(
                  t.totalQuantity,
                  t.transferCount,
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      </CardContent>
    </Card>
  );
}
