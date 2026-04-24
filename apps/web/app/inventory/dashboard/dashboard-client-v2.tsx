"use client";

import { Badge } from "@comtammatu/ui/components/badge";
import { DashboardSummaryCards } from "@/inventory/_components/dashboard-summary-cards";
import { LocationBreakdownTable } from "@/inventory/_components/location-breakdown-table";
import { AlertsDrawer } from "@/inventory/_components/alerts-drawer";
import { DashboardRefreshButton } from "@/inventory/_components/dashboard-refresh-button";
import type { InventoryDashboard } from "@/inventory/dashboard-actions";

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
    <div className="container mx-auto max-w-6xl space-y-4 py-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">
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
    <section className="rounded-lg border bg-card p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Top 5 alerts</h3>
        {alerts.length > 0 ? (
          <Badge
            variant="outline"
            className="bg-orange-100 text-orange-900 border-orange-300"
          >
            {alerts.length}
          </Badge>
        ) : null}
      </div>
      {alerts.length === 0 ? (
        <p className="text-sm text-muted-foreground">Không có alert.</p>
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
                  {a.locationName} • Tồn: {a.currentQuantity}
                  {a.reorderPoint !== null ? ` / ngưỡng ${a.reorderPoint}` : ""}
                </div>
              </div>
              <Badge
                variant="outline"
                className={
                  a.alertType === "negative_stock"
                    ? "border-red-300 text-red-900"
                    : a.alertType === "out_of_stock"
                      ? "border-orange-300 text-orange-900"
                      : "border-yellow-300 text-yellow-900"
                }
              >
                {Math.round(a.shortageRatio * 100)}%
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function InTransitCard({ dashboard }: { dashboard: InventoryDashboard }) {
  const items = dashboard.inTransit;
  return (
    <section className="rounded-lg border bg-card p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Đang vận chuyển</h3>
        {items.length > 0 ? (
          <Badge variant="secondary">{items.length}</Badge>
        ) : null}
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Không có chuyển kho.</p>
      ) : (
        <ul className="space-y-1.5 text-sm">
          {items.slice(0, 10).map((t) => (
            <li
              key={t.ingredientId}
              className="flex items-center justify-between gap-2"
            >
              <span className="truncate">{t.ingredientName}</span>
              <span className="tabular-nums text-muted-foreground">
                {t.totalQuantity} • {t.transferCount} phiếu
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
