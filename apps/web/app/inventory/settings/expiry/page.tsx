import { createClient } from "@comtammatu/database/supabase/server";
import { extractClaimsFromAccessToken } from "@comtammatu/shared/auth";
import { fetchExpiryAlerts } from "@/inventory/actions";
import {
  parseBranchIdParam,
  resolveInventoryBranchScope,
} from "@/inventory/_lib/inventory-scope";
import { ExpiryListClient } from "@/inventory/expiry/expiry-list-client";
import type { BranchOption, ExpiryAlertRow } from "@/inventory/page";
import { getBranchSiteDisplayName } from "@/inventory/_lib/branch-site-labels";

export default async function ExpirySettingsPage({
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

  // URL-selected branch drives client action context for tenant-wide roles.
  const requestedBranchId = parseBranchIdParam(params.branchId);
  const scope = claims
    ? await resolveInventoryBranchScope(supabase, claims, requestedBranchId)
    : null;

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
    <ExpiryListClient
      initial={alerts}
      branches={branches}
      userRole={claims?.user_role ?? "branch_manager"}
      userBranchId={scope?.selectedBranchId ?? null}
    />
  );
}
