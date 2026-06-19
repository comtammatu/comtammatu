import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import {
  buildAccessDeniedPath,
  PERMISSION_KEYS,
} from "@comtammatu/shared/auth";
import { AppPage, AppPageHeader, AppSection } from "@/components/surface";
import { loadAuthState } from "@/_lib/auth";
import { currentUserHasAnyPermissionAny } from "@/_lib/permissions";
import { SettingsSectionNav } from "./settings-section-nav";
import { messages } from "@lib/messages";

const INVENTORY_SETTINGS_PERMISSIONS = [
  PERMISSION_KEYS.SETTINGS_BRANCH,
  PERMISSION_KEYS.SETTINGS_TENANT,
  PERMISSION_KEYS.SETTINGS_INTEGRATIONS,
] as const;

export default async function InventorySettingsLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { claims } = await loadAuthState();
  const canOpenSettings = await currentUserHasAnyPermissionAny(
    INVENTORY_SETTINGS_PERMISSIONS,
  );
  if (!canOpenSettings) {
    redirect(
      buildAccessDeniedPath("insufficient-permission", {
        from: "/inventory/settings",
      }),
    );
  }

  return (
    <AppPage width="full">
      <AppPageHeader
        eyebrow={messages.inventory.settings.eyebrow}
        title={messages.inventory.settings.policyTitle}
        description={messages.inventory.settings.description}
        badge={{
          children: messages.inventory.settings.policyLayer,
          variant: "outline",
        }}
      />
      <AppSection contentClassName="px-4 py-4 sm:px-5">
        <SettingsSectionNav role={claims.user_role} />
      </AppSection>
      <div>{children}</div>
    </AppPage>
  );
}
