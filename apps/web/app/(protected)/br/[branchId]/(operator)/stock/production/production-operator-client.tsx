"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ChefHat as IconChefHat,
  ClipboardList as IconClipboardList,
  ListChecks as IconListChecks,
  Plus as IconPlus,
} from "lucide-react";
import { formatVNDate } from "@comtammatu/shared/time";
import { INVENTORY_VI } from "@comtammatu/shared/messages";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import {
  AppEmptyState,
  AppLinkCard,
  AppSection,
  LinkCardGrid,
} from "@/components/surface";
import { StatusBadge } from "@/components/status-badge";
import { OperatorFlowSteps } from "@/(protected)/inventory/_components/operator-flow-steps";
import { badgeVariantFromTone, orderStatusTone } from "@/(protected)/inventory/production-types";
import type { ProductionRunRow } from "@/(protected)/inventory/production-run-actions";
import { messages } from "@lib/messages";

const PRODUCTION_ORDERS_VIEW = "orders";
const PRODUCTION_RECIPES_VIEW = "recipes";

interface ProductionOperatorClientProps {
  branchId: number;
  canCreateProduction: boolean;
  canManageRecipes: boolean;
  finishedGoodsCount: number;
  rawIngredientsCount: number;
  recipesCount: number;
  runs: ProductionRunRow[];
}

