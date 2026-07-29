import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus as IconPlus } from "lucide-react";
import { STOCK_REQUEST_FULFILL_ROLES } from "@comtammatu/shared/auth";
import { Button } from "@comtammatu/ui/components/button";
import { AppPage, AppPageHeader } from "@/components/surface";
import { loadAuthState } from "@/_lib/auth";
import { resolveInventoryListScope } from "../_lib/inventory-scope";
import { loadStockFulfillmentRows } from "@lib/inventory/stock-fulfillment-data";
import { messages } from "@lib/messages";
import { StockFulfillmentHubClient } from "./stock-fulfillment-hub-client";

const copy = messages.inventory.stockRequests.journey;

export default async function TransfersPage({
  searchParams,
}: {
  searchParams: Promise<{
    branchId?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const { supabase, claims } = await loadAuthState();
  if (
    !STOCK_REQUEST_FULFILL_ROLES.includes(
      claims.user_role as (typeof STOCK_REQUEST_FULFILL_ROLES)[number],
    )
  ) {
    redirect("/inventory");
  }
  const scope = await resolveInventoryListScope(supabase, claims, {
    queryBranchId: params.branchId,
  });
  const actorKind =
    claims.user_role === "central_supply_ops"
      ? "central_supply"
      : claims.user_role === "central_kitchen_lead"
        ? "central_kitchen"
        : undefined;
  const branchId = scope.selectedBranchId;
  let rows;
  try {
    rows = await loadStockFulfillmentRows({
      supabase,
      tenantId: claims.tenant_id,
      branchId: branchId ?? undefined,
      fulfillSiteKind: actorKind,
    });
  } catch {
    throw new Error("inventory.transfers.load_failed");
  }
  const canCreateManualTransfer =
    claims.user_role === "owner" ||
    claims.user_role === "central_supply_ops" ||
    claims.user_role === "central_kitchen_lead";

  return (
    <AppPage width="xwide" density="compact">
      <AppPageHeader
        title={copy.hubTitle}
        description={copy.centralHubDescription}
        actions={
          canCreateManualTransfer ? (
            <Button
              variant="outline"
              render={
                <Link
                  href={`/inventory/transfers/new${branchId == null ? "" : `?branchId=${branchId}`}`}
                />
              }
            >
              <IconPlus data-icon="inline-start" />
              {copy.manualTransferAction}
            </Button>
          ) : null
        }
      />
      <StockFulfillmentHubClient
        rows={rows}
        mode="central"
        branchId={branchId}
      />
    </AppPage>
  );
}
