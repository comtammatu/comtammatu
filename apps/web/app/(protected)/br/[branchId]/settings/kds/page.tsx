import { notFound, redirect } from "next/navigation";
import { canManageBranchFloorSettings } from "@comtammatu/shared/auth";
import { APP_COPY_VI } from "@comtammatu/shared/labels";
import { AppPage } from "@/components/surface";
import { loadAuthState } from "@/_lib/auth";
import { messages } from "@lib/messages";
import { BranchManagementShell } from "../../_components/branch-management-chrome";
import {
  StationsClient,
  type CategoryOption,
  type StationRow,
} from "@/(protected)/branch-settings/_shared/kds/stations-client";

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
      .eq("is_active", true)
      .order("sort_order"),
  ]);

  if (branchRes.error || !branchRes.data) notFound();
  if (stationsRes.error) throw new Error("Không thể tải trạm KDS");
  if (categoriesRes.error) throw new Error("Không thể tải danh mục");

  const stations: StationRow[] = (stationsRes.data ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    branch_id: s.branch_id,
    position: s.position,
    is_active: s.is_active,
    category_ids: s.kds_station_categories?.map((sc) => sc.category_id) ?? [],
  }));
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
      defaultPageTitle={messages.settings.pages.kdsTitle}
      description={branchRes.data.name}
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
