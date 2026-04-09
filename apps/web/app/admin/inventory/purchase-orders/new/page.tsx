import { fetchIngredients } from "../../actions";
import { fetchPoSuggestions, fetchSuppliers } from "../../procurement-actions";
import { NewPoClient } from "./new-po-client";
import type { SupplierRow } from "../../suppliers/suppliers-client";
import type { IngredientRow } from "../../page";
import type { PoSuggestionRow } from "../../procurement-actions";

export default async function NewPurchaseOrderPage() {
  const [suppliersRes, ingRes, suggestionsRes] = await Promise.all([
    fetchSuppliers(),
    fetchIngredients(),
    fetchPoSuggestions({ periodDays: 7 }),
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
    />
  );
}
