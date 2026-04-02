import { createClient } from "@comtammatu/database/supabase/server";
import { SYSTEM_SETTING_DEFAULTS } from "@comtammatu/shared/settings";
import { SettingsForm } from "./settings-form";

export default async function GeneralSettingsPage() {
  const supabase = await createClient();

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
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Cài đặt chung</h2>
        <p className="text-sm text-muted-foreground">
          Thuế, phí dịch vụ và thông tin cửa hàng
        </p>
      </div>
      <SettingsForm settings={settings} />
    </div>
  );
}
