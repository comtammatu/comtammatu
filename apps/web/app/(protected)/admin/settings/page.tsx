import { redirect } from "next/navigation";
import { loadAuthState } from "@/_lib/auth";

export default async function SettingsPage() {
  const { claims } = await loadAuthState();

  if (
    claims.user_role === "branch_manager" ||
    claims.user_role === "area_manager"
  ) {
    redirect("/admin/settings/tables");
  }

  redirect("/admin/settings/branches");
}
