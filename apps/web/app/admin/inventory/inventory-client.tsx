"use client";

import { useState } from "react";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@comtammatu/ui/components/tabs";
import { IngredientTable } from "./ingredient-table";
import { StockLevelsTable } from "./stock-levels-table";
import type { IngredientRow, BranchOption } from "./page";

interface InventoryClientProps {
  ingredients: IngredientRow[];
  branches: BranchOption[];
  defaultBranchId: number | null;
}

export function InventoryClient({
  ingredients,
  branches,
  defaultBranchId,
}: InventoryClientProps) {
  const [localIngredients, setLocalIngredients] =
    useState<IngredientRow[]>(ingredients);

  return (
    <Tabs defaultValue="ingredients">
      <TabsList>
        <TabsTrigger value="ingredients">
          Nguyên liệu ({localIngredients.length})
        </TabsTrigger>
        <TabsTrigger value="stock">Tồn kho</TabsTrigger>
      </TabsList>

      <TabsContent value="ingredients" className="mt-4 space-y-4">
        <IngredientTable
          ingredients={localIngredients}
          onIngredientAdded={(ing) =>
            setLocalIngredients((prev) => [...prev, ing])
          }
          onIngredientUpdated={(updated) =>
            setLocalIngredients((prev) =>
              prev.map((i) => (i.id === updated.id ? updated : i)),
            )
          }
        />
      </TabsContent>

      <TabsContent value="stock" className="mt-4 space-y-4">
        <StockLevelsTable
          ingredients={localIngredients}
          branches={branches}
          defaultBranchId={defaultBranchId}
        />
      </TabsContent>
    </Tabs>
  );
}
