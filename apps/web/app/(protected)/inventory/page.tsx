import { redirect } from "next/navigation";
import { loadAuthState } from "@/_lib/auth";
import { resolveInventoryHomePath } from "./_lib/inventory-home";
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
  const params = await searchParams;
  const branchId = await resolveRequestedBranchId(params.branchId);
  redirect(resolveInventoryHomePath(claims.user_role, branchId));
}
