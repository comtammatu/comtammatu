import { redirect } from "next/navigation";
import { loadAuthState } from "@/_lib/auth";
import { DashboardClient } from "./dashboard-client";
import { loadInventoryDashboardData } from "./_lib/dashboard-data";
import { resolveRequestedBranchId } from "./_lib/inventory-scope";
export type {
  BranchOption,
  IngredientRow,
  ReorderAlertRow,
} from "@lib/inventory/types";

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ branchId?: string | string[] }>;
}) {
  const { claims } = await loadAuthState();
  if (claims.user_role === "accountant") redirect("/inventory/grn");

  const params = await searchParams;
  const branchId = await resolveRequestedBranchId(params.branchId);
  const data = await loadInventoryDashboardData(branchId);

  return <DashboardClient routeBase="/inventory" {...data} />;
}
