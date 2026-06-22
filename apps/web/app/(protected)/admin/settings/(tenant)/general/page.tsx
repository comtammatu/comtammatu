import { loadAuthState } from "@/_lib/auth";
import { SettingsForm } from "./settings-form";
import { SettingsPageFrame } from "../../settings-page-frame";
import { messages } from "@lib/messages";

export default async function GeneralSettingsPage() {
  const { supabase, claims } = await loadAuthState();

  const { data: tenant } = await supabase
    .from("tenants")
    .select("legal_name, tax_code, legal_address, representative")
    .eq("id", claims.tenant_id)
    .maybeSingle();

  const identity = {
    legal_name: tenant?.legal_name ?? "",
    tax_code: tenant?.tax_code ?? "",
    legal_address: tenant?.legal_address ?? "",
    representative: tenant?.representative ?? "",
  };

  return (
    <SettingsPageFrame
      title={messages.settings.pages.generalTitle}
      description={messages.settings.pages.generalDescription}
    >
      <SettingsForm identity={identity} />
    </SettingsPageFrame>
  );
}
