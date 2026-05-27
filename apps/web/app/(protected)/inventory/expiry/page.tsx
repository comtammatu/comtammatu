import { createClient } from "@comtammatu/database/supabase/server";
import { extractClaimsFromAccessToken } from "@comtammatu/shared/auth";
import { fetchExpiryAlerts } from "@/(protected)/inventory/actions";
import {
  resolveInventoryBranchScope,
  resolveRequestedBranchId,
} from "@/(protected)/inventory/_lib/inventory-scope";
import { ExpiryListClient } from "@/(protected)/inventory/expiry/expiry-list-client";
import type {
  BranchOption,
  ExpiryAlertRow,
} from "@/(protected)/inventory/page";
import { getBranchSiteDisplayName } from "@/(protected)/inventory/_lib/branch-site-labels";

export default async function ExpiryPage({
  searchParams,
}: {
  searchParams: Promise<{ branchId?: string | string[] }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const claims = session?.user
    ? extractClaimsFromAccessToken(session.access_token)
    : null;

  // Sidebar-selected branch drives both read filter and client action context.
  const requested = await resolveRequestedBranchId(params.branchId);
  const scope = claims
    ? await resolveInventoryBranchScope(supabase, claims, requested)
    : null;
  const branchFilter = scope?.selectedBranchId ?? undefined;

  const [alertsRes, branchesRes] = await Promise.all([
    fetchExpiryAlerts(branchFilter),
    supabase
      .from("branches")
      .select("id, name, is_active, branch_kind")
      .order("name"),
  ]);

  const alerts: ExpiryAlertRow[] = alertsRes.success
    ? ((alertsRes.data ?? []) as ExpiryAlertRow[])
    : [];
  const branches: BranchOption[] = (branchesRes.data ?? [])
    .filter((branch) => branch.is_active === true)
    .map((branch) => ({
      ...branch,
      name: getBranchSiteDisplayName(branch),
    })) as BranchOption[];

  return (
    <ExpiryListClient
      initial={alerts}
      branches={branches}
      userRole={claims?.user_role ?? "branch_manager"}
      userBranchId={scope?.selectedBranchId ?? null}
    />
  );
}
