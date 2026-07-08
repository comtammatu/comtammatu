import Link from "next/link";
import { ChevronLeft as IconChevronLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { loadAuthState } from "@/_lib/auth";
import { Button } from "@comtammatu/ui/components/button";
import { AppPageHeader, DocumentFormFrame } from "@/components/surface";
import { messages } from "@lib/messages";
import { fetchIngredients } from "../../ingredient-actions";
import { fetchBranchesForTransfer } from "../../transfer-actions";
import { resolveInventoryListScope } from "../../_lib/inventory-scope";
import { resolveDefaultInventoryLocation } from "../../_lib/inventory-location-compat";
import type { IngredientRow } from "../../page";
import {
  CreateTransferForm,
  type BranchForTransfer,
  type TransferIngredientOption,
} from "../create-transfer-dialog";

function withBranchQuery(path: string, branchId: number | null) {
  return branchId == null ? path : `${path}?branchId=${branchId}`;
}

function getTransferSourceBranchIds({
  branches,
  userBranchId,
  userRole,
}: {
  branches: BranchForTransfer[];
  userBranchId: number | null;
  userRole: string;
}) {
  if (userRole !== "branch_manager") {
    return userBranchId == null ? [] : [userBranchId];
  }

  return branches
    .filter((branch) => {
      if (!branch.is_active) return false;
      const kind = branch.branch_kind ?? "branch";
      return (
        branch.id === userBranchId ||
        kind === "central_supply" ||
        kind === "central_kitchen"
      );
    })
    .map((branch) => branch.id);
}

function toTransferIngredientOption(
  ingredient: IngredientRow,
): TransferIngredientOption {
  return {
    id: ingredient.id,
    name: ingredient.name,
    is_active: ingredient.is_active,
    units: ingredient.units,
  };
}

interface NewTransferPageContentProps {
  searchParams?: Promise<{
    branchId?: string | string[];
  }>;
  routeBranchId?: number;
  basePath?: string;
  embedded?: boolean;
}

export async function NewTransferPageContent({
  searchParams,
  routeBranchId,
  basePath = "/inventory/transfers",
  embedded = false,
}: NewTransferPageContentProps) {
  const params = searchParams ? await searchParams : {};
  const { supabase, claims } = await loadAuthState();
  const scope = await resolveInventoryListScope(supabase, claims, {
    routeBranchId,
    queryBranchId: params.branchId,
  });
  const userBranchId = scope.selectedBranchId;
  if (scope.outOfScope) notFound();

  const [brRes, ingRes] = await Promise.all([
    fetchBranchesForTransfer(),
    fetchIngredients(),
  ]);

  const branches: BranchForTransfer[] = brRes.success
    ? ((brRes.data ?? []) as BranchForTransfer[])
    : [];
  const ingredients: TransferIngredientOption[] = ingRes.success
    ? ((ingRes.data ?? []) as IngredientRow[]).map(toTransferIngredientOption)
    : [];
  const sourceBranchIds = getTransferSourceBranchIds({
    branches,
    userBranchId,
    userRole: claims.user_role,
  });
  const sourceLocations = await Promise.all(
    sourceBranchIds.map(async (branchId) => ({
      branchId,
      locationId: await resolveDefaultInventoryLocation(
        supabase,
        claims.tenant_id,
        branchId,
        "issue",
      ),
    })),
  );
  const locationByBranch = new Map(
    sourceLocations
      .filter(
        (item): item is { branchId: number; locationId: number } =>
          item.locationId != null,
      )
      .map((item) => [item.branchId, item.locationId] as const),
  );
  const sourceStockByBranch: Record<number, Record<number, number>> = {};
  if (locationByBranch.size > 0) {
    const { data: sourceStockLevels } = await supabase
      .from("stock_levels")
      .select("branch_id, location_id, ingredient_id, current_quantity")
      .eq("tenant_id", claims.tenant_id)
      .in("branch_id", [...locationByBranch.keys()])
      .in("location_id", [...locationByBranch.values()]);
    for (const row of sourceStockLevels ?? []) {
      if (row.location_id !== locationByBranch.get(row.branch_id)) continue;
      const branchStock = sourceStockByBranch[row.branch_id] ?? {};
      branchStock[row.ingredient_id] = Number(row.current_quantity ?? 0);
      sourceStockByBranch[row.branch_id] = branchStock;
    }
  }
  const title = messages.inventory.transfer.createTransferTitle;
  const backHref =
    routeBranchId != null ? basePath : withBranchQuery(basePath, userBranchId);
  const backAction = (
    <Button variant="outline" size="sm" asChild>
      <Link href={backHref}>
        <IconChevronLeft data-icon="inline-start" />
        {messages.inventory.grn.back}
      </Link>
    </Button>
  );

  if (embedded) {
    return (
      <div className="flex w-full flex-col gap-3">
        <CreateTransferForm
          branches={branches}
          ingredients={ingredients}
          sourceStockByBranch={sourceStockByBranch}
          userBranchId={userBranchId}
          userRole={claims.user_role}
          basePath={basePath}
          embedded
        />
      </div>
    );
  }

  return (
    <DocumentFormFrame
      width="default"
      header={
        <AppPageHeader
          eyebrow={messages.inventory.shell.moduleName}
          title={title}
          description={messages.inventory.transfer.transferDescription}
          actions={backAction}
        />
      }
    >
      <CreateTransferForm
        branches={branches}
        ingredients={ingredients}
        sourceStockByBranch={sourceStockByBranch}
        userBranchId={userBranchId}
        userRole={claims.user_role}
        basePath={basePath}
      />
    </DocumentFormFrame>
  );
}

export default async function NewTransferPage({
  searchParams,
}: {
  searchParams: Promise<{
    branchId?: string | string[];
  }>;
}) {
  return <NewTransferPageContent searchParams={searchParams} />;
}
