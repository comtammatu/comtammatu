import { notFound, redirect } from "next/navigation";
import { PERMISSION_KEYS } from "@comtammatu/shared/auth";
import { loadAuthState } from "@/_lib/auth";
import { currentUserHasPermissionAny } from "@/_lib/permissions";
import {
  SupplierItemsClient,
  type SupplierIngredientOption,
  type SupplierItemRow,
} from "./supplier-items-client";

export default async function SupplierItemsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const supplierId = Number((await params).id);
  if (!Number.isSafeInteger(supplierId) || supplierId <= 0) notFound();

  const { supabase, claims } = await loadAuthState();
  const [canRead, canManage] = await Promise.all([
    currentUserHasPermissionAny(PERMISSION_KEYS.PROCUREMENT_PRICE_LIST_READ),
    currentUserHasPermissionAny(PERMISSION_KEYS.PROCUREMENT_PRICE_LIST_WRITE),
  ]);
  if (!canRead) redirect("/access-denied?reason=insufficient-permission");

  const [supplierResult, ingredientResult, itemResult] = await Promise.all([
    supabase
      .from("suppliers")
      .select("id, name")
      .eq("id", supplierId)
      .eq("tenant_id", claims.tenant_id)
      .eq("is_active", true)
      .maybeSingle(),
    supabase
      .from("ingredients")
      .select("id, name, sku")
      .eq("tenant_id", claims.tenant_id)
      .eq("is_active", true)
      .order("name")
      .limit(500),
    supabase
      .from("supplier_items")
      .select("id, ingredient_id, supplier_sku_code")
      .eq("tenant_id", claims.tenant_id)
      .eq("supplier_id", supplierId)
      .eq("is_active", true)
      .order("supplier_sku_code"),
  ]);

  if (supplierResult.error || ingredientResult.error || itemResult.error) {
    throw new Error("inventory.supplier_items.load_failed");
  }
  if (!supplierResult.data) notFound();

  const ingredients: SupplierIngredientOption[] = ingredientResult.data ?? [];
  const ingredientById = new Map(ingredients.map((item) => [item.id, item]));
  const rows: SupplierItemRow[] = (itemResult.data ?? []).flatMap((item) => {
    const ingredient = ingredientById.get(item.ingredient_id);
    return ingredient
      ? [
          {
            id: item.id,
            ingredientId: ingredient.id,
            ingredientName: ingredient.name,
            ingredientSku: ingredient.sku,
            supplierSkuCode: item.supplier_sku_code,
          },
        ]
      : [];
  });

  return (
    <SupplierItemsClient
      supplier={supplierResult.data}
      ingredients={ingredients}
      rows={rows}
      canManage={canManage}
    />
  );
}
