import {
  Building2 as IconBuilding2,
  CreditCard as IconCreditCard,
  Printer as IconPrinter,
  ShieldCheck as IconShieldCheck,
} from "lucide-react";
import { redirect } from "next/navigation";
import {
  canManageBranchFloorSettings,
  canManageTenantStrategySettings,
} from "@comtammatu/shared/auth";
import { AppLinkCard, AppSection, LinkCardGrid } from "@/components/surface";
import { loadAuthState } from "@/_lib/auth";
import { messages } from "@lib/messages";
import { SettingsPageFrame } from "./settings-page-frame";

export default async function SettingsPage() {
  const { claims } = await loadAuthState();
  const canManageTenantSettings = canManageTenantStrategySettings(
    claims.user_role,
  );
  const canManagePrintSettings = canManageBranchFloorSettings(claims.user_role);
  const isOwner = claims.user_role === "owner";
  const copy = messages.settings.pages;

  if (!canManageTenantSettings && !canManagePrintSettings && !isOwner) {
    redirect("/access-denied?reason=insufficient-permission");
  }

  return (
    <SettingsPageFrame
      title={copy.settingsHomeTitle}
      description={copy.settingsHomeDescription}
      showSettingsHomeLink={false}
      width="wide"
    >
      {canManageTenantSettings ? (
        <AppSection title={copy.tenantSettingsTitle}>
          <LinkCardGrid className="lg:grid-cols-2 xl:grid-cols-2">
            <AppLinkCard
              href="/settings/general"
              title={copy.generalTitle}
              description={copy.generalDescription}
              icon={<IconBuilding2 />}
              ctaLabel={copy.openSettings}
            />
            <AppLinkCard
              href="/settings/payments"
              title={copy.paymentsTitle}
              description={copy.paymentsDescription}
              icon={<IconCreditCard />}
              tone="success"
              ctaLabel={copy.openSettings}
            />
          </LinkCardGrid>
        </AppSection>
      ) : null}

      {isOwner ? (
        <AppSection title={copy.accountSecurityTitle}>
          <LinkCardGrid className="lg:grid-cols-2 xl:grid-cols-2">
            <AppLinkCard
              href="/settings/security"
              title={copy.securityTitle}
              description={copy.securityDescription}
              icon={<IconShieldCheck />}
              ctaLabel={copy.openSettings}
            />
          </LinkCardGrid>
        </AppSection>
      ) : null}

      {canManagePrintSettings ? (
        <AppSection title={copy.printSettingsTitle}>
          <LinkCardGrid className="lg:grid-cols-2 xl:grid-cols-2">
            <AppLinkCard
              href="/settings/printers"
              title={copy.printersTitle}
              description={copy.printersDescription}
              icon={<IconPrinter />}
              tone="info"
              ctaLabel={copy.openSettings}
            />
          </LinkCardGrid>
        </AppSection>
      ) : null}
    </SettingsPageFrame>
  );
}
