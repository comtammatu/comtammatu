import { redirect } from "next/navigation";
import { createClient } from "@comtammatu/database/supabase/server";
import { extractClaims } from "@comtammatu/shared/auth";
import { fetchAreas } from "./actions";
import { AreasManager } from "./areas-manager";
import type { Area } from "./areas-manager";

export default async function AreasPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const claims = user ? extractClaims(user.app_metadata) : null;

  if (!claims || !["owner", "super_manager"].includes(claims.user_role)) {
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
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Quản lý Khu vực</h2>
        <p className="text-sm text-muted-foreground">
          Nhóm các chi nhánh thành khu vực để phân quyền cho Quản lý vùng
          (area_manager).
        </p>
      </div>

      <AreasManager
        initialAreas={(areasResult.success ? areasResult.data : []) as Area[]}
        branches={(branches ?? []) as { id: number; name: string }[]}
      />
    </div>
  );
}
