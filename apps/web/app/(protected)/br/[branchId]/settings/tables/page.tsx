import { notFound, redirect } from "next/navigation";
import { canManageBranchFloorSettings } from "@comtammatu/shared/auth";
import { APP_COPY_VI } from "@comtammatu/shared/labels";
import { AppPage } from "@/components/surface";
import { loadAuthState } from "@/_lib/auth";
import { resolveBranchSwitcherOptions } from "@/_lib/branch-scope";
import { messages } from "@lib/messages";
import { BranchManagementShell } from "../../_components/branch-management-chrome";
import { TablesClient } from "@/(protected)/branch-settings/_shared/tables/tables-client";
import { resolveDisplayName, shapeTableRows } from "./_lib/data";

export default async function BranchTablesSettingsPage({
  params,
}: {
  params: Promise<{ branchId: string }>;
}) {
  const { branchId: branchIdStr } = await params;
  const branchId = Number(branchIdStr);
  if (!Number.isInteger(branchId) || branchId <= 0) notFound();

  const { supabase, claims, session } = await loadAuthState();

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
      .select("id, branch_id, zone_id, number, status, branch_zones(name)")
      .eq("branch_id", branchId)
      .order("number"),
  ]);

  if (branchRes.error || !branchRes.data) notFound();
  const branchOptions = await resolveBranchSwitcherOptions(supabase, claims);
  if (zonesRes.error) throw new Error("Không thể tải khu vực");
  if (tablesRes.error) throw new Error("Không thể tải bàn");

  const tables = shapeTableRows(tablesRes.data ?? []);
  const displayName = resolveDisplayName({
    fullName: session.user.user_metadata?.["full_name"],
    email: session.user.email,
    fallback: claims.user_role,
  });

  return (
    <BranchManagementShell
      user={{ name: displayName }}
      role={claims.user_role}
      branchId={branchId}
      branchName={branchRes.data.name}
      branchOptions={branchOptions}
      defaultPageTitle={messages.settings.pages.tablesTitle}
      description={messages.settings.branch.tablesDescription(
        branchRes.data.name,
      )}
      breadcrumbSegments={[
        { label: APP_COPY_VI.branchCommand, href: `/br/${branchId}/dashboard` },
        {
          label: messages.settings.branch.hubTitle,
          href: `/br/${branchId}/settings`,
        },
        messages.settings.pages.tablesTitle,
      ]}
    >
      <AppPage width="wide">
        <TablesClient
          branches={[branchRes.data]}
          zones={zonesRes.data ?? []}
          tables={tables}
        />
      </AppPage>
    </BranchManagementShell>
  );
}
