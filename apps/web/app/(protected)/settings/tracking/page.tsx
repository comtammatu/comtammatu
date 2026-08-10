import {
  Bell as IconBell,
  History as IconHistory,
  ShieldCheck as IconShieldCheck,
} from "lucide-react";
import { redirect } from "next/navigation";
import { AppLinkCard, AppSection, LinkCardGrid } from "@/components/surface";
import { loadAuthState } from "@/_lib/auth";
import { messages } from "@lib/messages";
import { SettingsPageFrame } from "../settings-page-frame";

/**
 * Owner hub for operational attention vs evidence vs permission audit.
 * Keeps the three stores separate; only routes into each surface.
 */
export default async function SettingsTrackingPage() {
  const { claims } = await loadAuthState();
  if (claims.user_role !== "owner") {
    redirect("/access-denied?reason=insufficient-permission");
  }

  const copy = messages.settings.tracking;

  return (
    <SettingsPageFrame
      title={copy.title}
      description={copy.description}
      width="wide"
    >
      <AppSection title={copy.title} description={copy.description}>
        <LinkCardGrid className="lg:grid-cols-3 xl:grid-cols-3">
          <AppLinkCard
            href="/notifications"
            title={copy.needActionTitle}
            description={copy.needActionDescription}
            icon={<IconBell />}
            tone="warning"
            ctaLabel={copy.needActionLink}
          />
          <AppLinkCard
            href="/settings/activity"
            title={copy.systemLogTitle}
            description={copy.systemLogDescription}
            icon={<IconHistory />}
            tone="info"
            ctaLabel={copy.systemLogLink}
          />
          <AppLinkCard
            href="/hr/staff/audit"
            title={copy.permissionLogTitle}
            description={copy.permissionLogDescription}
            icon={<IconShieldCheck />}
            ctaLabel={copy.permissionLogLink}
          />
        </LinkCardGrid>
      </AppSection>
    </SettingsPageFrame>
  );
}
