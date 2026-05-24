import { loadAuthState } from "@/_lib/auth";
import { fetchIngredients } from "../../actions";
import { fetchPoSuggestions, fetchSuppliers } from "../../procurement-actions";
import { fetchProcurementBranches } from "../../_lib/procurement-branches";
import {
  parseBranchIdParam,
  resolveInventoryBranchScope,
} from "../../_lib/inventory-scope";
import { NewPoClient, type ProcurementBranchOption } from "./new-po-client";
import type { SupplierRow } from "../../suppliers/suppliers-client";
import type { IngredientRow } from "../../page";
import type { PoSuggestionRow } from "../../procurement-actions";

export default async function NewPurchaseOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ branchId?: string | string[] }>;
}) {
  const params = await searchParams;
  const { supabase, claims } = await loadAuthState();
  const procBranches = await fetchProcurementBranches(
    supabase,
    claims.tenant_id,
  );
  const branchOptions: ProcurementBranchOption[] = procBranches.map((b) => ({
    id: b.id,
    name: b.name,
    branch_kind: b.branch_kind,
  }));

  // Branch-scoped procurement roles auto-use their assigned branch; others
  // honor the URL branch IF it is a procurement branch, else fall back to
  // the first central_warehouse.
  const requestedBranchId = parseBranchIdParam(params.branchId);
  const scope = await resolveInventoryBranchScope(
    supabase,
    claims,
    requestedBranchId,
  );
  const scopeProcurementBranchId =
    scope.selectedBranchId != null &&
    procBranches.some((b) => b.id === scope.selectedBranchId)
      ? scope.selectedBranchId
      : null;

  const isBranchScoped =
    claims.user_role === "warehouse_manager" ||
    claims.user_role === "production_manager";
  const defaultBranchId =
    (isBranchScoped ? claims.branch_id : scopeProcurementBranchId) ??
    procBranches.find((b) => b.branch_kind === "central_warehouse")?.id ??
    procBranches[0]?.id ??
    null;

  const [suppliersRes, ingRes, suggestionsRes] = await Promise.all([
    fetchSuppliers(),
    fetchIngredients(),
    defaultBranchId
      ? fetchPoSuggestions({ branchId: defaultBranchId, periodDays: 7 })
      : Promise.resolve({ success: true as const, data: [] }),
  ]);

  const suppliers: SupplierRow[] = suppliersRes.success
    ? ((suppliersRes.data ?? []) as SupplierRow[])
    : [];

  const ingredients: IngredientRow[] = ingRes.success
    ? ((ingRes.data ?? []) as IngredientRow[])
    : [];

  const suggestions: PoSuggestionRow[] = suggestionsRes.success
    ? ((suggestionsRes.data ?? []) as PoSuggestionRow[])
    : [];

  return (
    <NewPoClient
      suppliers={suppliers}
      ingredients={ingredients}
      initialSuggestions={suggestions}
      procurementBranches={branchOptions}
      initialBranchId={defaultBranchId}
      canSwitchBranch={!isBranchScoped}
      poBasePath="/inventory/purchase-orders"
    />
  );
}
