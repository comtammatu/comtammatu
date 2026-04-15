"use client";

import { useMemo } from "react";
import { ProductionStats } from "./production-stats";
import { ProductionOrderList } from "./production-order-list";
import { ProductionOrderForm } from "./production-order-form";
import { ProductionRecipePanel } from "./production-recipe-panel";
import { sortFinishedGoods, sortRawIngredients } from "./production-types";
import type {
  BranchOption,
  FinishedGoodOption,
  IngredientOption,
  ProductionOrderRow,
  ProductionRecipeRow,
} from "./production-types";

interface ProductionHubClientProps {
  branchKindSchemaAvailable: boolean;
  centralKitchenBranches: BranchOption[];
  ingredients: IngredientOption[];
  finishedGoods: FinishedGoodOption[];
  orders: ProductionOrderRow[];
  recipes: ProductionRecipeRow[];
}

export function ProductionHubClient({
  branchKindSchemaAvailable,
  centralKitchenBranches,
  ingredients,
  finishedGoods,
  orders,
  recipes,
}: ProductionHubClientProps) {
  const sortedFinishedGoods = useMemo(
    () => sortFinishedGoods(finishedGoods),
    [finishedGoods],
  );
  const sortedRawIngredients = useMemo(
    () =>
      sortRawIngredients(
        ingredients
          .filter((ingredient) => ingredient.item_kind === "raw_material")
          .map((ingredient) => ({
            id: ingredient.id,
            name: ingredient.name,
            unit: ingredient.unit,
          })),
      ),
    [ingredients],
  );

  const readinessMessage = !branchKindSchemaAvailable
    ? "Màn Bếp trung tâm đang chờ migration `branch_kind`, nên tất cả thao tác tạo/sửa/xác nhận lệnh hiện bị khóa."
    : centralKitchenBranches.length === 0
      ? "Chưa có bếp trung tâm nào được cấu hình."
      : sortedFinishedGoods.length === 0
        ? "Chưa có thành phẩm nào được gắn `item_kind = finished_good`, nên chưa thể tạo lệnh sản xuất."
        : sortedRawIngredients.length === 0
          ? "Chưa có nguyên liệu nào được gắn `item_kind = raw_material`, nên chưa thể lập công thức."
          : null;

  const actionsEnabled =
    branchKindSchemaAvailable &&
    centralKitchenBranches.length > 0 &&
    sortedFinishedGoods.length > 0 &&
    sortedRawIngredients.length > 0;

  return (
    <div className="space-y-6">
      <ProductionStats
        orders={orders}
        readinessMessage={readinessMessage}
        centralKitchenCount={centralKitchenBranches.length}
        branchKindSchemaAvailable={branchKindSchemaAvailable}
      />

      <div className="flex flex-wrap items-center justify-end gap-3">
        <ProductionOrderForm
          centralKitchenBranches={centralKitchenBranches}
          finishedGoodsOptions={sortedFinishedGoods}
          actionsEnabled={actionsEnabled}
        />
      </div>

      <ProductionOrderList
        orders={orders}
        branchKindSchemaAvailable={branchKindSchemaAvailable}
      />

      <ProductionRecipePanel
        branchKindSchemaAvailable={branchKindSchemaAvailable}
        finishedGoods={finishedGoods}
        ingredients={ingredients}
        recipes={recipes}
      />
    </div>
  );
}
