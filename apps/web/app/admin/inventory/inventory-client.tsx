"use client";

import { useState } from "react";
import type { InventoryValueVisibility } from "@comtammatu/shared/auth";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@comtammatu/ui/components/tabs";
import { IngredientTable } from "./ingredient-table";
import { InventoryValuePanel } from "./inventory-value-panel";
import { StockLevelsTable } from "./stock-levels-table";
import type { IngredientRow, BranchOption } from "./page";

interface InventoryClientProps {
  ingredients: IngredientRow[];
  branches: BranchOption[];
  defaultBranchId: number | null;
  inventoryValueVisibility: InventoryValueVisibility;
  canManageIngredientCatalog: boolean;
}

export function InventoryClient({
  ingredients,
  branches,
  defaultBranchId,
  inventoryValueVisibility,
  canManageIngredientCatalog,
}: InventoryClientProps) {
  const [localIngredients, setLocalIngredients] =
    useState<IngredientRow[]>(ingredients);

  return (
    <div className="space-y-8">
      <InventoryValuePanel visibility={inventoryValueVisibility} />

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
            canManageCatalog={canManageIngredientCatalog}
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
            showLineValue={inventoryValueVisibility.branch}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
