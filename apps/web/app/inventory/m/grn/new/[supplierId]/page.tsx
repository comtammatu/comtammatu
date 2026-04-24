import { redirect } from "next/navigation";
import { createClient } from "@comtammatu/database/supabase/server";
import {
  canAccess,
  extractClaimsFromAccessToken,
  PROCUREMENT_ROLES,
} from "@comtammatu/shared/auth";
import { fetchProcurementBranches } from "../../../../_lib/procurement-branches";
import { GrnCreateClient } from "./grn-create-client";

type Ingredient = {
  id: number;
  name: string;
  sku: string | null;
  unit: string;
  purchase_unit: string | null;
  unit_cost: number | null;
  category: string | null;
};

export default async function MobileGrnCreatePage({
  params,
}: {
  params: Promise<{ supplierId: string }>;
}) {
  const { supplierId: supplierIdStr } = await params;
  const supplierId = Number(supplierIdStr);
  if (!Number.isFinite(supplierId) || supplierId <= 0) {
    redirect("/inventory/m/grn");
  }

  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const claims = extractClaimsFromAccessToken(session?.access_token);
  if (
    !claims ||
    !PROCUREMENT_ROLES.includes(claims.user_role) ||
    !canAccess(claims.user_role, "inventory_procurement")
  ) {
    redirect("/access-denied?reason=insufficient-permission");
  }

  const [supplierRes, ingredientsRes] = await Promise.all([
    supabase
      .from("suppliers")
      .select("id, name")
      .eq("id", supplierId)
      .eq("tenant_id", claims.tenant_id)
      .maybeSingle(),
    supabase
      .from("ingredients")
      .select("id, name, sku, unit, purchase_unit, unit_cost, category")
      .eq("tenant_id", claims.tenant_id)
      .eq("is_active", true)
      .order("name")
      .limit(500),
  ]);

  if (!supplierRes.data) redirect("/inventory/m/grn");

  const branches = await fetchProcurementBranches(supabase, claims.tenant_id);
  const defaultBranchId =
    claims.branch_id && branches.some((b) => b.id === claims.branch_id)
      ? claims.branch_id
      : (branches[0]?.id ?? null);

  const ingredients = ((ingredientsRes.data ?? []) as Ingredient[]).map(
    (ingredient) => ({
      ...ingredient,
      unit: ingredient.purchase_unit ?? ingredient.unit,
    }),
  );

  return (
    <GrnCreateClient
      userKey={`u${claims.user_role}-${claims.tenant_id}`}
      supplier={{ id: supplierRes.data.id, name: supplierRes.data.name }}
      branchId={defaultBranchId}
      ingredients={ingredients}
    />
  );
}
