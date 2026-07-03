import { notFound, redirect } from "next/navigation";
import { canManageBranchFloorSettings } from "@comtammatu/shared/auth";
import { EmployeePage } from "@/(protected)/employee/components/employee-page";
import { loadAuthState } from "@/_lib/auth";
import { messages } from "@lib/messages";
import {
  TerminalsClient,
  type BranchOption,
  type TerminalRow,
} from "@/(protected)/branch-settings/_shared/pos/terminals-client";
import { IngredientStockBlockCard } from "@/(protected)/branch-settings/_shared/pos/ingredient-stock-block-card";
import { StockControlCard } from "@/(protected)/branch-settings/_shared/pos/stock-control-card";
import {
  INVENTORY_FEATURE_FLAGS,
  isFeatureEnabledForBranch,
} from "@/(protected)/inventory/_lib/feature-flags";

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

  const [
    branchRes,
    terminalsRes,
    ingredientStockBlockEnabled,
    stockOutcomePostingEnabled,
    stockAvailabilityGateEnabled,
  ] = await Promise.all([
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
      INVENTORY_FEATURE_FLAGS.POS_INGREDIENT_STOCK_BLOCK,
    ),
    isFeatureEnabledForBranch(
      supabase,
      branchId,
      INVENTORY_FEATURE_FLAGS.POS_STOCK_OUTCOME_POSTING,
    ),
    isFeatureEnabledForBranch(
      supabase,
      branchId,
      INVENTORY_FEATURE_FLAGS.POS_STOCK_AVAILABILITY_GATE,
    ),
  ]);

  if (branchRes.error || !branchRes.data) notFound();
  if (terminalsRes.error) throw new Error("Không thể tải máy POS");

  return (
    <EmployeePage
      title={messages.settings.pages.posTitle}
      description={branchRes.data.name}
    >
      <TerminalsClient
        branches={[branchRes.data] as BranchOption[]}
        terminals={(terminalsRes.data ?? []) as TerminalRow[]}
      />
      <StockControlCard
        branchId={branchId}
        initialPostingEnabled={stockOutcomePostingEnabled}
        initialGateEnabled={stockAvailabilityGateEnabled}
      />
      <IngredientStockBlockCard
        branchId={branchId}
        initialEnabled={ingredientStockBlockEnabled}
      />
    </EmployeePage>
  );
}
