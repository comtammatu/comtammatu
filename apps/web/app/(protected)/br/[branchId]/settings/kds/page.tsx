import { notFound, redirect } from "next/navigation";
import { canManageBranchFloorSettings } from "@comtammatu/shared/auth";
import { APP_COPY_VI } from "@comtammatu/shared/labels";
import { AppPage } from "@/components/surface";
import { loadAuthState } from "@/_lib/auth";
import { resolveBranchSwitcherOptions } from "@/_lib/branch-scope";
import { messages } from "@lib/messages";
import { BranchManagementShell } from "../../_components/branch-management-chrome";
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

  const { supabase, claims, session } = await loadAuthState();

  if (!canManageBranchFloorSettings(claims.user_role)) {
    redirect(`/br/${branchId}/settings`);
  }

  const [branchRes, stationsRes, categoriesRes] = await Promise.all([
    supabase
      .from("branches")
      .select("id, name, is_active")
      .eq("id", branchId)
      .eq("tenant_id", claims.tenant_id)
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
  const branchOptions = await resolveBranchSwitcherOptions(supabase, claims);
  if (stationsRes.error) throw new Error("Không thể tải trạm KDS");
  if (categoriesRes.error) throw new Error("Không thể tải danh mục");

  const stations = mapStationRows(
    (stationsRes.data ?? []) as KdsStationQueryRow[],
  );
  const categories = categoriesRes.data as CategoryOption[];
  const displayName =
    session.user.user_metadata?.["full_name"] ??
    session.user.email ??
    claims.user_role;

  return (
    <BranchManagementShell
      user={{ name: displayName }}
      role={claims.user_role}
      branchId={branchId}
      branchName={branchRes.data.name}
      branchOptions={branchOptions}
      defaultPageTitle={messages.settings.pages.kdsTitle}
      description={messages.settings.pages.kdsDescription}
      breadcrumbSegments={[
        { label: APP_COPY_VI.branchCommand, href: `/br/${branchId}/dashboard` },
        {
          label: messages.settings.branch.hubTitle,
          href: `/br/${branchId}/settings`,
        },
        messages.settings.pages.kdsTitle,
      ]}
    >
      <AppPage width="wide">
        <StationsClient
          branches={[branchRes.data]}
          stations={stations}
          categories={categories}
        />
      </AppPage>
    </BranchManagementShell>
  );
}
