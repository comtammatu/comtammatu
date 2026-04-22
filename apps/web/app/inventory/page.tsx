import { DashboardClient } from "./dashboard-client";
import { loadInventoryDashboardData } from "./_lib/dashboard-data";
export type {
  BranchOption,
  ExpiryAlertRow,
  IngredientRow,
  ReorderAlertRow,
} from "./_lib/types";

export default async function InventoryPage() {
  const data = await loadInventoryDashboardData();

  return <DashboardClient routeBase="/inventory" {...data} />;
}

