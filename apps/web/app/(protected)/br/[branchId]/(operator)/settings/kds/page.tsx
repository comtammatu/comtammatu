import { notFound, redirect } from "next/navigation";
import { canManageBranchFloorSettings } from "@comtammatu/shared/auth";
import { BranchOperatorPage } from "@lib/branch-operator/components/branch-operator-page";
import { loadAuthState } from "@/_lib/auth";
import { messages } from "@lib/messages";
import { StationsClient } from "@/(protected)/branch-settings/_shared/kds/stations-client";
import {
  mapStationRows,
  type CategoryOption,
  type KdsStationQueryRow,
} from "./_lib/data";

export default async function BranchKdsSettingsPage({
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

  const [branchRes, stationsRes, categoriesRes] = await Promise.all([
    supabase
      .from("branches")
      .select("id, name, is_active")
      .eq("id", branchId)
      .eq("tenant_id", claims.tenant_id)
      .eq("branch_kind", "branch")
      .eq("is_active", true)
      .maybeSingle(),
    supabase
      .from("kds_stations")
      .select(
        `
        id,
        name,
        branch_id,
        position,
        is_active,
        kds_station_categories (
          id,
          category_id
        )
      `,
      )
      .eq("branch_id", branchId)
      .order("position"),
    supabase
      .from("menu_categories")
      .select("id, name, type, sort_order")
      // menu_categories is tenant-scoped (no branch_id); scope explicitly to
      // match sibling queries on this page instead of relying solely on RLS.
      .eq("tenant_id", claims.tenant_id)
      .eq("is_active", true)
      .order("sort_order"),
  ]);

  if (branchRes.error || !branchRes.data) notFound();
  if (stationsRes.error)
    throw new Error(messages.settings.branch.kdsStationsLoadFailed);
  if (categoriesRes.error)
    throw new Error(messages.settings.branch.categoriesLoadFailed);

  const stations = mapStationRows(
    (stationsRes.data ?? []) as KdsStationQueryRow[],
  );
  const categories = categoriesRes.data as CategoryOption[];

  return (
    <BranchOperatorPage
      title={messages.settings.pages.kdsTitle}
      description={`${branchRes.data.name} · ${messages.settings.branch.kdsSetupDescription}`}
      backHref={`/br/${branchId}/settings`}
      backLabel={messages.settings.branch.settingsBack}
    >
      <StationsClient
        branches={[branchRes.data]}
        stations={stations}
        categories={categories}
        embedded
      />
    </BranchOperatorPage>
  );
}
