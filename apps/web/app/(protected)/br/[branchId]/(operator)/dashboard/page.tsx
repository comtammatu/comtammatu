import { notFound } from "next/navigation";
import { Suspense } from "react";
import { canAccess } from "@comtammatu/shared/auth";
import {
  BranchOperatorPanel,
  BranchOperatorPage,
  BranchOperatorPanelSkeleton,
} from "@lib/branch-operator/components/branch-operator-page";
import { loadAuthState } from "@/_lib/auth";
import { messages } from "@lib/messages";
import { fetchBranchDayStatus } from "./data";
import {
  buildReadinessItems,
  buildVisibleTileGroups,
  filterReadinessExceptions,
  type ReadinessHrefs,
} from "./_lib/command-config";
import {
  BranchCommandTileGrid,
  BranchReadinessList,
} from "./_components/command-sections";

type SupabaseClient = Awaited<ReturnType<typeof loadAuthState>>["supabase"];
type Claims = Awaited<ReturnType<typeof loadAuthState>>["claims"];

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

  const tileGroups = buildVisibleTileGroups(branchId, role, copy);

  const readinessHrefs: Omit<ReadinessHrefs, "floorHref"> = {
    menuHref,
    kdsSettingsHref,
    posHref,
    kdsHref,
    printersHref,
    staffHref,
    settingsHref,
    checkoutApprovalsHref,
  };

  return (
    <BranchOperatorPage title={copy.commandTitle} hideHeaderOnMobile>
      {tileGroups.liveOperations.length > 0 ? (
        <BranchOperatorPanel
          title={copy.liveOperationsTitle}
          headingLevel="h2"
        >
          <BranchCommandTileGrid
            tiles={tileGroups.liveOperations.map((tile) => ({
              ...tile,
              description: "",
            }))}
            ctaLabel={copy.openAction}
          />
        </BranchOperatorPanel>
      ) : null}

      <Suspense
        fallback={
          <BranchOperatorPanelSkeleton
            title={copy.readinessTitle}
            tone="default"
          />
        }
      >
        <BranchReadinessSection
          supabase={supabase}
          claims={claims}
          branchId={branchId}
          hrefs={readinessHrefs}
          tablesHref={tablesHref}
          posSettingsHref={posSettingsHref}
          settingsHref={settingsHref}
        />
      </Suspense>

      {tileGroups.endDay.length > 0 ? (
        <BranchOperatorPanel title={copy.endDayTitle} headingLevel="h2">
          <BranchCommandTileGrid
            tiles={tileGroups.endDay.map((tile) => ({
              ...tile,
              description: "",
            }))}
            ctaLabel={copy.openAction}
          />
        </BranchOperatorPanel>
      ) : null}
    </BranchOperatorPage>
  );
}

async function BranchReadinessSection({
  supabase,
  claims,
  branchId,
  hrefs,
  tablesHref,
  posSettingsHref,
  settingsHref,
}: {
  supabase: SupabaseClient;
  claims: Claims;
  branchId: number;
  hrefs: Omit<ReadinessHrefs, "floorHref">;
  tablesHref?: string;
  posSettingsHref?: string;
  settingsHref?: string;
}) {
  const day = await fetchBranchDayStatus(supabase, claims, branchId);
  const copy = messages.settings.branch;
  // floorHref depends on the readiness snapshot, so resolve it here from day.
  const floorHref =
    day.tablesTotal <= 0
      ? tablesHref
      : day.setupActiveTerminals <= 0
        ? posSettingsHref
        : settingsHref;
  const readinessItems = filterReadinessExceptions(
    buildReadinessItems(day, copy, { ...hrefs, floorHref }),
  );
  if (readinessItems.length === 0) {
    return null;
  }
  return (
    <BranchOperatorPanel title={copy.readinessTitle} headingLevel="h2">
      <BranchReadinessList items={readinessItems} />
    </BranchOperatorPanel>
  );
}
