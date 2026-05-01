import { redirect } from "next/navigation";
import { loadAuthState } from "@/_lib/auth";
import { SYSTEM_SETTING_DEFAULTS } from "@comtammatu/shared/settings";
import { SettingsForm } from "./settings-form";

export default async function GeneralSettingsPage() {
  const { supabase, claims } = await loadAuthState();

  if (!["owner", "super_manager"].includes(claims.user_role)) {
    redirect("/admin/settings/tables");
  }

  const { data: rows } = await supabase
    .from("system_settings")
    .select("key, value");

  // Merge DB values over defaults
  const settings: Record<string, string> = { ...SYSTEM_SETTING_DEFAULTS };
  if (rows) {
    for (const row of rows) {
      settings[row.key] = row.value;
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Cài đặt chung</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Thuế, phí dịch vụ và thông tin cửa hàng
        </p>
      </div>
      <SettingsForm settings={settings} />
    </div>
  );
}
