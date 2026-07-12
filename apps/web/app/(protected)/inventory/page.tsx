import { redirect } from "next/navigation";
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
  redirect(
    branchId == null
      ? "/inventory/stock"
      : `/inventory/stock?branchId=${branchId}`,
  );
}
