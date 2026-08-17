import { PERMISSION_KEYS } from "@comtammatu/shared/auth";
import { catalogItemRequiresSupplierLink } from "@lib/inventory/catalog-readiness";
import { loadAuthState } from "@/_lib/auth";
import { currentUserHasPermissionAny } from "@/_lib/permissions";
import { fetchSuppliers } from "../procurement-actions";
import { SuppliersClient } from "./suppliers-client";
import type { SupplierRow } from "./supplier-dialog";
import type {
  SupplierIngredientOption,
  SupplierItemRow,
} from "./[id]/items/supplier-items-client";

export default async function SuppliersPage({
  searchParams,
}: {
  searchParams: Promise<{ supplierId?: string | string[] }>;
}) {
  const [result, canReadItems, canManageItems] = await Promise.all([
    fetchSuppliers(),
    currentUserHasPermissionAny(PERMISSION_KEYS.PROCUREMENT_PRICE_LIST_READ),
    currentUserHasPermissionAny(PERMISSION_KEYS.PROCUREMENT_PRICE_LIST_WRITE),
  ]);
  if (!result.success) {
    throw new Error("inventory.suppliers.load_failed");
  }

  const initial = result.data as SupplierRow[];
  const supplierIdParam = (await searchParams).supplierId;
  const requestedSupplierId =
    typeof supplierIdParam === "string" ? Number(supplierIdParam) : Number.NaN;
  const selectedSupplierId =
    canReadItems &&
    Number.isSafeInteger(requestedSupplierId) &&
    initial.some((supplier) => supplier.id === requestedSupplierId)
      ? requestedSupplierId
      : null;
  let ingredients: SupplierIngredientOption[] = [];
  const items: SupplierItemRow[] = [];

  if (selectedSupplierId !== null) {
    const { supabase, claims } = await loadAuthState();
    const [ingredientResult, itemResult] = await Promise.all([
      supabase
        .from("ingredients")
        .select("id, name, sku, item_kind")
        .eq("tenant_id", claims.tenant_id)
        .eq("is_active", true)
        .order("name")
        .limit(500),
      supabase
        .from("supplier_items")
        .select("id, ingredient_id, is_preferred")
        .eq("tenant_id", claims.tenant_id)
        .eq("supplier_id", selectedSupplierId)
        .eq("is_active", true)
        .order("ingredient_id"),
    ]);

    if (ingredientResult.error || itemResult.error) {
      throw new Error("inventory.supplier_items.load_failed");
    }

    const catalogIngredients = (ingredientResult.data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      sku: row.sku,
      itemKind: row.item_kind,
    }));
    ingredients = catalogIngredients
      .filter((row) => catalogItemRequiresSupplierLink(row.itemKind))
      .map(({ id, name, sku }) => ({ id, name, sku }));
    const ingredientById = new Map(
      catalogIngredients.map((item) => [item.id, item]),
    );
    for (const item of itemResult.data ?? []) {
      const ingredient = ingredientById.get(item.ingredient_id);
      if (!ingredient) continue;
      items.push({
        id: item.id,
        ingredientId: ingredient.id,
        ingredientName: ingredient.name,
        ingredientSku: ingredient.sku,
        isPreferred: item.is_preferred === true,
      });
    }
  }

  return (
    <SuppliersClient
      initial={initial}
      canReadItems={canReadItems}
      canManageItems={canManageItems}
      ingredients={ingredients}
      items={items}
    />
  );
}
