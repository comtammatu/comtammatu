import { loadAuthState } from "@/_lib/auth";
import { SYSTEM_SETTING_DEFAULTS } from "@comtammatu/shared/settings";
import { PaymentsForm } from "./payments-form";
import { SettingsPageFrame } from "../../settings-page-frame";
import { messages } from "@lib/messages";
import { ERRORS_VI } from "@comtammatu/shared/messages";
import { AppEmptyState } from "@/components/surface";

export default async function PaymentSettingsPage() {
  const { supabase } = await loadAuthState();

  const { data: rows, error } = await supabase
    .from("system_settings")
    .select("key, value");

  const settings: Record<string, string> = { ...SYSTEM_SETTING_DEFAULTS };
  if (rows) {
    for (const row of rows) {
      settings[row.key] = row.value;
    }
  }

  const sepayEnvConfigured = !!process.env.SEPAY_WEBHOOK_SECRET;

  return (
    <SettingsPageFrame
      title={messages.settings.pages.paymentsTitle}
      description={messages.settings.pages.paymentsDescription}
    >
      {error ? (
        <AppEmptyState
          mode="error"
          title={ERRORS_VI.loadFailed}
          description={ERRORS_VI.fallback}
        />
      ) : (
        <PaymentsForm
          settings={settings}
          sepayEnvConfigured={sepayEnvConfigured}
        />
      )}
    </SettingsPageFrame>
  );
}
