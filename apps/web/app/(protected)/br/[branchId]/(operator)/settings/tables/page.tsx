import { notFound, redirect } from "next/navigation";
import { canManageBranchFloorSettings } from "@comtammatu/shared/auth";
import { BranchOperatorPage } from "@lib/branch-operator/components/branch-operator-page";
import { loadAuthState } from "@/_lib/auth";
import { messages } from "@lib/messages";
import { TablesClient } from "@/(protected)/branch-settings/_shared/tables/tables-client";
import { shapeTableRows } from "./_lib/data";

export default async function BranchTablesSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ branchId: string }>;
  searchParams: Promise<{ view?: string | string[] }>;
}) {
  const { branchId: branchIdStr } = await params;
  const branchId = Number(branchIdStr);
  if (!Number.isInteger(branchId) || branchId <= 0) notFound();

  const [{ view: rawView }, { supabase, claims }] = await Promise.all([
    searchParams,
    loadAuthState(),
  ]);
  const activeView = rawView === "tables" ? "tables" : "zones";

  if (!canManageBranchFloorSettings(claims.user_role)) {
    redirect(`/br/${branchId}/settings`);
  }

  const [branchRes, zonesRes, tablesRes, zoneCountRes, tableCountRes] =
    await Promise.all([
      supabase
        .from("branches")
        .select("id, name, is_active")
        .eq("id", branchId)
        .eq("tenant_id", claims.tenant_id)
        .eq("branch_kind", "branch")
        .eq("is_active", true)
        .maybeSingle(),
      supabase
        .from("branch_zones")
        .select("id, branch_id, name, sort_order")
        .eq("branch_id", branchId)
        .order("sort_order")
        .order("name"),
      activeView === "tables"
        ? supabase
            .from("tables")
            .select(
              "id, branch_id, zone_id, number, status, self_order_token, self_order_enabled, self_order_token_rotated_at, branch_zones(name)",
            )
            .eq("branch_id", branchId)
            .order("number")
        : Promise.resolve({ data: [], error: null }),
      supabase
        .from("branch_zones")
        .select("id", { count: "exact", head: true })
        .eq("branch_id", branchId),
      supabase
        .from("tables")
        .select("id", { count: "exact", head: true })
        .eq("branch_id", branchId),
    ]);

  if (branchRes.error || !branchRes.data) notFound();
  if (zonesRes.error) throw new Error(messages.settings.branch.zonesLoadFailed);
  if (tablesRes.error)
    throw new Error(messages.settings.branch.tablesLoadFailed);
  if (zoneCountRes.error)
    throw new Error(messages.settings.branch.zonesLoadFailed);
  if (tableCountRes.error)
    throw new Error(messages.settings.branch.tablesLoadFailed);

  const tables = shapeTableRows(tablesRes.data ?? []);

  return (
    <BranchOperatorPage
      title={messages.settings.pages.tablesTitle}
      description={
        activeView === "tables"
          ? messages.settings.tables.tableListDescription(branchRes.data.name)
          : messages.settings.tables.zonesDescription(branchRes.data.name)
      }
      backHref={`/br/${branchId}/settings`}
      backLabel={messages.settings.branch.settingsBack}
    >
      <TablesClient
        branch={branchRes.data}
        zones={zonesRes.data ?? []}
        tables={tables}
        activeView={activeView}
        zoneCount={zoneCountRes.count ?? 0}
        tableCount={tableCountRes.count ?? 0}
        embedded
      />
    </BranchOperatorPage>
  );
}
