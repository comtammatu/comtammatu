import { redirect } from "next/navigation";
import { loadAuthState } from "@/_lib/auth";
import { fetchAreas } from "./actions";
import { AreasManager } from "./areas-manager";
import type { Area } from "./areas-manager";
import { SettingsPageShell } from "../settings-page-shell";

import { TABLE_VI } from "@comtammatu/shared/messages";
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
    <SettingsPageShell
      title={TABLE_VI.area}
      description="Nhóm các chi nhánh thành khu vực để phân quyền cho Quản lý vùng (area_manager)."
    >
      <AreasManager
        areas={(areasResult.success ? areasResult.data : []) as Area[]}
        branches={(branches ?? []) as { id: number; name: string }[]}
      />
    </SettingsPageShell>
  );
}
