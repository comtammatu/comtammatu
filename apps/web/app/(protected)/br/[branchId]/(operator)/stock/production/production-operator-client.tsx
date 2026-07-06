"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { TriangleAlert as IconAlertTriangle } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { confirm } from "@comtammatu/ui/components/confirm-dialog";
import { toast } from "@comtammatu/ui/components/sonner";
import { Spinner } from "@comtammatu/ui/components/spinner";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemGroup,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { NoteCallout } from "@comtammatu/ui/components/note-callout";
import { ACTIONS_VI, INVENTORY_VI } from "@comtammatu/shared/messages";
import { formatVNTime, getVNDateString } from "@comtammatu/shared/time";
import { messages } from "@lib/messages";
import { AppSection } from "@/components/surface";
import { OperatorFlowSteps } from "@/(protected)/inventory/_components/operator-flow-steps";
import {
  cancelProductionOrder,
  confirmProductionOrder,
} from "@/(protected)/inventory/production-actions";
import { ProductionOrderForm } from "@/(protected)/inventory/production-order-form";
import { ProductionShortageDialog } from "@/(protected)/inventory/production-order-list";
import {
  getProductionReadinessSummary,
  PRODUCTION_ERROR_CODES,
} from "@/(protected)/inventory/production-types";
import type {
  BranchOption,
  FinishedGoodOption,
  IngredientOption,
  ProductionOrderRow,
  ProductionRecipeRow,
  ProductionShortageRow,
} from "@/(protected)/inventory/production-types";

interface ProductionOperatorClientProps {
  productionBranches: BranchOption[];
  ingredients: IngredientOption[];
  finishedGoods: FinishedGoodOption[];
  orders: ProductionOrderRow[];
  recipes: ProductionRecipeRow[];
  canCreateProduction: boolean;
  canConfirmProduction: boolean;
  canManageRecipes: boolean;
  recipesHref: string;
}

type PendingAction = { id: number; action: "confirm" | "cancel" } | null;

function orderItemsSummary(order: ProductionOrderRow): string {
  return order.items
    .map((item) => `${item.finished_good_name} ${item.quantity} ${item.unit}`)
    .join(" · ");
}

