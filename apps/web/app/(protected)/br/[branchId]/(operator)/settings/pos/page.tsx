import { notFound, redirect } from "next/navigation";
import { canManageBranchFloorSettings } from "@comtammatu/shared/auth";
import {
  BranchOperatorPage,
  BranchOperatorPanel,
} from "@lib/branch-operator/components/branch-operator-page";
import { loadAuthState } from "@/_lib/auth";
import { messages } from "@lib/messages";
import {
  TerminalsClient,
  type BranchOption,
  type TerminalRow,
} from "@/(protected)/br/_shared/settings/pos/terminals-client";
import { StockControlCard } from "@/(protected)/br/_shared/settings/pos/stock-control-card";
import {
  INVENTORY_FEATURE_FLAGS,
  isFeatureEnabledForBranch,
} from "@/(protected)/inventory/_lib/feature-flags";
import { BranchSettingsBackControl } from "../_components/branch-settings-back-control";

export default async function BranchPosSettingsPage({
  params,
}: {
  params: Promise<{ branchId: string }>;
}) {
  const { branchId: branchIdStr } = await params;
  const branchId = Number(branchIdStr);
  if (!Number.isInteger(branchId) || branchId <= 0) notFound();

  const { supabase, claims } = await loadAuthState();

  if (!canManageBranchFloorSettings(claims.user_role)) {
    redirect(`/br/${branchId}/settings`);
  }

  const [branchRes, terminalsRes, stockOutcomePostingEnabled] =
    await Promise.all([
      supabase
        .from("branches")
        .select("id, name, is_active")
        .eq("id", branchId)
        .eq("tenant_id", claims.tenant_id)
        .eq("is_active", true)
        .maybeSingle(),
      supabase
        .from("pos_terminals")
        .select("id, name, branch_id, device_id, is_active")
        .eq("branch_id", branchId)
        .order("name"),
      isFeatureEnabledForBranch(
        supabase,
        branchId,
        INVENTORY_FEATURE_FLAGS.POS_STOCK_OUTCOME_POSTING,
      ),
    ]);

  if (branchRes.error || !branchRes.data) notFound();
  if (terminalsRes.error)
    throw new Error(messages.settings.branch.posTerminalsLoadFailed);

  const title = messages.settings.pages.posTitle;

  return (
    <BranchOperatorPage
      title={title}
      description={`${branchRes.data.name} · ${messages.settings.branch.posSetupDescription}`}
      hideHeaderOnMobile
    >
      <BranchSettingsBackControl branchId={branchId} title={title} />
      <BranchOperatorPanel title={messages.settings.pos.registrationSectionTitle}>
        <TerminalsClient
          branches={[branchRes.data] as BranchOption[]}
          terminals={(terminalsRes.data ?? []) as TerminalRow[]}
          embedded
        />
      </BranchOperatorPanel>
      <BranchOperatorPanel title={messages.settings.pos.stockControlTitle}>
        <StockControlCard
          branchId={branchId}
          initialPostingEnabled={stockOutcomePostingEnabled}
          canToggle={claims.user_role === "owner"}
          embedded
        />
      </BranchOperatorPanel>
    </BranchOperatorPage>
  );
}
