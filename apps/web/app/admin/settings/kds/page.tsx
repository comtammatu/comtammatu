import { redirect } from "next/navigation";
import { createClient } from "@comtammatu/database/supabase/server";
import { extractClaims } from "@comtammatu/shared/auth";
import { StationsClient } from "./stations-client";
import type { StationRow, CategoryOption } from "./stations-client";

// KDS tables not in generated types yet. Remove `as any` cast after `pnpm db:types`.

export default async function KdsSettingsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const claims = extractClaims(user.app_metadata);
  if (!claims) redirect("/login");

  // branch_manager: only their branch. Others: all branches.
  const branchFilter = claims.branch_id;

  let branchesQuery = supabase
    .from("branches")
    .select("id, name, is_active")
    .eq("is_active", true)
    .order("name");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- kds_stations not in generated types yet
  const sb = supabase as any;
  let stationsQuery = sb
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

  if (branchesRes.error) throw new Error("Khong the tai chi nhanh");
  if (stationsRes.error) throw new Error("Khong the tai tram KDS");
  if (categoriesRes.error) throw new Error("Khong the tai danh muc");

  const branches = branchesRes.data;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawStations = (stationsRes.data ?? []) as any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stations: StationRow[] = rawStations.map((s: any) => ({
    id: s.id as number,
    name: s.name as string,
    branch_id: s.branch_id as number,
    position: s.position as number,
    is_active: s.is_active as boolean,
    category_ids:
      (
        s.kds_station_categories as { id: number; category_id: number }[] | null
      )?.map((sc: { category_id: number }) => sc.category_id) ?? [],
  }));
  const categories = categoriesRes.data as CategoryOption[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Trạm bếp (KDS)</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Quản lý trạm hiển thị bếp và gán danh mục món ăn
        </p>
      </div>

      <StationsClient
        branches={branches}
        stations={stations}
        categories={categories}
      />
    </div>
  );
}