export function ProductionOperatorClient({
  productionBranches,
  ingredients,
  finishedGoods,
  orders,
  recipes,
  canCreateProduction,
  canConfirmProduction,
  canManageRecipes,
  recipesHref,
}: ProductionOperatorClientProps) {
  const router = useRouter();
  const [pending, setPending] = React.useState<PendingAction>(null);
  const [shortageInfo, setShortageInfo] = React.useState<{
    productionNumber: string;
    rows: ProductionShortageRow[];
  } | null>(null);

  const {
    sortedFinishedGoods,
    readinessState,
    readinessMessage,
    actionsEnabled,
  } = React.useMemo(
    () =>
      getProductionReadinessSummary({
        productionBranches,
        ingredients,
        finishedGoods,
        recipes,
      }),
    [productionBranches, ingredients, finishedGoods, recipes],
  );

  const drafts = React.useMemo(
    () => orders.filter((order) => order.status === "draft"),
    [orders],
  );
  const doneToday = React.useMemo(() => {
    const today = getVNDateString();
    return orders.filter(
      (order) =>
        order.status === "completed" &&
        order.completed_at != null &&
        getVNDateString(order.completed_at) === today,
    );
  }, [orders]);
  const operatorFlow = messages.inventory.operatorFlow;
  const productionStep =
    readinessState != null
      ? 2
      : drafts.length > 0
        ? 3
        : doneToday.length > 0
          ? 4
          : 1;
  const showDraftsFirst = readinessState == null && drafts.length > 0;

  async function runOrderAction(
    order: ProductionOrderRow,
    action: "confirm" | "cancel",
  ) {
    const ok = await confirm({
      title:
        action === "confirm"
          ? INVENTORY_VI.productionConfirmPrompt(order.production_number)
          : INVENTORY_VI.productionCancelPrompt(order.production_number),
      variant: action === "cancel" ? "destructive" : "default",
    });
    if (!ok) return;
    setPending({ id: order.id, action });
    try {
      if (action === "confirm") {
        const result = await confirmProductionOrder(order.id);
        if (!result.success) {
          if (
            result.errorCode === PRODUCTION_ERROR_CODES.INSUFFICIENT_STOCK &&
            Array.isArray(result.meta?.shortages) &&
            result.meta.shortages.length > 0
          ) {
            setShortageInfo({
              productionNumber: order.production_number,
              rows: result.meta.shortages as ProductionShortageRow[],
            });
            toast.error(
              result.error ?? INVENTORY_VI.productionInsufficientStock,
            );
            return;
          }
          toast.error(result.error ?? INVENTORY_VI.productionConfirmFailed);
          return;
        }
        toast.success(INVENTORY_VI.productionOrderConfirmed);
      } else {
        const result = await cancelProductionOrder(order.id);
        if (!result.success) {
          toast.error(result.error ?? INVENTORY_VI.productionCancelFailed);
          return;
        }
        toast.success(INVENTORY_VI.productionOrderCancelled);
      }
      router.refresh();
    } finally {
      setPending(null);
    }
  }

  const createSection = (
    <AppSection
      title={INVENTORY_VI.productionOperatorCreateTitle}
      description={INVENTORY_VI.productionOperatorCreateHint}
      size="sm"
      badge={{
        children:
          readinessState == null
            ? INVENTORY_VI.productionReadyBadge
            : INVENTORY_VI.productionNeedsConfigBadge,
        variant: readinessState == null ? "success" : "warning",
      }}
    >
      <ProductionOrderForm
        productionBranches={productionBranches}
        finishedGoodsOptions={sortedFinishedGoods}
        actionsEnabled={actionsEnabled && canCreateProduction}
        triggerSize="touch-lg"
        triggerClassName="w-full"
      />

      {readinessState != null ? (
        <NoteCallout
          tone="warning"
          icon={<IconAlertTriangle className="size-4" />}
        >
          <span className="flex items-center gap-2">
            <span className="min-w-0 flex-1">{readinessMessage}</span>
            {canManageRecipes && readinessState === "missing-recipe" ? (
              <Link
                href={recipesHref}
                className="shrink-0 font-medium underline underline-offset-4"
              >
                {INVENTORY_VI.productionOperatorConfigLink}
              </Link>
            ) : null}
          </span>
        </NoteCallout>
      ) : null}
    </AppSection>
  );

  const draftsSection = (
    <AppSection
      title={INVENTORY_VI.productionOperatorDraftsTitle}
      badge={{ children: String(drafts.length), variant: "warning" }}
      size="sm"
    >
      <ItemGroup className="gap-2">
        {drafts.map((order) => {
          const isPendingConfirm =
            pending?.id === order.id && pending.action === "confirm";
          const isPendingCancel =
            pending?.id === order.id && pending.action === "cancel";
          const orderBusy = pending?.id === order.id;
          return (
            <Item
              key={order.id}
              variant="outline"
              size="sm"
              className="flex-col items-stretch gap-2 bg-card"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-sm font-semibold">
                  {order.production_number}
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatVNTime(order.created_at)}
                </span>
              </div>
              <p className="text-sm leading-snug">{orderItemsSummary(order)}</p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="touch"
                  className="flex-1"
                  disabled={
                    !canConfirmProduction || !actionsEnabled || orderBusy
                  }
                  onClick={() => runOrderAction(order, "confirm")}
                >
                  {isPendingConfirm ? <Spinner className="size-4" /> : null}
                  {ACTIONS_VI.confirm}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="touch"
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  disabled={orderBusy}
                  onClick={() => runOrderAction(order, "cancel")}
                >
                  {isPendingCancel ? <Spinner className="size-4" /> : null}
                  {ACTIONS_VI.cancel}
                </Button>
              </div>
            </Item>
          );
        })}
      </ItemGroup>
    </AppSection>
  );

  return (
    <div className="flex w-full flex-col gap-3">
      <OperatorFlowSteps
        title={operatorFlow.productionTitle}
        description={operatorFlow.productionDescription}
        steps={operatorFlow.productionSteps}
        currentStep={productionStep}
        tone={productionStep >= 4 ? "success" : "default"}
      />

      {showDraftsFirst ? draftsSection : createSection}
      {showDraftsFirst
        ? createSection
        : drafts.length > 0
          ? draftsSection
          : null}

      {doneToday.length > 0 ? (
        <AppSection
          title={INVENTORY_VI.productionOperatorDoneTodayTitle}
          badge={{ children: String(doneToday.length), variant: "secondary" }}
          size="sm"
        >
          <ItemGroup className="gap-2">
            {doneToday.map((order) => (
              <Item key={order.id} variant="outline" size="sm">
                <ItemContent className="min-w-0">
                  <ItemTitle className="font-mono text-xs font-semibold">
                    {order.production_number}
                  </ItemTitle>
                </ItemContent>
                <ItemActions className="text-xs text-muted-foreground">
                  {order.completed_at ? formatVNTime(order.completed_at) : ""}
                </ItemActions>
              </Item>
            ))}
          </ItemGroup>
        </AppSection>
      ) : null}

      {canManageRecipes ? (
        <div className="flex items-center justify-center">
          <Link
            href={recipesHref}
            className="text-sm text-muted-foreground underline underline-offset-4"
          >
            {INVENTORY_VI.productionOperatorRecipesLink}
          </Link>
        </div>
      ) : null}

      <ProductionShortageDialog
        info={shortageInfo}
        onClose={() => setShortageInfo(null)}
      />
    </div>
  );
}
