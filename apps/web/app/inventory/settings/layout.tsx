import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { buildAccessDeniedPath, PERMISSION_KEYS } from "@comtammatu/shared/auth";
import { Card, CardContent } from "@comtammatu/ui/components/card";
import { Badge } from "@comtammatu/ui/components/badge";
import { loadAuthState } from "../../_lib/auth";
import { currentUserHasAnyPermissionAny } from "../../_lib/permissions";
import { InventoryHeader } from "../_components/inventory-header";
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
    <>
      <InventoryHeader title={messages.inventory.settings.title} />
      <div className="flex-1 overflow-auto p-4">
      <div className="mx-auto max-w-7xl space-y-6">
      <Card>
        <CardContent className="space-y-4 px-4 py-4 sm:px-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                {messages.inventory.settings.eyebrow}
              </p>
              <h1 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
                {messages.inventory.settings.policyTitle}
              </h1>
              <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                {messages.inventory.settings.description}
              </p>
            </div>
            <Badge variant="outline" className="rounded-full">
              {messages.inventory.settings.policyLayer}
            </Badge>
          </div>
          <SettingsSectionNav role={claims.user_role} />
        </CardContent>
      </Card>
      <div>{children}</div>
    </div>
    </div>
    </>
  );
}
