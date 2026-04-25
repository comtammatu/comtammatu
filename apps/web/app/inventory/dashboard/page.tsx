import { redirect } from "next/navigation";
import { PERMISSION_KEYS, STAFF_ROLES } from "@comtammatu/shared/auth";
import { getAuthContextWithAnyPermission } from "@/inventory/_lib/auth";
import {
  INVENTORY_FEATURE_FLAGS,
  isFeatureEnabledForBranch,
} from "@/inventory/_lib/feature-flags";
import { resolveRequestedBranchId } from "@/inventory/_lib/inventory-scope";
import { getInventoryDashboard } from "@/inventory/dashboard-actions";
import { DashboardClientV2 } from "./dashboard-client-v2";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ branchId?: string }>;
}

export default async function InventoryDashboardV2Page({
  searchParams,
}: PageProps) {
  const params = await searchParams;
  const branchId = await resolveRequestedBranchId(params.branchId);

  const ctx = await getAuthContextWithAnyPermission(
    STAFF_ROLES,
    [
      PERMISSION_KEYS.INVENTORY_READ,
      PERMISSION_KEYS.REPORTS_VIEW_BRANCH,
      PERMISSION_KEYS.REPORTS_VIEW_TENANT,
    ],
  );
  if (!ctx) redirect("/");
  const { supabase, claims } = ctx;

  if (branchId === null) {
    // Pick first accessible branch as default
    const { data: branches } = await supabase
      .from("branches")
      .select("id")
      .eq("tenant_id", claims.tenant_id)
      .eq("is_active", true)
      .order("id", { ascending: true })
      .limit(1);
    const fallback = branches?.[0]?.id;
    if (fallback) {
      redirect(`/inventory/dashboard?branchId=${fallback}`);
    }
    redirect("/inventory");
  }

  // Feature flag gate
  const flagEnabled = await isFeatureEnabledForBranch(
    supabase,
    branchId,
    INVENTORY_FEATURE_FLAGS.S12_DASHBOARD_V2,
  );
  if (!flagEnabled) {
    redirect(`/inventory?branchId=${branchId}&error=dashboard_v2_not_enabled`);
  }

  const dashboardRes = await getInventoryDashboard(branchId);
  if (!dashboardRes.success || !dashboardRes.data) {
    redirect(`/inventory?error=dashboard_fetch_failed`);
  }

  // Branch name for header
  const { data: branchRow } = await supabase
    .from("branches")
    .select("name, branch_kind")
    .eq("id", branchId)
    .eq("tenant_id", claims.tenant_id)
    .maybeSingle();

  return (
    <DashboardClientV2
      branchId={branchId}
      branchName={branchRow?.name ?? `CN #${branchId}`}
      branchKind={branchRow?.branch_kind ?? "branch"}
      dashboard={dashboardRes.data}
    />
  );
}
