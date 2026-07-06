import { DashboardClient } from "./dashboard-client";
import { loadInventoryDashboardData } from "./_lib/dashboard-data";
import { resolveRequestedBranchId } from "./_lib/inventory-scope";
export type {
  BranchOption,
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
  const data = await loadInventoryDashboardData(branchId);

  return <DashboardClient routeBase="/inventory" {...data} />;
}
