import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft as IconArrowLeft } from "lucide-react";
import { canManageBranchFloorSettings } from "@comtammatu/shared/auth";
import { Button } from "@comtammatu/ui/components/button";
import { AppPage, AppPageHeader } from "@/components/surface";
import { loadAuthState } from "@/_lib/auth";
import { messages } from "@lib/messages";
import {
  StationsClient,
  type CategoryOption,
  type StationRow,
} from "@/(protected)/admin/settings/kds/stations-client";

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
          title={messages.settings.pages.kdsTitle}
          description={branchRes.data.name}
        />
      </div>

      <StationsClient
        branches={[branchRes.data]}
        stations={stations}
        categories={categories}
      />
    </AppPage>
  );
}
