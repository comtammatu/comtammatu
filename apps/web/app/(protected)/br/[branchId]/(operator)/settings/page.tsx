import { notFound } from "next/navigation";
import {
  Armchair as IconArmchair,
  ChefHat as IconChefHat,
  Monitor as IconDeviceDesktop,
  Printer as IconPrinter,
} from "lucide-react";
import { canAccess } from "@comtammatu/shared/auth";
import { AppEmptyState } from "@/components/surface";
import {
  BranchOperatorActionSection,
  BranchOperatorPage,
} from "@lib/branch-operator/components/branch-operator-page";
import { loadAuthState } from "@/_lib/auth";
import { messages } from "@lib/messages";
import { buildSettingsLinks } from "./_lib/settings-links";

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

  const links = buildSettingsLinks(branchId, copy, {
    tables: IconArmchair,
    pos: IconDeviceDesktop,
    printers: IconPrinter,
    kds: IconChefHat,
  });
  const visibleLinks = links.filter((link) => canAccess(role, link.moduleKey));
  const hasContent = visibleLinks.length > 0;

  return (
    <BranchOperatorPage title={copy.landingTitle} hideHeaderOnMobile>
      {hasContent ? (
        <BranchOperatorActionSection
          presentation="plain"
          mobileColumns={2}
          links={visibleLinks.map((link) => ({
            key: `${link.moduleKey}-${link.href}`,
            href: link.href,
            icon: link.icon,
            title: link.title,
          }))}
        />
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
