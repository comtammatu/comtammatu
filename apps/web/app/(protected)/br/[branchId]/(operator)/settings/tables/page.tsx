import { notFound, redirect } from "next/navigation";
import { canManageBranchFloorSettings } from "@comtammatu/shared/auth";
import {
  BranchOperatorPage,
  BranchOperatorPanel,
} from "@lib/branch-operator/components/branch-operator-page";
import { loadAuthState } from "@/_lib/auth";
import { messages } from "@lib/messages";
import { TablesClient } from "@/(protected)/branch-settings/_shared/tables/tables-client";
import { shapeTableRows } from "./_lib/data";

export default async function BranchTablesSettingsPage({
  params,
}: {
  params: Promise<{ branchId: string }>;
}) {
  const { branchId: branchIdStr } = await params;
  const branchId = Number(branchIdStr);
  if (!Number.isInteger(branchId) || branchId <= 0) notFound();

  const { supabase, claims } = await loadAuthState();

  if (!canManageBranchFloorSettings(claims.user_role)) {
    redirect(`/br/${branchId}/settings`);
  }

  const [branchRes, zonesRes, tablesRes] = await Promise.all([
    supabase
      .from("branches")
      .select("id, name, is_active")
      .eq("id", branchId)
      .eq("tenant_id", claims.tenant_id)
      .eq("is_active", true)
      .maybeSingle(),
    supabase
      .from("branch_zones")
      .select("id, branch_id, name, sort_order")
      .eq("branch_id", branchId)
      .order("sort_order")
      .order("name"),
    supabase
      .from("tables")
      .select(
        "id, branch_id, zone_id, number, status, self_order_token, self_order_enabled, self_order_token_rotated_at, branch_zones(name)",
      )
      .eq("branch_id", branchId)
      .order("number"),
  ]);

  if (branchRes.error || !branchRes.data) notFound();
  if (zonesRes.error) throw new Error(messages.settings.branch.zonesLoadFailed);
  if (tablesRes.error) throw new Error(messages.settings.branch.tablesLoadFailed);

  const tables = shapeTableRows(tablesRes.data ?? []);

  return (
    <BranchOperatorPage
      title={messages.settings.pages.tablesTitle}
      description={messages.settings.branch.tablesDescription(
        branchRes.data.name,
      )}
      backHref={`/br/${branchId}/settings`}
    >
      <BranchOperatorPanel>
        <TablesClient
          branches={[branchRes.data]}
          zones={zonesRes.data ?? []}
          tables={tables}
          embedded
        />
      </BranchOperatorPanel>
    </BranchOperatorPage>
  );
}
