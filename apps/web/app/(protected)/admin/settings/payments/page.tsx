import { redirect } from "next/navigation";
import { loadAuthState } from "@/_lib/auth";
import { SYSTEM_SETTING_DEFAULTS } from "@comtammatu/shared/settings";
import { PaymentsForm } from "./payments-form";
import { SettingsPageShell } from "../settings-page-shell";
import { messages } from "@lib/messages";

export default async function PaymentSettingsPage() {
  const { supabase, claims } = await loadAuthState();

  if (!["owner", "super_manager"].includes(claims.user_role)) {
    redirect("/admin/settings/tables");
  }

  const { data: rows } = await supabase
    .from("system_settings")
    .select("key, value");

  const settings: Record<string, string> = { ...SYSTEM_SETTING_DEFAULTS };
  if (rows) {
    for (const row of rows) {
      settings[row.key] = row.value;
    }
  }

  const vietqrEnvConfigured =
    !!process.env.VIETQR_API_KEY &&
    !!process.env.VIETQR_ACCOUNT_NO &&
    !!process.env.VIETQR_BANK_ID;

  const momoEnvConfigured =
    !!process.env.MOMO_PARTNER_CODE &&
    !!process.env.MOMO_ACCESS_KEY &&
    !!process.env.MOMO_SECRET_KEY;

  return (
    <SettingsPageShell
      title={messages.settings.pages.paymentsTitle}
      description={messages.settings.pages.paymentsDescription}
    >
      <PaymentsForm
        settings={settings}
        vietqrEnvConfigured={vietqrEnvConfigured}
        momoEnvConfigured={momoEnvConfigured}
      />
    </SettingsPageShell>
  );
}
