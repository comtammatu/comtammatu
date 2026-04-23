"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { IconPlus } from "@tabler/icons-react";
import { Button } from "@comtammatu/ui/components/button";
import { Card, CardContent } from "@comtammatu/ui/components/card";
import {
  QuickFinishedGoodDialog,
  QuickRawIngredientDialog,
} from "./production-quick-create-dialogs";
import type {
  FinishedGoodOption,
  ProductionOrderRow,
  ProductionReadinessState,
  RawIngredientOption,
} from "./production-types";

interface ProductionStatsProps {
  orders: ProductionOrderRow[];
  readinessMessage: string | null;
  readinessState: ProductionReadinessState;
  centralKitchenCount: number;
  canManageCatalog: boolean;
  canManageRecipes: boolean;
}

export function ProductionStats({
  orders,
  readinessMessage,
  readinessState,
  centralKitchenCount,
  canManageCatalog,
  canManageRecipes,
}: ProductionStatsProps) {
  const router = useRouter();
  const [quickFinishedGoodDialogOpen, setQuickFinishedGoodDialogOpen] =
    useState(false);
  const [quickRawIngredientDialogOpen, setQuickRawIngredientDialogOpen] =
    useState(false);
  const totals = useMemo(() => {
    const draft = orders.filter((order) => order.status === "draft").length;
    const completed = orders.filter(
      (order) => order.status === "completed",
    ).length;
    const cancelled = orders.filter(
      (order) => order.status === "cancelled",
    ).length;
    return { draft, completed, cancelled };
  }, [orders]);

  const recoveryMessage =
    readinessState === "missing-finished-good"
      ? canManageCatalog
        ? "Tạo ít nhất một thành phẩm để mở BOM sản xuất, rồi quay lại lập lệnh."
        : "Cần đội quản trị danh mục tạo ít nhất một thành phẩm trước khi bếp trung tâm lập BOM và lệnh sản xuất."
      : readinessState === "missing-raw-material"
        ? canManageCatalog
          ? "Tạo nguyên liệu đầu vào để hoàn thiện BOM trước khi xác nhận sản xuất."
          : "Cần đội quản trị danh mục bổ sung nguyên liệu đầu vào trước khi hoàn thiện BOM sản xuất."
        : readinessState === "missing-recipe"
          ? canManageRecipes
            ? "Cấu hình ít nhất một BOM sản xuất trước khi xác nhận lệnh."
            : "Cần đội quản trị cấu hình BOM sản xuất trước khi bếp trung tâm chạy mẻ này."
          : null;

  function handleFinishedGoodCreated(_good: FinishedGoodOption) {
    router.refresh();
  }

  function handleRawIngredientCreated(_ingredient: RawIngredientOption) {
    router.refresh();
  }

  return (
    <>
      {readinessMessage && (
        <Card className="border-warning/20 bg-warning/10">
          <CardContent className="space-y-3 px-4 py-5 text-sm text-foreground sm:px-5">
            <div className="space-y-1">
              <p>{readinessMessage}</p>
              {recoveryMessage ? (
                <p className="text-muted-foreground">{recoveryMessage}</p>
              ) : null}
            </div>

            {(readinessState === "missing-finished-good" ||
              readinessState === "missing-raw-material" ||
              readinessState === "missing-recipe") && (
              <div className="flex flex-wrap items-center gap-2">
                {canManageCatalog &&
                readinessState === "missing-finished-good" ? (
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => setQuickFinishedGoodDialogOpen(true)}
                  >
                    <IconPlus className="mr-2 size-4" />
                    Tạo thành phẩm
                  </Button>
                ) : null}
                {canManageCatalog &&
                readinessState === "missing-raw-material" ? (
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => setQuickRawIngredientDialogOpen(true)}
                  >
                    <IconPlus className="mr-2 size-4" />
                    Tạo nguyên liệu
                  </Button>
                ) : null}
                {readinessState === "missing-recipe" && canManageRecipes ? (
                  <Button type="button" size="sm" variant="outline" asChild>
                    <Link href="/inventory/production">Mở BOM sản xuất</Link>
                  </Button>
                ) : readinessState !== "missing-recipe" && canManageCatalog ? (
                  <Button type="button" size="sm" variant="outline" asChild>
                    <Link href="/inventory/ingredients">
                      Mở danh mục nguyên liệu
                    </Link>
                  </Button>
                ) : null}
              </div>
            )}
          </CardContent>
        </Card>
      )}
      <QuickFinishedGoodDialog
        open={quickFinishedGoodDialogOpen}
        onOpenChange={setQuickFinishedGoodDialogOpen}
        onCreated={handleFinishedGoodCreated}
      />
      <QuickRawIngredientDialog
        open={quickRawIngredientDialogOpen}
        onOpenChange={setQuickRawIngredientDialogOpen}
        onCreated={handleRawIngredientCreated}
      />
      <div className="grid gap-3 md:grid-cols-3">
        <Card>
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Lệnh nháp
            </p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">
              {totals.draft}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Đã hoàn tất
            </p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">
              {totals.completed}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Đã hủy
            </p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">
              {totals.cancelled}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl p-4">
        <div className="text-sm text-muted-foreground">
          {centralKitchenCount > 0
            ? `Có ${centralKitchenCount} bếp trung tâm đang hoạt động`
            : "Chưa có bếp trung tâm nào được cấu hình"}
        </div>
      </div>
    </>
  );
}
