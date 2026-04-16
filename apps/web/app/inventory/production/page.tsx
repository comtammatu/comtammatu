import { createClient } from "@comtammatu/database/supabase/server";
import { Card, CardContent } from "@comtammatu/ui/components/card";
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

  const role = claims?.user_role;
  if (!role || !["owner", "super_manager", "branch_manager"].includes(role)) {
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

  // branch_manager sees only their own central_kitchen; super_manager/owner see all
  const visibleBranches =
    role === "branch_manager"
      ? centralKitchenBranches.filter((b) => b.id === claims!.branch_id)
      : centralKitchenBranches;

  // branch_manager not assigned to a central_kitchen → no access
  if (role === "branch_manager" && branchKindSchemaAvailable && visibleBranches.length === 0) {
    redirect("/inventory?forbidden=1&reason=insufficient-permission");
  }

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
      <Card>
        <CardContent className="p-5 sm:p-6">
          <div className="space-y-3">
            <span className="inline-flex items-center rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
              Central Kitchen
            </span>
            <div className="space-y-2">
              <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                Bếp trung tâm
              </h2>
              <p className="max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
                Điều phối sản xuất bán thành phẩm và thành phẩm từ trụ sở hoặc
                bếp trung tâm trong cùng một flow vận hành mới.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
      {!branchKindSchemaAvailable && (
        <Card className="border-warning/20 bg-warning/10">
          <CardContent className="py-12 text-center">
            <div className="space-y-1.5">
              <h3 className="text-2xl font-semibold">
                Thiếu schema branch_kind
              </h3>
              <p className="mx-auto max-w-md text-sm leading-6 text-muted-foreground">
                Database hiện tại chưa có cột `branch_kind`. Màn Bếp trung tâm
                đang ở chế độ chờ migration, nên các thao tác sản xuất tạm thời
                bị khóa để tránh phát sinh lỗi mơ hồ.
              </p>
            </div>
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
