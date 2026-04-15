import { createClient } from "@comtammatu/database/supabase/server";
import { extractClaims } from "@comtammatu/shared/auth";
import { redirect } from "next/navigation";
import { fetchIngredients } from "../actions";
import {
  fetchProductionOrders,
  fetchProductionRecipes,
  type ProductionOrderRow,
  type ProductionRecipeRow,
} from "../production-actions";
import { ProductionHubClient } from "../production-client";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@comtammatu/ui/components/card";
import { hasBranchKindSchema } from "../_lib/branch-kind-schema";

type InventoryIngredientRow = {
  id: number;
  name: string;
  unit: string;
  item_kind: string;
};

type BranchPreviewRow = {
  id: number;
  name: string;
  branch_kind?: string | null;
  is_headquarters?: boolean | null;
  is_active: boolean | null;
};

export default async function ProductionPage() {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const claims = session?.user
    ? extractClaims(session.user.app_metadata)
    : null;

  if (claims?.user_role !== "super_manager") {
    redirect("/inventory?forbidden=1&reason=insufficient-permission");
  }

  const branchKindSchemaAvailable = await hasBranchKindSchema(supabase);

  const branchesQuery = branchKindSchemaAvailable
    ? supabase
        .from("branches")
        .select("id, name, branch_kind, is_active")
        .eq("tenant_id", claims?.tenant_id ?? 0)
        .eq("is_active", true)
        .order("name")
    : supabase
        .from("branches")
        .select("id, name, is_headquarters, is_active")
        .eq("tenant_id", claims?.tenant_id ?? 0)
        .eq("is_active", true)
        .order("name");

  const [branchesRes, ingredientsRes, ordersRes, recipesRes] =
    await Promise.all([
      branchesQuery,
      fetchIngredients(),
      fetchProductionOrders(),
      fetchProductionRecipes(),
    ]);
  const branches = (branchesRes.data ?? []) as BranchPreviewRow[];

  const centralKitchenBranches = branchKindSchemaAvailable
    ? branches
        .filter((branch) => branch.branch_kind === "central_kitchen")
        .map((branch) => ({
          id: branch.id,
          name: branch.name,
        }))
    : [];

  const visibleBranches = centralKitchenBranches;

  const allIngredients =
    ingredientsRes.success && Array.isArray(ingredientsRes.data)
      ? (ingredientsRes.data as InventoryIngredientRow[])
      : [];

  const finishedGoods = allIngredients
    .filter((ingredient) => ingredient.item_kind === "finished_good")
    .map((ingredient) => ({
      id: ingredient.id,
      name: ingredient.name,
      unit: ingredient.unit,
    }));

  const orders: ProductionOrderRow[] = ordersRes.success
    ? (ordersRes.data ?? [])
    : [];

  const recipes: ProductionRecipeRow[] = recipesRes.success
    ? (recipesRes.data ?? [])
    : [];

  return (
    <div className="space-y-6">
      <Card className="border-border/70">
        <CardHeader>
          <CardTitle className="text-2xl">Bếp trung tâm</CardTitle>
        </CardHeader>
      </Card>
      {!branchKindSchemaAvailable && (
        <Card className="rounded-lg border-warning/20 bg-warning/10 text-foreground">
          <CardContent className="p-4">
            <p className="text-sm leading-6">
              Database hiện tại chưa có cột <code>branch_kind</code>. Màn Bếp
              trung tâm đang ở chế độ chờ migration, nên các thao tác sản xuất
              tạm thời bị khóa để tránh phát sinh lỗi mơ hồ.
            </p>
          </CardContent>
        </Card>
      )}
      <ProductionHubClient
        branchKindSchemaAvailable={branchKindSchemaAvailable}
        centralKitchenBranches={visibleBranches}
        ingredients={allIngredients.map((ingredient) => ({
          id: ingredient.id,
          name: ingredient.name,
          unit: ingredient.unit,
          item_kind: ingredient.item_kind,
        }))}
        finishedGoods={finishedGoods}
        orders={orders}
        recipes={recipes}
      />
    </div>
  );
}
