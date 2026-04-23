import { redirect } from "next/navigation";
import { SUPPLIER_RETURN_ROLES, PERMISSION_KEYS } from "@comtammatu/shared/auth";
import { getAuthContextWithPermission } from "../../_lib/auth";
import { fetchProcurementBranches } from "../../_lib/procurement-branches";
import { fetchSuppliers } from "../../supplier-actions";
import { fetchIngredients } from "../../actions";
import { NewSupplierReturnClient } from "./new-supplier-return-client";

export default async function NewSupplierReturnPage() {
  const ctx = await getAuthContextWithPermission(
    SUPPLIER_RETURN_ROLES,
    PERMISSION_KEYS.SUPPLIER_RETURN_CREATE,
  );
  if (!ctx) {
    redirect("/inventory/supplier-returns");
  }

  const { supabase, claims } = ctx;
  const branches = await fetchProcurementBranches(supabase, claims.tenant_id);

  const [suppliersRes, ingredientsRes] = await Promise.all([
    fetchSuppliers(),
    fetchIngredients(2000),
  ]);

  const suppliers = suppliersRes.success
    ? ((suppliersRes.data as Array<{ id: number; name: string }>) ?? [])
    : [];
  const ingredients = ingredientsRes.success
    ? ((ingredientsRes.data as Array<{
        id: number;
        name: string;
        unit: string;
        unit_cost: number | null;
      }>) ?? [])
    : [];

  return (
    <NewSupplierReturnClient
      tenantId={claims.tenant_id}
      branches={branches.map((b) => ({ id: b.id, name: b.name }))}
      suppliers={suppliers.map((s) => ({ id: s.id, name: s.name }))}
      ingredients={ingredients.map((i) => ({
        id: i.id,
        name: i.name,
        unit: i.unit,
        unitCost: i.unit_cost ?? 0,
      }))}
      defaultBranchId={branches[0]?.id ?? null}
    />
  );
}
