import { notFound, redirect } from "next/navigation";
import { canManageBranchFloorSettings } from "@comtammatu/shared/auth";
import {
  BranchOperatorPage,
  BranchOperatorPanel,
} from "@lib/branch-operator/components/branch-operator-page";
import { AppPageTabs, TabsContent } from "@/components/app-page-tabs";
import { loadAuthState } from "@/_lib/auth";
import { messages } from "@lib/messages";
import {
  TerminalsClient,
  type BranchOption,
  type TerminalRow,
} from "@/(protected)/branch-settings/_shared/pos/terminals-client";
import { StockControlCard } from "@/(protected)/branch-settings/_shared/pos/stock-control-card";
import {
  INVENTORY_FEATURE_FLAGS,
  isFeatureEnabledForBranch,
} from "@/(protected)/inventory/_lib/feature-flags";

export default async function BranchPosSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ branchId: string }>;
  searchParams: Promise<{ view?: string | string[] }>;
}) {
  const { branchId: branchIdStr } = await params;
  const branchId = Number(branchIdStr);
  if (!Number.isInteger(branchId) || branchId <= 0) notFound();

  const [{ view: rawView }, { supabase, claims }] = await Promise.all([
    searchParams,
    loadAuthState(),
  ]);

  if (!canManageBranchFloorSettings(claims.user_role)) {
    redirect(`/br/${branchId}/settings`);
  }
  if (rawView === "stock" && claims.user_role !== "owner") {
    redirect(`/br/${branchId}/settings/pos`);
  }
  const activeView = rawView === "stock" ? "stock" : "terminals";

  const [branchRes, terminalsRes, stockOutcomePostingEnabled] =
    await Promise.all([
      supabase
        .from("branches")
        .select("id, name, is_active")
        .eq("id", branchId)
        .eq("tenant_id", claims.tenant_id)
        .eq("branch_kind", "branch")
        .eq("is_active", true)
        .maybeSingle(),
      activeView === "terminals"
        ? supabase
            .from("pos_terminals")
            .select("id, name, branch_id, device_id, is_active")
            .eq("branch_id", branchId)
            .order("name")
        : Promise.resolve({ data: [], error: null }),
      activeView === "stock"
        ? isFeatureEnabledForBranch(
            supabase,
            branchId,
            INVENTORY_FEATURE_FLAGS.POS_STOCK_OUTCOME_POSTING,
          )
        : Promise.resolve(false),
    ]);

  if (branchRes.error || !branchRes.data) notFound();
  if (terminalsRes.error)
    throw new Error(messages.settings.branch.posTerminalsLoadFailed);

  return (
    <BranchOperatorPage
      title={
        activeView === "stock"
          ? messages.settings.pos.stockControlTitle
          : messages.settings.branch.posSetupTitle
      }
      description={
        activeView === "stock"
          ? branchRes.data.name
          : `${branchRes.data.name} · ${messages.settings.branch.posSetupDescription}`
      }
      backHref={`/br/${branchId}/settings`}
      backLabel={messages.settings.branch.settingsBack}
    >
      {claims.user_role === "owner" ? (
        <AppPageTabs
          paramKey="view"
          defaultValue="terminals"
          items={[
            {
              value: "terminals",
              label: messages.settings.branch.posSetupTitle,
            },
            {
              value: "stock",
              label: messages.settings.pos.stockControlTitle,
            },
          ]}
        >
          {activeView === "terminals" ? (
            <TabsContent value="terminals">
              <TerminalsClient
                branches={[branchRes.data] as BranchOption[]}
                terminals={(terminalsRes.data ?? []) as TerminalRow[]}
                embedded
              />
            </TabsContent>
          ) : (
            <TabsContent value="stock">
              <BranchOperatorPanel>
                <StockControlCard
                  branchId={branchId}
                  initialPostingEnabled={stockOutcomePostingEnabled}
                  canToggle
                  embedded
                />
              </BranchOperatorPanel>
            </TabsContent>
          )}
        </AppPageTabs>
      ) : (
        <TerminalsClient
          branches={[branchRes.data] as BranchOption[]}
          terminals={(terminalsRes.data ?? []) as TerminalRow[]}
          embedded
        />
      )}
    </BranchOperatorPage>
  );
}
