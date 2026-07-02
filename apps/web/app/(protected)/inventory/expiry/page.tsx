import { notFound } from "next/navigation";
import { loadAuthState } from "@/_lib/auth";
import { fetchExpiryAlerts } from "@/(protected)/inventory/alert-actions";
import { resolveInventoryListScope } from "@/(protected)/inventory/_lib/inventory-scope";
import { ExpiryListClient } from "@/(protected)/inventory/expiry/expiry-list-client";
import type {
  BranchOption,
  ExpiryAlertRow,
} from "@/(protected)/inventory/page";
import { getBranchSiteDisplayName } from "@/(protected)/inventory/_lib/branch-site-labels";

interface ExpiryPageContentProps {
  searchParams?: Promise<{ branchId?: string | string[] }>;
  routeBranchId?: number;
  embedded?: boolean;
}

export async function ExpiryPageContent({
  searchParams,
  routeBranchId,
  embedded = false,
}: ExpiryPageContentProps) {
  const params = searchParams ? await searchParams : {};
  const { supabase, claims } = await loadAuthState();

  // Sidebar-selected branch drives both read filter and client action context.
  const scope = await resolveInventoryListScope(supabase, claims, {
    routeBranchId,
    queryBranchId: params.branchId,
  });
  if (scope.outOfScope) notFound();
  const branchFilter = scope.selectedBranchId ?? undefined;

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
      tenantId={claims.tenant_id}
      userRole={claims.user_role}
      userBranchId={scope.selectedBranchId}
      embedded={embedded}
    />
  );
}

export default async function ExpiryPage({
  searchParams,
}: {
  searchParams: Promise<{ branchId?: string | string[] }>;
}) {
  return <ExpiryPageContent searchParams={searchParams} />;
}
