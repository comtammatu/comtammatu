import { notFound } from "next/navigation";
import type { ElementType } from "react";
import {
  Armchair as IconArmchair,
  ChefHat as IconChefHat,
  Monitor as IconDeviceDesktop,
  Printer as IconPrinter,
  Shield as IconShield,
  Volume2 as IconVolume2,
} from "lucide-react";
import {
  canAccess,
  canManageTenantStrategySettings,
  resolveBranchToolsGroups,
  type BranchKind,
} from "@comtammatu/shared/auth";
import { AppEmptyState } from "@/components/surface";
import {
  BranchOperatorActionSection,
  BranchOperatorPage,
} from "@lib/branch-operator/components/branch-operator-page";
import { loadAuthState } from "@/_lib/auth";
import { messages } from "@lib/messages";
import { resolveOperatorTileIcon } from "../operator-tile-icons";
import { buildSettingsLinks } from "./_lib/settings-links";

type SettingsTile = {
  key: string;
  href: string;
  icon: ElementType;
  title: string;
  description?: string;
};

export default async function BranchSettingsPage({
  params,
}: {
  params: Promise<{ branchId: string }>;
}) {
  const { branchId: branchIdStr } = await params;
  const branchId = Number(branchIdStr);
  if (!Number.isInteger(branchId) || branchId <= 0) {
    notFound();
  }

  const { supabase, claims } = await loadAuthState();

  const { data: branch } = await supabase
    .from("branches")
    .select("id, name, branch_kind, is_active")
    .eq("id", branchId)
    .eq("tenant_id", claims.tenant_id)
    .maybeSingle();

  if (!branch || !branch.is_active) notFound();

  const copy = messages.settings.branch;
  const role = claims.user_role;
  const toolGroups = resolveBranchToolsGroups(
    role,
    branchId,
    branch.branch_kind as BranchKind,
  );

  const links = buildSettingsLinks(branchId, copy, {
    tables: IconArmchair,
    pos: IconDeviceDesktop,
    printers: IconPrinter,
    kds: IconChefHat,
    audio: IconVolume2,
  });

  const setupLinks: SettingsTile[] = links
    .filter((link) => canAccess(role, link.moduleKey))
    .map((link) => ({
      key: `${link.moduleKey}-${link.href}`,
      href: link.href,
      icon: link.icon,
      title: link.title,
      description: link.description || undefined,
    }));

  if (canManageTenantStrategySettings(role)) {
    setupLinks.push({
      key: "network",
      href: `/br/${branchId}/settings/network`,
      icon: IconShield,
      title: copy.networkSetupTitle,
      description: copy.networkSetupDescription,
    });
  }

  const hasContent =
    toolGroups.some((group) => group.tiles.length > 0) ||
    setupLinks.length > 0;

  return (
    <BranchOperatorPage title={copy.landingTitle}>
      {hasContent ? (
        <>
          {toolGroups.map((group) => (
            <BranchOperatorActionSection
              key={group.id}
              title={group.title}
              presentation="plain"
              mobileColumns={2}
              columns={2}
              wideColumns
              links={group.tiles.map((tile) => ({
                key: `${group.id}-${tile.moduleKey}-${tile.href}`,
                href: tile.href,
                icon: resolveOperatorTileIcon(tile.icon),
                title: tile.label,
              }))}
            />
          ))}
          {setupLinks.length > 0 ? (
            <BranchOperatorActionSection
              title={copy.setupSectionTitle}
              presentation="plain"
              mobileColumns={2}
              columns={2}
              wideColumns
              links={setupLinks}
            />
          ) : null}
        </>
      ) : (
        <AppEmptyState
          mode="no-access"
          title={copy.landingEmptyTitle}
          description={copy.landingEmptyDescription}
        />
      )}
    </BranchOperatorPage>
  );
}
