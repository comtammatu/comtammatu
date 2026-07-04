"use client";

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
import { INVENTORY_VI } from "@comtammatu/shared/messages";
import { AppSection, KpiRow } from "@/components/surface";
import { KpiCard } from "@/components/kpi/kpi-card";
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
import type { UnitOption } from "./_lib/types";

interface ProductionStatsProps {
  orders: ProductionOrderRow[];
  readinessMessage: string | null;
  readinessState: ProductionReadinessState;
  productionBranchCount: number;
  finishedGoodCount: number;
  rawMaterialCount: number;
  recipeFinishedGoodCount: number;
  recipeLineCount: number;
  unitOptions: UnitOption[];
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
  unitOptions,
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
      ? INVENTORY_VI.productionActiveBranches(productionBranchCount)
      : INVENTORY_VI.productionNoBranchConfigured;
  const summaryItems = [
    {
      label: INVENTORY_VI.productionStatDraftLabel,
      value: totals.draft,
      description: INVENTORY_VI.productionStatDraftHint,
    },
    {
      label: INVENTORY_VI.productionStatCompletedLabel,
      value: totals.completed,
      description: INVENTORY_VI.productionStatCompletedHint,
    },
    {
      label: INVENTORY_VI.productionStatCancelledLabel,
      value: totals.cancelled,
      description: INVENTORY_VI.productionStatCancelledHint,
    },
    {
      label: INVENTORY_VI.productionRecipesMetricLabel,
      value: recipeFinishedGoodCount,
      description: INVENTORY_VI.ingredientLineCountBadge(recipeLineCount),
    },
    {
      label: INVENTORY_VI.productionStatCatalogLabel,
      value: finishedGoodCount + rawMaterialCount,
      description: INVENTORY_VI.productionStatCatalogHint(
        finishedGoodCount,
        rawMaterialCount,
      ),
    },
  ] as const;

  const recoveryMessage =
    readinessState === "missing-finished-good"
      ? canManageCatalog
        ? INVENTORY_VI.productionRecoveryMissingFinishedGood
        : INVENTORY_VI.productionRecoveryMissingFinishedGoodNoPerm
      : readinessState === "missing-raw-material"
        ? canManageCatalog
          ? INVENTORY_VI.productionRecoveryMissingRawMaterial
          : INVENTORY_VI.productionRecoveryMissingRawMaterialNoPerm
        : readinessState === "missing-recipe"
          ? canManageRecipes
            ? INVENTORY_VI.productionRecoveryMissingRecipe
            : INVENTORY_VI.productionRecoveryMissingRecipeNoPerm
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
        title={INVENTORY_VI.productionStatsTitle}
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
              {readinessReady
                ? INVENTORY_VI.productionReadyBadge
                : INVENTORY_VI.productionNeedsConfigBadge}
            </>
          ),
        }}
      >
        <KpiRow density="compact">
          {summaryItems.map((item) => (
            <KpiCard
              key={item.label}
              label={item.label}
              value={item.value}
              hint={item.description}
              density="compact"
            />
          ))}
        </KpiRow>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-background p-3">
          <div className="flex min-w-0 flex-col gap-1">
            <p className="text-sm font-medium">{activeProductionBranchCopy}</p>
            <p className="text-xs text-muted-foreground">
              {INVENTORY_VI.productionStandardFlowHint}
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
                {INVENTORY_VI.createFinishedGood}
              </Button>
            ) : null}
            {canManageCatalog && readinessState === "missing-raw-material" ? (
              <Button
                type="button"
                size="sm"
                onClick={() => setQuickRawIngredientDialogOpen(true)}
              >
                <IconPlus data-icon="inline-start" />
                {INVENTORY_VI.createRawIngredient}
              </Button>
            ) : null}
            {readinessState === "missing-recipe" && canManageRecipes ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={onOpenRecipes}
              >
                {INVENTORY_VI.openProductionRecipes}
              </Button>
            ) : readinessState !== "missing-recipe" && canManageCatalog ? (
              <Button type="button" size="sm" variant="outline" asChild>
                <Link href="/inventory/ingredients">
                  {INVENTORY_VI.openIngredientCatalog}
                </Link>
              </Button>
            ) : null}
          </div>
        )}
      </AppSection>
      <QuickFinishedGoodDialog
        open={quickFinishedGoodDialogOpen}
        onOpenChange={setQuickFinishedGoodDialogOpen}
        unitOptions={unitOptions}
        onCreated={handleFinishedGoodCreated}
      />
      <QuickRawIngredientDialog
        open={quickRawIngredientDialogOpen}
        onOpenChange={setQuickRawIngredientDialogOpen}
        unitOptions={unitOptions}
        onCreated={handleRawIngredientCreated}
      />
    </>
  );
}