export function ProductionOperatorClient({
  branchId,
  canCreateProduction,
  canManageRecipes,
  finishedGoodsCount,
  rawIngredientsCount,
  recipesCount,
  runs,
}: ProductionOperatorClientProps) {
  const searchParams = useSearchParams();
  const view = searchParams.get("view");
  const basePath = `/br/${branchId}/stock/production`;
  const operatorFlow = messages.inventory.operatorFlow;

  function buildViewHref(nextView: string) {
    return `${basePath}?view=${nextView}`;
  }

  const drafts = runs.filter((run) => run.status === "draft");
  const activeRuns = runs.filter(
    (run) => run.status !== "completed" && run.status !== "cancelled",
  );
  const showDraftsFirst = drafts.length > 0;

  const createSection = (
    <AppSection
      title={INVENTORY_VI.createProductionOrder}
      contentClassName="gap-3"
    >
      <p className="text-sm text-muted-foreground">
        {operatorFlow.productionDescription}
      </p>
      <Button
        asChild
        size="touch-lg"
        className="w-full"
        disabled={!canCreateProduction}
      >
        <Link href={`${basePath}/new`}>
          <IconPlus data-icon="inline-start" />
          {INVENTORY_VI.createOrderShort}
        </Link>
      </Button>
    </AppSection>
  );

  const draftsSection = (
    <ProductionRunSection
      title={INVENTORY_VI.productionDraftBadge(drafts.length)}
      runs={drafts}
      basePath={basePath}
      emptyTitle={INVENTORY_VI.productionOrdersEmptyTitle}
      emptyDescription={INVENTORY_VI.productionOrdersEmptyDescription}
    />
  );

  if (view === PRODUCTION_ORDERS_VIEW) {
    return (
      <div className="flex flex-col gap-3">
        <Button asChild variant="ghost" size="touch" className="self-start px-2">
          <Link href={basePath}>{INVENTORY_VI.productionBackToHub}</Link>
        </Button>
        <ProductionRunSection
          title={INVENTORY_VI.productionOrdersTab}
          runs={runs}
          basePath={basePath}
          emptyTitle={INVENTORY_VI.productionOrdersEmptyTitle}
          emptyDescription={INVENTORY_VI.productionOrdersEmptyDescription}
        />
      </div>
    );
  }

  if (view === PRODUCTION_RECIPES_VIEW) {
    return (
      <div className="flex flex-col gap-3">
        <Button asChild variant="ghost" size="touch" className="self-start px-2">
          <Link href={basePath}>{INVENTORY_VI.productionBackToHub}</Link>
        </Button>
        <LinkCardGrid>
          <AppLinkCard
            href={`${basePath}/recipes`}
            title={INVENTORY_VI.productionRecipesTab}
            description={INVENTORY_VI.productionRecipesCardDescription}
            icon={<IconClipboardList />}
            tone="primary"
            ctaLabel={INVENTORY_VI.productionOpenRecipes}
            metric={{
              value: recipesCount,
              label: INVENTORY_VI.productionRecipesMetricLabel,
            }}
          />
        </LinkCardGrid>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <OperatorFlowSteps
        title={operatorFlow.productionTitle}
        description={operatorFlow.productionDescription}
        steps={operatorFlow.productionSteps}
        currentStep={activeRuns.length > 0 ? 3 : 1}
        tone={activeRuns.length > 0 ? "warning" : "default"}
      />

      {showDraftsFirst ? draftsSection : createSection}
      {showDraftsFirst ? createSection : drafts.length > 0 ? draftsSection : null}

      <LinkCardGrid>
        <AppLinkCard
          href={buildViewHref(PRODUCTION_ORDERS_VIEW)}
          title={INVENTORY_VI.productionOrdersTab}
          description={INVENTORY_VI.productionOrdersCardDescription}
          badge={activeRuns.length > 0 ? INVENTORY_VI.productionDraftBadge(activeRuns.length) : undefined}
          badgeVariant={badgeVariantFromTone(activeRuns.length > 0 ? "warning" : "neutral")}
          icon={<IconListChecks />}
          ctaLabel={INVENTORY_VI.productionOpenOrders}
          metric={{
            value: runs.length,
            label: INVENTORY_VI.productionOrdersMetricLabel,
          }}
        />
        <AppLinkCard
          href={buildViewHref(PRODUCTION_RECIPES_VIEW)}
          title={INVENTORY_VI.productionRecipesTab}
          description={INVENTORY_VI.productionRecipesCardDescription}
          icon={<IconClipboardList />}
          tone="secondary"
          ctaLabel={INVENTORY_VI.productionOpenRecipes}
          disabled={!canManageRecipes}
          disabledReason={!canManageRecipes ? "Chưa có quyền sửa công thức." : undefined}
          metric={{
            value: recipesCount,
            label: INVENTORY_VI.productionRecipesMetricLabel,
          }}
        />
        <AppLinkCard
          href={`/br/${branchId}/stock/catalog/ingredients`}
          title={INVENTORY_VI.productionCatalogCardTitle}
          description={INVENTORY_VI.productionCatalogCardDescription}
          icon={<IconChefHat />}
          tone="info"
          ctaLabel={INVENTORY_VI.productionOpenCatalog}
          metric={{
            value: `${finishedGoodsCount}/${rawIngredientsCount}`,
            label: INVENTORY_VI.productionCatalogMetricLabel,
          }}
        />
      </LinkCardGrid>
    </div>
  );
}

function ProductionRunSection({
  title,
  runs,
  basePath,
  emptyTitle,
  emptyDescription,
}: {
  title: string;
  runs: ProductionRunRow[];
  basePath: string;
  emptyTitle: string;
  emptyDescription: string;
}) {
  return (
    <AppSection title={title} contentClassName="gap-2">
      {runs.length === 0 ? (
        <AppEmptyState
          mode="no-data"
          title={emptyTitle}
          description={emptyDescription}
          icon={<IconListChecks className="size-5" />}
        />
      ) : (
        <ItemGroup className="gap-2">
          {runs.map((run) => (
            <ProductionRunItem key={run.id} run={run} href={`${basePath}/${run.id}`} />
          ))}
        </ItemGroup>
      )}
    </AppSection>
  );
}

function ProductionRunItem({
  run,
  href,
}: {
  run: ProductionRunRow;
  href: string;
}) {
  const unit = run.entry_unit_name ?? "";

  return (
    <Item variant="outline" size="sm">
      <ItemContent className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <ItemTitle className="truncate">{run.finished_good_name}</ItemTitle>
          <Badge variant={badgeVariantFromTone(orderStatusTone(run.status))}>
            {run.production_number}
          </Badge>
        </div>
        <ItemDescription className="truncate">
          {formatVNDate(run.created_at)} · {run.planned_quantity} {unit}
        </ItemDescription>
        <div className="mt-1">
          <StatusBadge domain="inventory" value={run.status} />
        </div>
      </ItemContent>
      <ItemActions className="shrink-0">
        <Button asChild variant="outline" size="touch">
          <Link href={href}>{INVENTORY_VI.productionOpenOrders}</Link>
        </Button>
      </ItemActions>
    </Item>
  );
}
