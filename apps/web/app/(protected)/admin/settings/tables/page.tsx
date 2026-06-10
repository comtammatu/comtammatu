import { redirect } from "next/navigation";
import { canManageBranchFloorSettings } from "@comtammatu/shared/auth";
import { loadAuthState } from "@/_lib/auth";
import { TablesClient } from "./tables-client";
import { SettingsPageShell } from "../settings-page-shell";
import { messages } from "@lib/messages";

export default async function TablesPage() {
  const { supabase, claims } = await loadAuthState();

  if (!canManageBranchFloorSettings(claims.user_role)) {
    redirect("/admin/settings");
  }

  // branch_manager: only their branch. Others: all branches.
  const branchFilter = claims.branch_id;

  let branchesQuery = supabase
    .from("branches")
    .select("id, name, is_active")
    .eq("is_active", true)
    .order("name");

  let zonesQuery = supabase
    .from("branch_zones")
    .select("id, branch_id, name, sort_order")
    .order("sort_order")
    .order("name");

  let tablesQuery = supabase
    .from("tables")
    .select("id, branch_id, zone_id, number, status, branch_zones(name)")
    .order("number");

  if (branchFilter) {
    branchesQuery = branchesQuery.eq("id", branchFilter);
    zonesQuery = zonesQuery.eq("branch_id", branchFilter);
    tablesQuery = tablesQuery.eq("branch_id", branchFilter);
  }

  const [branchesRes, zonesRes, tablesRes] = await Promise.all([
    branchesQuery,
    zonesQuery,
    tablesQuery,
  ]);

  if (branchesRes.error) throw new Error("Không thể tải chi nhánh");
  if (zonesRes.error) throw new Error("Không thể tải khu vực");
  if (tablesRes.error) throw new Error("Không thể tải bàn");

  const branches = branchesRes.data;
  const zones = zonesRes.data;
  const tables = tablesRes.data.map((t) => ({
    id: t.id,
    branch_id: t.branch_id,
    zone_id: t.zone_id,
    number: t.number,
    status: t.status,
    zone_name: t.branch_zones?.name ?? null,
  }));

  return (
    <SettingsPageShell
      title={messages.settings.pages.tablesTitle}
      description={messages.settings.pages.tablesDescription}
    >
      <TablesClient branches={branches} zones={zones} tables={tables} />
    </SettingsPageShell>
  );
}
