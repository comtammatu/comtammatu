import { redirect } from "next/navigation";
import { createClient } from "@comtammatu/database/supabase/server";
import { extractClaims } from "@comtammatu/shared/auth";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const claims = extractClaims(user.app_metadata);
  if (!claims) redirect("/login");

  if (
    claims.user_role === "branch_manager" ||
    claims.user_role === "area_manager"
  ) {
    redirect("/admin/settings/tables");
  }

  redirect("/admin/settings/branches");
}
