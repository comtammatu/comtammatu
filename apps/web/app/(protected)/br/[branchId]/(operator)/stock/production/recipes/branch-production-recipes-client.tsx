/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: operator UI */
"use client";

import Link from "next/link";
import { useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft as IconArrowLeft,
  BookOpen as IconBookOpen,
  ChevronRight as IconChevronRight,
  Plus as IconPlus,
  Trash2 as IconTrash,
} from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { confirm } from "@comtammatu/ui/components/confirm-dialog";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { toast } from "@comtammatu/ui/components/sonner";
import { AppEmptyState } from "@/components/surface";
import {
  BranchOperatorControlBar,
  BranchOperatorPage,
  BranchOperatorPanel,
  BranchOperatorStatusStrip,
} from "@lib/branch-operator/components/branch-operator-page";
import { deleteProductionRecipeGroup } from "@/(protected)/inventory/production-actions";
import type {
  FinishedGoodOption,
  ProductionRecipeGroup,
  ProductionRecipeRow,
} from "@/(protected)/inventory/production-types";

interface BranchProductionRecipesClientProps {
  branchId: number;
  canManageRecipes: boolean;
  finishedGoods: FinishedGoodOption[];
  recipes: ProductionRecipeRow[];
}

export function BranchProductionRecipesClient({
  branchId,
  canManageRecipes,
  finishedGoods,
  recipes,
}: BranchProductionRecipesClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const basePath = `/br/${branchId}/stock/production`;
  const recipesPath = `${basePath}/recipes`;
  const groups = useMemo<ProductionRecipeGroup[]>(() => {
    const byFinishedGood = new Map<number, ProductionRecipeGroup>();
    for (const recipe of recipes) {
      const current = byFinishedGood.get(recipe.finished_good_id);
      if (current) {
        current.lines.push(recipe);
      } else {
        byFinishedGood.set(recipe.finished_good_id, {
          finishedGoodId: recipe.finished_good_id,
          finishedGoodName: recipe.finished_good_name,
          lines: [recipe],
        });
      }
    }
    return Array.from(byFinishedGood.values()).sort((left, right) =>
      left.finishedGoodName.localeCompare(right.finishedGoodName, "vi"),
    );
  }, [recipes]);

  async function handleDelete(group: ProductionRecipeGroup) {
    const accepted = await confirm({
      title: `Xóa công thức ${group.finishedGoodName}?`,
      description:
        "Lệnh sản xuất mới sẽ không thể dùng thành phẩm này cho đến khi có công thức khác.",
      confirmText: "Xóa công thức",
      cancelText: "Giữ công thức",
      variant: "destructive",
    });
    if (!accepted) return;
    startTransition(async () => {
      const result = await deleteProductionRecipeGroup(group.finishedGoodId);
      if (!result.success) {
        toast.error(result.error ?? "Không thể xóa công thức.");
        return;
      }
      toast.success("Đã xóa công thức");
      router.refresh();
    });
  }

  return (
    <BranchOperatorPage
      title="Công thức sản xuất"
      description="Định mức nguyên liệu theo từng thành phẩm."
      hideHeaderOnMobile
    >
      <div className="flex min-w-0 touch-manipulation flex-col gap-3">
        <BranchOperatorControlBar className="sm:hidden">
          <Button asChild variant="ghost" size="icon-touch">
            <Link href={basePath} aria-label="Quay lại Sản xuất">
              <IconArrowLeft />
            </Link>
          </Button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">Công thức sản xuất</p>
            <p className="truncate text-xs text-muted-foreground">
              {groups.length} thành phẩm đã có định mức
            </p>
          </div>
        </BranchOperatorControlBar>

        <BranchOperatorStatusStrip
          items={[
            {
              label: "Đã có công thức",
              value: `${groups.length}/${finishedGoods.length}`,
              mono: true,
            },
            {
              label: "Dòng nguyên liệu",
              value: recipes.length,
              mono: true,
            },
            {
              label: "Còn thiếu",
              value: Math.max(finishedGoods.length - groups.length, 0),
              mono: true,
            },
          ]}
        />

        <BranchOperatorPanel
          title="Thành phẩm"
          description="Chạm một thành phẩm để xem hoặc chỉnh định mức."
          icon={IconBookOpen}
          size="sm"
          action={
            canManageRecipes ? (
              <Button asChild size="touch">
                <Link href={`${recipesPath}/new`}>
                  <IconPlus data-icon="inline-start" />
                  Tạo công thức
                </Link>
              </Button>
            ) : undefined
          }
          contentClassName="gap-2"
        >
          {groups.length === 0 ? (
            <AppEmptyState
              compact
              align="start"
              mode="no-data"
              title="Chưa có công thức sản xuất"
              description="Tạo định mức đầu tiên để Bếp kiểm tra và trừ nguyên liệu đúng."
            >
              {canManageRecipes ? (
                <Button asChild size="touch">
                  <Link href={`${recipesPath}/new`}>
                    Tạo công thức đầu tiên
                  </Link>
                </Button>
              ) : null}
            </AppEmptyState>
          ) : (
            <ItemGroup className="gap-2" role="list">
              {groups.map((group) => (
                <Item
                  key={group.finishedGoodId}
                  role="listitem"
                  variant="outline"
                  className="min-h-20 items-center gap-2 p-0 touch-manipulation"
                >
                  <Link
                    href={`${recipesPath}/${group.finishedGoodId}`}
                    className="flex min-w-0 flex-1 self-stretch items-center gap-3 px-3 py-2"
                  >
                    <ItemContent className="min-w-0 gap-1">
                      <ItemTitle className="line-clamp-none text-sm font-semibold">
                        {group.finishedGoodName}
                      </ItemTitle>
                      <ItemDescription className="line-clamp-2">
                        {group.lines
                          .slice(0, 3)
                          .map((line) => line.ingredient_name)
                          .join(" · ")}
                        {group.lines.length > 3
                          ? ` · +${group.lines.length - 3}`
                          : ""}
                      </ItemDescription>
                    </ItemContent>
                    <ItemActions className="shrink-0">
                      <span className="font-mono text-xs tabular-nums text-muted-foreground">
                        {group.lines.length} dòng
                      </span>
                      <IconChevronRight className="size-4 text-muted-foreground" />
                    </ItemActions>
                  </Link>
                  {canManageRecipes ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-touch"
                      className="mr-2 shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      aria-label={`Xóa công thức ${group.finishedGoodName}`}
                      disabled={isPending}
                      onClick={() => handleDelete(group)}
                    >
                      <IconTrash />
                    </Button>
                  ) : null}
                </Item>
              ))}
            </ItemGroup>
          )}
        </BranchOperatorPanel>
      </div>
    </BranchOperatorPage>
  );
}
