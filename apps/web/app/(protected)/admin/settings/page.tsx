import { redirect } from "next/navigation";
import { loadAuthState } from "@/_lib/auth";

export default async function SettingsPage() {
  const { claims } = await loadAuthState();

  // HKD lean: managers (former branch_manager/area_manager) land on the floor
  // settings (tables); owner lands on the branches overview.
  if (claims.user_role === "manager") {
    redirect("/admin/settings/tables");
  }

  redirect("/admin/settings/branches");
}
