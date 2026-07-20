import { loadAuthState } from "@/_lib/auth";
import { SettingsForm } from "./settings-form";
import { SettingsPageFrame } from "../../settings-page-frame";
import { messages } from "@lib/messages";
import { ERRORS_VI } from "@comtammatu/shared/messages";
import { AppEmptyState } from "@/components/surface";

export default async function GeneralSettingsPage() {
  const { supabase, claims } = await loadAuthState();

  const { data: tenant, error } = await supabase
    .from("tenants")
    .select("legal_name, tax_code, legal_address, representative")
    .eq("id", claims.tenant_id)
    .maybeSingle();

  const identity = tenant
    ? {
        legal_name: tenant.legal_name ?? "",
        tax_code: tenant.tax_code ?? "",
        legal_address: tenant.legal_address ?? "",
        representative: tenant.representative ?? "",
      }
    : null;

  return (
    <SettingsPageFrame
      title={messages.settings.pages.generalTitle}
      description={messages.settings.pages.generalDescription}
    >
      {error || !identity ? (
        <AppEmptyState
          mode="error"
          title={ERRORS_VI.loadFailed}
          description={ERRORS_VI.fallback}
        />
      ) : (
        <SettingsForm identity={identity} />
      )}
    </SettingsPageFrame>
  );
}
