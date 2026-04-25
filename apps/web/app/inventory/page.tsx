import { DashboardClient } from "./dashboard-client";
import { loadInventoryDashboardData } from "./_lib/dashboard-data";
import { loadInventoryPlaybook } from "./_lib/playbook-data";
import { fetchProcurementBranches } from "./_lib/procurement-branches";
import { resolveRequestedBranchId } from "./_lib/inventory-scope";
import { loadAuthState } from "@/_lib/auth";
export type {
  BranchOption,
  ExpiryAlertRow,
  IngredientRow,
  ReorderAlertRow,
} from "./_lib/types";

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ branchId?: string | string[] }>;
}) {
  const params = await searchParams;
  const branchId = await resolveRequestedBranchId(params.branchId);

  const [dashboard, playbook, { supabase, claims }] = await Promise.all([
    loadInventoryDashboardData(branchId),
    loadInventoryPlaybook(branchId),
    loadAuthState(),
  ]);

  // Operational branch needs a default supply branch (CW/CK) for inline
  // Smart Requisition action on reorder tasks. Procurement branches don't.
  const defaultSupplyBranchId =
    playbook.branchKind === "branch"
      ? ((await fetchProcurementBranches(supabase, claims.tenant_id))
          .find((b) => b.id !== playbook.branchId)?.id ?? null)
      : null;

  return (
    <DashboardClient
      routeBase="/inventory"
      {...dashboard}
      playbookTasks={playbook.tasks}
      playbookBranchId={playbook.branchId}
      playbookBranchKind={playbook.branchKind}
      defaultSupplyBranchId={defaultSupplyBranchId}
    />
  );
}
