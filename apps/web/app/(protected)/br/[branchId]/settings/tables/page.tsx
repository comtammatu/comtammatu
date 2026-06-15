import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft as IconArrowLeft } from "lucide-react";
import { canManageBranchFloorSettings } from "@comtammatu/shared/auth";
import { Button } from "@comtammatu/ui/components/button";
import { AppPage, AppPageHeader } from "@/components/surface";
import { loadAuthState } from "@/_lib/auth";
import { messages } from "@lib/messages";
import { TablesClient } from "@/(protected)/admin/settings/tables/tables-client";

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
      .select("id, branch_id, zone_id, number, status, branch_zones(name)")
      .eq("branch_id", branchId)
      .order("number"),
  ]);

  if (branchRes.error || !branchRes.data) notFound();
  if (zonesRes.error) throw new Error("Không thể tải khu vực");
  if (tablesRes.error) throw new Error("Không thể tải bàn");

  const tables = (tablesRes.data ?? []).map((t) => ({
    id: t.id,
    branch_id: t.branch_id,
    zone_id: t.zone_id,
    number: t.number,
    status: t.status,
    zone_name: t.branch_zones?.name ?? null,
  }));

  return (
    <AppPage width="default">
      <div className="flex items-center gap-3">
        <Button asChild variant="outline" size="sm" className="gap-1">
          <Link href={`/br/${branchId}/settings`}>
            <IconArrowLeft className="size-4" />
            {messages.settings.branch.settingsBack}
          </Link>
        </Button>
        <AppPageHeader
          className="min-w-0 flex-1"
          title={messages.settings.pages.tablesTitle}
          description={branchRes.data.name}
        />
      </div>

      <TablesClient
        branches={[branchRes.data]}
        zones={zonesRes.data ?? []}
        tables={tables}
      />
    </AppPage>
  );
}
