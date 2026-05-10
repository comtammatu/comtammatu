import { redirect } from "next/navigation";
import { appendInventorySearchParams } from "./_lib/paths";
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
  redirect(appendInventorySearchParams("/inventory/stock", await searchParams));
}
