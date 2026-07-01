import { notFound } from "next/navigation";
import {
  Armchair as IconArmchair,
  ChefHat as IconChefHat,
  Monitor as IconDeviceDesktop,
  Printer as IconPrinter,
} from "lucide-react";
import { canAccess } from "@comtammatu/shared/auth";
import {
  AppEmptyState,
} from "@/components/surface";
import {
  EmployeeActionSection,
  EmployeePage,
} from "@/(protected)/employee/components/employee-page";
import { loadAuthState } from "@/_lib/auth";
import { messages } from "@lib/messages";
import { buildHubTiles } from "./_lib/hub-tiles";

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

  const tiles = buildHubTiles(branchId, copy, {
    tables: IconArmchair,
    pos: IconDeviceDesktop,
    printers: IconPrinter,
    kds: IconChefHat,
  });
  const visibleTiles = tiles.filter((tile) => canAccess(role, tile.moduleKey));
  const hasContent = visibleTiles.length > 0;

  return (
    <EmployeePage
      title={copy.hubTitle}
      description={copy.hubDescription(branch.name)}
    >
      {hasContent ? (
        <EmployeeActionSection
          title={copy.setupEssentialsTitle}
          description={copy.setupLaneDescription}
          links={visibleTiles.map((tile) => ({
            key: `${tile.moduleKey}-${tile.href}`,
            href: tile.href,
            icon: tile.icon,
            title: tile.title,
            description: tile.description,
          }))}
          columns={1}
        />
      ) : (
        <AppEmptyState
          mode="no-access"
          title={copy.hubEmptyTitle}
          description={copy.hubEmptyDescription}
        />
      )}
    </EmployeePage>
  );
}
