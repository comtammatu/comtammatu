import { loadAuthState } from "@/_lib/auth";
import { fetchExpiryAlerts } from "@/(protected)/inventory/alert-actions";
import {
  parseBranchIdParam,
  resolveInventoryBranchScope,
} from "@/(protected)/inventory/_lib/inventory-scope";
import { ExpiryListClient } from "@/(protected)/inventory/expiry/expiry-list-client";
import type {
  BranchOption,
  ExpiryAlertRow,
} from "@/(protected)/inventory/page";
import { getBranchSiteDisplayName } from "@/(protected)/inventory/_lib/branch-site-labels";
import { AppPage, AppPageHeader } from "@/components/surface";
import { INVENTORY_VI } from "@comtammatu/shared/messages";

export default async function ExpirySettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ branchId?: string | string[] }>;
}) {
  const params = await searchParams;
  const { supabase, claims } = await loadAuthState();

  // URL-selected branch drives client action context for tenant-wide roles.
  const requestedBranchId = parseBranchIdParam(params.branchId);
  const scope = await resolveInventoryBranchScope(supabase, claims, requestedBranchId);

  const [alertsRes, branchesRes] = await Promise.all([
    fetchExpiryAlerts(),
    supabase
      .from("branches")
      .select("id, name, is_active, branch_kind")
      .order("name"),
  ]);

  const alerts: ExpiryAlertRow[] = alertsRes.success
    ? ((alertsRes.data ?? []) as ExpiryAlertRow[])
    : [];
  const branches: BranchOption[] = (branchesRes.data ?? [])
    .filter((b) => b.is_active === true)
    .map((branch) => ({
      ...branch,
      name: getBranchSiteDisplayName(branch),
    })) as BranchOption[];

  return (
    <AppPage>
      <AppPageHeader
        eyebrow={INVENTORY_VI.settingsEyebrow}
        title={INVENTORY_VI.expiryAlertTitle}
        description={INVENTORY_VI.expiryAlertDescription}
      />
      <ExpiryListClient
        initial={alerts}
        branches={branches}
        tenantId={claims.tenant_id}
        userRole={claims.user_role}
        userBranchId={scope?.selectedBranchId ?? null}
      />
    </AppPage>
  );
}
