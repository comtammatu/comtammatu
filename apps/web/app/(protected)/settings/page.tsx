import {
  Building2 as IconBuilding2,
  CreditCard as IconCreditCard,
  Printer as IconPrinter,
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
  const copy = messages.settings.pages;

  if (!canManageTenantSettings && !canManagePrintSettings) {
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
        <AppSection
          title={copy.tenantSettingsTitle}
          description={copy.tenantSettingsDescription}
        >
          <LinkCardGrid>
            <AppLinkCard
              href="/settings/general"
              title={copy.generalTitle}
              description={copy.generalDescription}
              icon={<IconBuilding2 />}
            />
            <AppLinkCard
              href="/settings/payments"
              title={copy.paymentsTitle}
              description={copy.paymentsDescription}
              icon={<IconCreditCard />}
              tone="success"
            />
          </LinkCardGrid>
        </AppSection>
      ) : null}

      {canManagePrintSettings ? (
        <AppSection
          title={copy.printSettingsTitle}
          description={copy.printSettingsDescription}
        >
          <LinkCardGrid>
            <AppLinkCard
              href="/settings/printers"
              title={copy.printersTitle}
              description={copy.printersDescription}
              icon={<IconPrinter />}
              tone="info"
            />
          </LinkCardGrid>
        </AppSection>
      ) : null}
    </SettingsPageFrame>
  );
}
