import { notFound, redirect } from "next/navigation";
import { canManageTenantStrategySettings } from "@comtammatu/shared/auth";
import { AppBackLink } from "@/components/surface";
import {
  BranchOperatorPage,
  BranchOperatorPanel,
} from "@lib/branch-operator/components/branch-operator-page";
import { loadAuthState } from "@/_lib/auth";
import { messages } from "@lib/messages";
import { NetworkConfigPanel } from "@/(protected)/branches/network-config-dialog";

export default async function BranchNetworkSettingsPage({
  params,
}: {
  params: Promise<{ branchId: string }>;
}) {
  const { branchId: branchIdStr } = await params;
  const branchId = Number(branchIdStr);
  if (!Number.isInteger(branchId) || branchId <= 0) notFound();

  const { supabase, claims } = await loadAuthState();

  if (!canManageTenantStrategySettings(claims.user_role)) {
    redirect(`/br/${branchId}/settings`);
  }

  const { data: branch, error } = await supabase
    .from("branches")
    .select("id, name, is_active")
    .eq("id", branchId)
    .eq("tenant_id", claims.tenant_id)
    .eq("is_active", true)
    .maybeSingle();

  if (error || !branch) notFound();

  const title = messages.settings.pages.networkTitle;

  return (
    <BranchOperatorPage
      title={title}
      description={messages.settings.network.description}
      back={<AppBackLink href={`/br/${branchId}/settings`} />}
    >
      <BranchOperatorPanel>
        <NetworkConfigPanel branch={{ id: branch.id, name: branch.name }} />
      </BranchOperatorPanel>
    </BranchOperatorPage>
  );
}
