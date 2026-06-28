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

export default async function PrintHubPage() {
  const { claims } = await loadAuthState();

  if (!canManageBranchFloorSettings(claims.user_role)) {
    redirect("/admin/settings");
  }

  const isTenantLevel = (TENANT_LEVEL_ROLES as readonly string[]).includes(
    claims.user_role,
  );

  return (
    <SettingsPageFrame
      title={copy.printersTitle}
      description={copy.printHubDescription}
    >
      <LinkCardGrid>
        <AppLinkCard
          href="/branches"
          title={copy.printBranchConfigTitle}
          description={copy.printersDescription}
          icon={<IconPrinter />}
        />
        {isTenantLevel ? (
          <AppLinkCard
            href="/admin/settings/printers/templates"
            title={copy.printTemplatesTitle}
            description={copy.printTemplatesDescription}
            icon={<IconFileText />}
          />
        ) : null}
        <AppLinkCard
          href="/admin/settings/printers/jobs"
          title={copy.printJobsTitle}
          description={copy.printJobsDescription}
          icon={<IconActivity />}
        />
      </LinkCardGrid>
    </SettingsPageFrame>
  );
}
