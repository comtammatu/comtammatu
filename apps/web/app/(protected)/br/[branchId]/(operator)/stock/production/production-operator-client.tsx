/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: operator UI */
"use client";

import Link from "next/link";
import {
  ChefHat as IconChefHat,
  ChevronRight as IconChevronRight,
  Plus as IconPlus,
} from "lucide-react";
import { formatQuantity } from "@comtammatu/shared/format";
import { formatVNDate } from "@comtammatu/shared/time";
import { Button } from "@comtammatu/ui/components/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { AppEmptyState } from "@/components/surface";
import { StatusBadge } from "@/components/status-badge";
import {
  BranchOperatorPage,
  BranchOperatorPanel,
} from "@lib/branch-operator/components/branch-operator-page";
import type { ProductionRunRow } from "@/(protected)/inventory/production-run-actions";

interface ProductionOperatorClientProps {
  branchId: number;
  canCreateProduction: boolean;
  runs: ProductionRunRow[];
}

export function ProductionOperatorClient({
  branchId,
  canCreateProduction,
  runs,
}: ProductionOperatorClientProps) {
  const basePath = `/br/${branchId}/stock/production`;
  const drafts = runs.filter((run) => run.status === "draft");
  const inProgress = runs.filter((run) => run.status === "in_progress");
  const completed = runs.filter((run) => run.status === "completed");
  const workQueue = [...inProgress, ...drafts];

  return (
    <BranchOperatorPage
      title="Sản xuất"
      description="Lệnh đang làm và lệnh cần bắt đầu."
      action={
        canCreateProduction ? (
          <Button asChild size="touch">
            <Link href={`${basePath}/new`}>
              <IconPlus data-icon="inline-start" />
              Tạo lệnh
            </Link>
          </Button>
        ) : undefined
      }
    >
      <div className="flex min-w-0 touch-manipulation flex-col gap-3">
        {workQueue.length > 0 ? (
          <BranchOperatorPanel
            title="Việc cần làm"
            icon={IconChefHat}
            size="sm"
            contentClassName="gap-2"
          >
            <ProductionRunList runs={workQueue} basePath={basePath} />
          </BranchOperatorPanel>
        ) : completed.length > 0 ? (
          <BranchOperatorPanel
            title="Mẻ gần đây"
            icon={IconChefHat}
            size="sm"
            contentClassName="gap-2"
          >
            <ProductionRunList
              runs={completed.slice(0, 8)}
              basePath={basePath}
            />
          </BranchOperatorPanel>
        ) : (
          <AppEmptyState
            compact
            align="start"
            mode="no-data"
            title="Chưa có lệnh sản xuất"
            description="Tạo lệnh khi bắt đầu một mẻ mới."
            icon={<IconChefHat />}
          />
        )}
      </div>
    </BranchOperatorPage>
  );
}

function ProductionRunList({
  runs,
  basePath,
}: {
  runs: ProductionRunRow[];
  basePath: string;
}) {
  return (
    <ItemGroup className="gap-2" role="list">
      {runs.map((run) => (
        <Item
          key={run.id}
          role="listitem"
          asChild
          variant="outline"
          className="min-h-20 touch-manipulation"
        >
          <Link href={`${basePath}/${run.id}`}>
            <ItemContent className="min-w-0 gap-1">
              <ItemTitle className="line-clamp-none text-sm font-semibold">
                {run.finished_good_name}
              </ItemTitle>
              <ItemDescription className="line-clamp-none flex flex-wrap gap-x-2 gap-y-1">
                <span className="font-mono tabular-nums">
                  {run.production_number}
                </span>
                <span>{formatVNDate(run.created_at)}</span>
                <span>
                  {formatQuantity(run.planned_quantity)}{" "}
                  {run.entry_unit_name ?? ""}
                </span>
              </ItemDescription>
            </ItemContent>
            <ItemActions className="shrink-0">
              <StatusBadge domain="inventory" value={run.status} size="sm" />
              <IconChevronRight className="size-4 text-muted-foreground" />
            </ItemActions>
          </Link>
        </Item>
      ))}
    </ItemGroup>
  );
}
