import { loadAuthState } from "@/_lib/auth";
import { SettingsForm } from "./settings-form";
import { SettingsPageFrame } from "../../settings-page-frame";
import { messages } from "@lib/messages";
import { ERRORS_VI } from "@comtammatu/shared/messages";
import { AppEmptyState } from "@/components/surface";

export default async function GeneralSettingsPage() {
  const { supabase, claims } = await loadAuthState();

  const [
    { data: tenant, error: tenantError },
    { data: invoiceProfiles, error: invoiceProfileError },
  ] = await Promise.all([
    supabase
      .from("tenants")
      .select("legal_name, tax_code, legal_address, representative")
      .eq("id", claims.tenant_id)
      .maybeSingle(),
    supabase
      .from("invoice_profiles")
      .select(
        "id, version, template_code, invoice_series, status, seller_tax_code",
      )
      .eq("tenant_id", claims.tenant_id)
      .in("status", ["draft", "active"])
      .order("version", { ascending: false }),
  ]);

  const identity = tenant
    ? {
        legal_name: tenant.legal_name ?? "",
        tax_code: tenant.tax_code ?? "",
        legal_address: tenant.legal_address ?? "",
        representative: tenant.representative ?? "",
      }
    : null;
  const invoiceProfile =
    invoiceProfiles?.find((profile) => profile.status === "active") ??
    invoiceProfiles?.[0] ??
    null;

  return (
    <SettingsPageFrame
      title={messages.settings.pages.generalTitle}
      description={messages.settings.pages.generalDescription}
    >
      {tenantError || invoiceProfileError || !identity ? (
        <AppEmptyState
          mode="error"
          title={ERRORS_VI.loadFailed}
          description={ERRORS_VI.fallback}
        />
      ) : (
        <SettingsForm identity={identity} invoiceProfile={invoiceProfile} />
      )}
    </SettingsPageFrame>
  );
}
