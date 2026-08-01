import {
  Activity as IconActivity,
  FileText as IconFileText,
  Printer as IconPrinter,
} from "lucide-react";
import { redirect } from "next/navigation";
import {
  canManageBranchFloorSettings,
  TENANT_LEVEL_ROLES,
} from "@comtammatu/shared/auth";
import { AppLinkCard, LinkCardGrid } from "@/components/surface";
import { loadAuthState } from "@/_lib/auth";
import { SettingsPageFrame } from "../settings-page-frame";
import { messages } from "@lib/messages";

const copy = messages.settings.pages;

export default async function PrintersPage() {
  const { claims } = await loadAuthState();

  if (!canManageBranchFloorSettings(claims.user_role)) {
    redirect("/settings");
  }

  const isTenantLevel = (TENANT_LEVEL_ROLES as readonly string[]).includes(
    claims.user_role,
  );

  return (
    <SettingsPageFrame
      title={copy.printersTitle}
      description={copy.printLandingDescription}
      width="wide"
    >
      <LinkCardGrid className="xl:grid-cols-3">
        <AppLinkCard
          href="/branches"
          title={copy.printBranchConfigTitle}
          description={copy.printersDescription}
          icon={<IconPrinter />}
          ctaLabel={copy.openSettings}
        />
        {isTenantLevel ? (
          <AppLinkCard
            href="/settings/printers/templates"
            title={copy.printTemplatesTitle}
            description={copy.printTemplatesDescription}
            icon={<IconFileText />}
            ctaLabel={copy.openSettings}
          />
        ) : null}
        <AppLinkCard
          href="/settings/printers/jobs"
          title={copy.printJobsTitle}
          description={copy.printJobsDescription}
          icon={<IconActivity />}
          ctaLabel={copy.openSettings}
        />
      </LinkCardGrid>
    </SettingsPageFrame>
  );
}
