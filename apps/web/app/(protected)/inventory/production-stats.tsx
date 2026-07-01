"use client";

/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: inventory production stats surface keeps operator copy inline */

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CircleAlert as IconCircleAlert,
  CircleCheck as IconCircleCheck,
  Factory as IconFactory,
  Plus as IconPlus,
} from "lucide-react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@comtammatu/ui/components/alert";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { AppSection } from "@/components/surface";
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
  productionBranchCount: number;
  finishedGoodCount: number;
  rawMaterialCount: number;
  recipeFinishedGoodCount: number;
  recipeLineCount: number;
  canManageCatalog: boolean;
  canManageRecipes: boolean;
  onOpenRecipes: () => void;
}

export function ProductionStats({
  orders,
  readinessMessage,
  readinessState,
  productionBranchCount,
  finishedGoodCount,
  rawMaterialCount,
  recipeFinishedGoodCount,
  recipeLineCount,
  canManageCatalog,
  canManageRecipes,
  onOpenRecipes,
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

  const readinessReady = readinessState === null;
  const activeProductionBranchCopy =
    productionBranchCount > 0
      ? `${productionBranchCount} bếp sản xuất đang hoạt động`
      : "Chưa có Bếp Trung Tâm được cấu hình";
  const summaryItems = [
    {
      label: "Lệnh nháp",
      value: totals.draft,
      description: "Cần chốt để ghi tiêu hao",
    },
    {
      label: "Đã hoàn tất",
      value: totals.completed,
      description: "Đã nhập thành phẩm",
    },
    {
      label: "Đã hủy",
      value: totals.cancelled,
      description: "Không ghi tồn kho",
    },
    {
      label: "BOM thành phẩm",
      value: recipeFinishedGoodCount,
      description: `${recipeLineCount} dòng nguyên liệu`,
    },
    {
      label: "Danh mục sẵn sàng",
      value: finishedGoodCount + rawMaterialCount,
      description: `${finishedGoodCount} TP / ${rawMaterialCount} NL`,
    },
  ] as const;

  const recoveryMessage =
    readinessState === "missing-finished-good"
      ? canManageCatalog
        ? "Tạo ít nhất một thành phẩm để mở BOM sản xuất, rồi quay lại lập lệnh."
        : "Cần đội quản trị danh mục tạo ít nhất một thành phẩm trước khi lập BOM và lệnh sản xuất."
      : readinessState === "missing-raw-material"
        ? canManageCatalog
          ? "Tạo nguyên liệu đầu vào để hoàn thiện BOM trước khi xác nhận sản xuất."
          : "Cần đội quản trị danh mục bổ sung nguyên liệu đầu vào trước khi hoàn thiện BOM sản xuất."
        : readinessState === "missing-recipe"
          ? canManageRecipes
            ? "Cấu hình ít nhất một BOM sản xuất trước khi xác nhận lệnh."
            : "Cần đội quản trị cấu hình BOM sản xuất trước khi chạy mẻ này."
          : null;

  function handleFinishedGoodCreated(_good: FinishedGoodOption) {
    router.refresh();
  }

  function handleRawIngredientCreated(_ingredient: RawIngredientOption) {
    router.refresh();
  }

  return (
    <>
      <AppSection
        title="Trạm điều phối sản xuất"
        icon={<IconFactory />}
        badge={{
          variant: readinessReady ? "success" : "warning",
          children: (
            <>
              {readinessReady ? (
                <IconCircleCheck data-icon="inline-start" />
              ) : (
                <IconCircleAlert data-icon="inline-start" />
              )}
              {readinessReady ? "Sẵn sàng" : "Cần cấu hình"}
            </>
          ),
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {summaryItems.map((item) => (
            <div
              key={item.label}
              className="flex min-h-24 flex-col justify-between rounded-md border bg-muted/30 p-3"
            >
              <div className="text-xs font-medium text-muted-foreground">
                {item.label}
              </div>
              <div className="text-2xl font-semibold tabular-nums">
                {item.value}
              </div>
              <div className="line-clamp-2 break-words text-xs text-muted-foreground">
                {item.description}
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-background p-3">
          <div className="flex min-w-0 flex-col gap-1">
            <p className="text-sm font-medium">{activeProductionBranchCopy}</p>
            <p className="text-xs text-muted-foreground">
              Quy trình chuẩn: nhận nguyên liệu, chốt BOM, xác nhận lệnh để trừ
              nguyên liệu và nhập thành phẩm.
            </p>
          </div>
          <Badge variant="outline">BTT</Badge>
        </div>

        {readinessMessage ? (
          <Alert className="border-warning/20 bg-warning/10">
            <IconCircleAlert />
            <AlertTitle>{readinessMessage}</AlertTitle>
            {recoveryMessage ? (
              <AlertDescription>{recoveryMessage}</AlertDescription>
            ) : null}
          </Alert>
        ) : null}

        {(readinessState === "missing-finished-good" ||
          readinessState === "missing-raw-material" ||
          readinessState === "missing-recipe") && (
          <div className="flex flex-wrap items-center gap-2">
            {canManageCatalog && readinessState === "missing-finished-good" ? (
              <Button
                type="button"
                size="sm"
                onClick={() => setQuickFinishedGoodDialogOpen(true)}
              >
                <IconPlus data-icon="inline-start" />
                Tạo thành phẩm
              </Button>
            ) : null}
            {canManageCatalog && readinessState === "missing-raw-material" ? (
              <Button
                type="button"
                size="sm"
                onClick={() => setQuickRawIngredientDialogOpen(true)}
              >
                <IconPlus data-icon="inline-start" />
                Tạo nguyên liệu
              </Button>
            ) : null}
            {readinessState === "missing-recipe" && canManageRecipes ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={onOpenRecipes}
              >
                Mở BOM sản xuất
              </Button>
            ) : readinessState !== "missing-recipe" && canManageCatalog ? (
              <Button type="button" size="sm" variant="outline" asChild>
                <Link href="/inventory/ingredients">Mở danh mục nguyên liệu</Link>
              </Button>
            ) : null}
          </div>
        )}
      </AppSection>
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
    </>
  );
}
