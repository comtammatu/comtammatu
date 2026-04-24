import { redirect } from "next/navigation";
import { loadAuthState } from "@/_lib/auth";
import { fetchAreas } from "./actions";
import { AreasManager } from "./areas-manager";
import type { Area } from "./areas-manager";

export default async function AreasPage() {
  const { supabase, claims } = await loadAuthState();

  if (!["owner", "super_manager"].includes(claims.user_role)) {
    redirect("/admin/settings/tables");
  }

  const areasResult = await fetchAreas();

  // Fetch all branches for the assignment dropdown
  const { data: branches } = await supabase
    .from("branches")
    .select("id, name")
    .eq("tenant_id", claims.tenant_id)
    .eq("is_active", true)
    .order("name");

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Khu vực</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Nhóm các chi nhánh thành khu vực để phân quyền cho Quản lý vùng
          (area_manager).
        </p>
      </div>

      <AreasManager
        areas={(areasResult.success ? areasResult.data : []) as Area[]}
        branches={(branches ?? []) as { id: number; name: string }[]}
      />
    </div>
  );
}
