import { notFound } from "next/navigation";
import {
  Armchair as IconArmchair,
  ChefHat as IconChefHat,
  Monitor as IconDeviceDesktop,
  Printer as IconPrinter,
} from "lucide-react";
import {
  BranchOperatorActionSection,
  BranchOperatorPage,
} from "@lib/branch-operator/components/branch-operator-page";
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
    .eq("branch_kind", "branch")
    .maybeSingle();

  if (!branch || !branch.is_active) notFound();

  const copy = messages.settings.branch;
  const tiles = buildHubTiles(branchId, copy, {
    tables: IconArmchair,
    pos: IconDeviceDesktop,
    printers: IconPrinter,
    kds: IconChefHat,
  });
  return (
    <BranchOperatorPage
      title={copy.hubTitle}
      description={copy.hubDescription}
      backHref={`/br/${branchId}`}
      backLabel={copy.employeeBack}
    >
      <BranchOperatorActionSection
        presentation="plain"
        columns={1}
        links={tiles.map((tile) => ({
          key: tile.href,
          href: tile.href,
          icon: tile.icon,
          title: tile.title,
          description: tile.description,
        }))}
      />
    </BranchOperatorPage>
  );
}
