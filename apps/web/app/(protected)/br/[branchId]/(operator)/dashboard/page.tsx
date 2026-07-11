import { notFound } from "next/navigation";
import { canAccess } from "@comtammatu/shared/auth";
import {
  BranchOperatorPage,
  BranchOperatorPanel,
} from "@lib/branch-operator/components/branch-operator-page";
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

  if (!branch || !branch.is_active || branch.branch_kind !== "branch") notFound();

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
    ? `/br/${branchId}/menu-limits`
    : undefined;
  const checkoutApprovalsHref = canAccess(role, "employee_checkout_approvals")
    ? `/br/${branchId}/shift/checkout-approvals`
    : undefined;
  const staffHref = canAccess(role, "branch_team")
    ? `/br/${branchId}/team`
    : undefined;
  const floorHref =
    day.tablesTotal <= 0
      ? tablesHref
      : day.setupActiveTerminals <= 0
        ? posSettingsHref
        : settingsHref;

  const readinessItems = buildReadinessItems(day, copy, {
    menuHref,
    floorHref,
    kdsSettingsHref,
    posHref,
    kdsHref,
    printersHref,
    staffHref,
    settingsHref,
    checkoutApprovalsHref,
  });

  const tileGroups = buildVisibleTileGroups(branchId, role, copy);

  return (
    <BranchOperatorPage
      title={copy.commandTitle}
      description={copy.commandDescription}
    >
      {tileGroups.liveOperations.length > 0 ? (
        <BranchOperatorPanel
          title={copy.liveOperationsTitle}
          description={copy.liveOperationsDescription}
        >
          <BranchCommandTileGrid
            tiles={tileGroups.liveOperations}
            ctaLabel={copy.openAction}
          />
        </BranchOperatorPanel>
      ) : null}

      <BranchOperatorPanel
        title={copy.readinessTitle}
        description={copy.readinessDescription}
      >
        <BranchReadinessList items={readinessItems} />
      </BranchOperatorPanel>

      {tileGroups.endDay.length > 0 ? (
        <BranchOperatorPanel
          title={copy.endDayTitle}
          description={copy.endDayDescription}
        >
          <BranchCommandTileGrid
            tiles={tileGroups.endDay}
            ctaLabel={copy.openAction}
          />
        </BranchOperatorPanel>
      ) : null}

      {tileGroups.drilldown.length > 0 ? (
        <BranchOperatorPanel
          title={copy.drilldownTitle}
          description={copy.drilldownDescription}
        >
          <BranchCommandTileGrid
            tiles={tileGroups.drilldown}
            ctaLabel={copy.openAction}
          />
        </BranchOperatorPanel>
      ) : null}
    </BranchOperatorPage>
  );
}
