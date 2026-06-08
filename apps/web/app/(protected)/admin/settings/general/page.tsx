import { redirect } from "next/navigation";
import { loadAuthState } from "@/_lib/auth";
import { SYSTEM_SETTING_DEFAULTS } from "@comtammatu/shared/settings";
import { SettingsForm } from "./settings-form";
import { SettingsPageShell } from "../settings-page-shell";
import { messages } from "@lib/messages";

export default async function GeneralSettingsPage() {
  const { supabase, claims } = await loadAuthState();

  if (!["owner", "manager"].includes(claims.user_role)) {
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
    <SettingsPageShell
      title={messages.settings.pages.generalTitle}
      description={messages.settings.pages.generalDescription}
    >
      <SettingsForm settings={settings} />
    </SettingsPageShell>
  );
}
