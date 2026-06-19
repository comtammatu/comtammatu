import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import {
  Armchair as IconArmchair,
  ChefHat as IconChefHat,
  Monitor as IconDeviceDesktop,
  Printer as IconPrinter,
  ReceiptText as IconReceiptText,
  SlidersHorizontal as IconSlidersHorizontal,
} from "lucide-react";
import { APP_COPY_VI } from "@comtammatu/shared/labels";
import { ItemGroup } from "@comtammatu/ui/components/item";
import { AppPage, AppSection } from "@/components/surface";
import { loadAuthState } from "@/_lib/auth";
import { messages } from "@lib/messages";
import { BranchActionItem } from "../_components/branch-action-item";
import { BranchManagementShell } from "../_components/branch-management-chrome";
import { AttendanceSettingsCard } from "./attendance-settings-card";

type Tile = {
  href: string;
  title: string;
  description: string;
  icon: ReactNode;
};

export default async function BranchSettingsHubPage({
  params,
}: {
  params: Promise<{ branchId: string }>;
}) {
  const { branchId: branchIdStr } = await params;
  const branchId = Number(branchIdStr);
  if (!Number.isInteger(branchId) || branchId <= 0) {
    notFound();
  }

  const { supabase, claims, session } = await loadAuthState();

  const { data: branch } = await supabase
    .from("branches")
    .select("id, name, branch_kind, is_active")
    .eq("id", branchId)
    .eq("tenant_id", claims.tenant_id)
    .maybeSingle();

  if (!branch || !branch.is_active) notFound();

  const copy = messages.settings.branch;
  const operationalTiles: Tile[] = [
    {
      href: `/br/${branchId}/settings/tables`,
      title: copy.tablesSetupTitle,
      description: copy.tablesSetupDescription,
      icon: <IconArmchair />,
    },
    {
      href: `/br/${branchId}/settings/pos`,
      title: copy.posSetupTitle,
      description: copy.posSetupDescription,
      icon: <IconDeviceDesktop />,
    },
    {
      href: `/br/${branchId}/settings/printers`,
      title: copy.printersSetupTitle,
      description: copy.printersSetupDescription,
      icon: <IconPrinter />,
    },
    {
      href: `/br/${branchId}/settings/kds`,
      title: copy.kdsSetupTitle,
      description: copy.kdsSetupDescription,
      icon: <IconChefHat />,
    },
    {
      href: `/br/${branchId}/settings/pos-sessions`,
      title: copy.commandPosSessionsTitle,
      description: copy.commandPosSessionsDescription,
      icon: <IconReceiptText />,
    },
    {
      href: `/br/${branchId}/menu-limits`,
      title: copy.menuLimitsTitle,
      description: copy.commandMenuLimitsDescription,
      icon: <IconSlidersHorizontal />,
    },
  ];
  const displayName =
    session.user.user_metadata?.["full_name"] ??
    session.user.email ??
    claims.user_role;

  return (
    <BranchManagementShell
      user={{ name: displayName }}
      role={claims.user_role}
      branchId={branchId}
      branchName={branch.name}
      defaultPageTitle={copy.hubTitle}
      description={copy.hubDescription(branch.name)}
      breadcrumbSegments={[
        { label: APP_COPY_VI.branchCommand, href: `/br/${branchId}/dashboard` },
        copy.hubTitle,
      ]}
    >
      <AppPage width="wide">
        <AppSection
          title={copy.setupLaneTitle}
          description={copy.setupLaneDescription}
        >
          <ItemGroup className="gap-2">
            <AttendanceSettingsCard
              branch={{
                id: branch.id,
                name: branch.name,
              }}
            />
            {operationalTiles.map((tile) => (
              <BranchActionItem
                key={`${tile.title}-${tile.href}`}
                href={tile.href}
                title={tile.title}
                description={tile.description}
                icon={tile.icon}
                ctaLabel={copy.openAction}
              />
            ))}
          </ItemGroup>
        </AppSection>
      </AppPage>
    </BranchManagementShell>
  );
}
