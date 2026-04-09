import { fetchIngredients } from "../../actions";
import { fetchSuppliers } from "../../procurement-actions";
import { NewPoClient } from "./new-po-client";
import type { SupplierRow } from "../../suppliers/suppliers-client";
import type { IngredientRow } from "../../page";

export default async function NewPurchaseOrderPage() {
  const [suppliersRes, ingRes] = await Promise.all([
    fetchSuppliers(),
    fetchIngredients(),
  ]);

  const suppliers: SupplierRow[] = suppliersRes.success
    ? ((suppliersRes.data ?? []) as SupplierRow[])
    : [];

  const ingredients: IngredientRow[] = ingRes.success
    ? ((ingRes.data ?? []) as IngredientRow[])
    : [];

  return <NewPoClient suppliers={suppliers} ingredients={ingredients} />;
}
