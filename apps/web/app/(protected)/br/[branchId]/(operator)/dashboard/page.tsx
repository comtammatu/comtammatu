import { notFound } from "next/navigation";
import { canAccess } from "@comtammatu/shared/auth";
import { formatVND } from "@comtammatu/shared/format";
import { AppSection, KpiRow } from "@/components/surface";
import { KpiCard } from "@/components/kpi/kpi-card";
import { EmployeePage } from "@/(protected)/employee/components/employee-page";
import { loadAuthState } from "@/_lib/auth";
import { messages } from "@lib/messages";
import { fetchBranchDayStatus } from "./data";
import {
  buildReadinessItems,
  buildVisibleTileGroups,
} from "./_lib/command-config";
import {
  BranchCommandTileGrid,
  BranchReadinessList,
} from "./_components/command-sections";

export default async function BranchCommandPage({
  params,
}: {
  params: Promise<{ branchId: string }>;
}) {
  const { branchId: branchIdStr } = await params;
  const branchId = Number(branchIdStr);
  if (!Number.isInteger(branchId) || branchId <= 0) {
    notFound();
  }

  const { supabase, claims } = await loadAuthState();

  const { data: branch } = await supabase
    .from("branches")
    .select("id, name, branch_kind, is_active")
    .eq("id", branchId)
    .eq("tenant_id", claims.tenant_id)
    .maybeSingle();

  if (!branch || !branch.is_active) notFound();

  const day = await fetchBranchDayStatus(supabase, claims, branchId);

  const copy = messages.settings.branch;
  const role = claims.user_role;

  const posHref = canAccess(role, "pos") ? `/br/${branchId}/pos` : undefined;
  const kdsHref = canAccess(role, "kds") ? `/br/${branchId}/kds` : undefined;
  const settingsHref = canAccess(role, "branch_settings")
    ? `/br/${branchId}/settings`
    : undefined;
  const tablesHref = settingsHref
    ? `/br/${branchId}/settings/tables`
    : undefined;
  const posSettingsHref = settingsHref
    ? `/br/${branchId}/settings/pos`
    : undefined;
  const kdsSettingsHref = settingsHref
    ? `/br/${branchId}/settings/kds`
    : undefined;
  const printersHref = settingsHref
    ? `/br/${branchId}/settings/printers`
    : undefined;
  const menuHref = canAccess(role, "branch_menu_limits")
    ? `/br/${branchId}/settings/menu-limits`
    : undefined;
  const checkoutApprovalsHref = canAccess(role, "employee_checkout_approvals")
    ? `/br/${branchId}/shift/checkout-approvals`
    : undefined;
  const hrHref = canAccess(role, "hr") ? "/hr" : undefined;

  const readinessItems = buildReadinessItems(day, copy, {
    menuHref,
    floorHref: tablesHref ?? posSettingsHref,
    kdsSettingsHref,
    posHref,
    kdsHref,
    printersHref,
    hrHref,
    settingsHref,
    checkoutApprovalsHref,
  });

  const tileGroups = buildVisibleTileGroups(branchId, role, copy);

  return (
    <EmployeePage
      title={copy.commandTitle}
      description={copy.commandDescription(branch.name)}
    >
      <KpiRow className="xl:grid-cols-4">
        <KpiCard
          label={copy.dayRevenueLabel}
          value={formatVND(day.todayRevenue)}
          hint={copy.dayRevenueHint}
        />
        <KpiCard
          label={copy.dayPaidOrdersLabel}
          value={String(day.paidOrders)}
          hint={copy.dayPaidOrdersHint}
        />
        <KpiCard
          label={copy.dayTablesLabel}
          value={`${String(day.tablesOccupied)}/${String(day.tablesTotal)}`}
          hint={copy.dayTablesHint}
          href={posHref}
        />
        <KpiCard
          label={copy.dayKitchenLabel}
          value={String(day.kitchenActiveOrders)}
          hint={copy.dayKitchenHint}
          tone={day.kitchenActiveOrders > 0 ? "warning" : "neutral"}
          href={kdsHref}
        />
      </KpiRow>

      <AppSection
        title={copy.readinessTitle}
        description={copy.readinessDescription}
      >
        <BranchReadinessList items={readinessItems} />
      </AppSection>

      {tileGroups.endDay.length > 0 ? (
        <AppSection
          title={copy.endDayTitle}
          description={copy.endDayDescription}
        >
          <BranchCommandTileGrid
            tiles={tileGroups.endDay}
            ctaLabel={copy.openAction}
          />
        </AppSection>
      ) : null}

      {tileGroups.setup.length > 0 ? (
        <AppSection
          title={copy.setupLaneTitle}
          description={copy.setupLaneDescription}
        >
          <BranchCommandTileGrid
            tiles={tileGroups.setup}
            ctaLabel={copy.openAction}
          />
        </AppSection>
      ) : null}

      {tileGroups.drilldown.length > 0 ? (
        <AppSection
          title={copy.drilldownTitle}
          description={copy.drilldownDescription}
        >
          <BranchCommandTileGrid
            tiles={tileGroups.drilldown}
            ctaLabel={copy.openAction}
          />
          </AppSection>
        ) : null}
    </EmployeePage>
  );
}
