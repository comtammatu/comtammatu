"use client";

import { useState } from "react";
import { IngredientTable } from "@/admin/inventory/ingredient-table";
import type { IngredientRow } from "@/admin/inventory/page";

interface IngredientsSettingsClientProps {
  ingredients: IngredientRow[];
  canManageCatalog: boolean;
}

export function IngredientsSettingsClient({
  ingredients,
  canManageCatalog,
}: IngredientsSettingsClientProps) {
  const [localIngredients, setLocalIngredients] =
    useState<IngredientRow[]>(ingredients);

  return (
    <IngredientTable
      ingredients={localIngredients}
      canManageCatalog={canManageCatalog}
      onIngredientAdded={(ing) => setLocalIngredients((prev) => [...prev, ing])}
      onIngredientUpdated={(updated) =>
        setLocalIngredients((prev) =>
          prev.map((i) => (i.id === updated.id ? updated : i)),
        )
      }
    />
  );
}
