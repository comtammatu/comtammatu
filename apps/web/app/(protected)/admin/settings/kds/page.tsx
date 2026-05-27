import { redirect } from "next/navigation";
import { canManageBranchFloorSettings } from "@comtammatu/shared/auth";
import { loadAuthState } from "@/_lib/auth";
import { StationsClient } from "./stations-client";
import type { StationRow, CategoryOption } from "./stations-client";
import { SettingsPageShell } from "../settings-page-shell";
import { messages } from "@lib/messages";

export default async function KdsSettingsPage() {
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

  let stationsQuery = supabase
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
    .order("position");

  const categoriesQuery = supabase
    .from("menu_categories")
    .select("id, name, type, sort_order")
    .eq("is_active", true)
    .order("sort_order");

  if (branchFilter) {
    branchesQuery = branchesQuery.eq("id", branchFilter);
    stationsQuery = stationsQuery.eq("branch_id", branchFilter);
  }

  const [branchesRes, stationsRes, categoriesRes] = await Promise.all([
    branchesQuery,
    stationsQuery,
    categoriesQuery,
  ]);

  if (branchesRes.error) throw new Error("Không thể tải chi nhánh");
  if (stationsRes.error) throw new Error("Không thể tải trạm KDS");
  if (categoriesRes.error) throw new Error("Không thể tải danh mục");

  const branches = branchesRes.data;
  const rawStations = stationsRes.data ?? [];
  const stations: StationRow[] = rawStations.map((s) => ({
    id: s.id,
    name: s.name,
    branch_id: s.branch_id,
    position: s.position,
    is_active: s.is_active,
    category_ids: s.kds_station_categories?.map((sc) => sc.category_id) ?? [],
  }));
  const categories = categoriesRes.data as CategoryOption[];

  return (
    <SettingsPageShell
      title={messages.settings.pages.kdsTitle}
      description={messages.settings.pages.kdsDescription}
    >
      <StationsClient
        branches={branches}
        stations={stations}
        categories={categories}
      />
    </SettingsPageShell>
  );
}
