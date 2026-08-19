import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus as IconPlus } from "lucide-react";
import { STOCK_REQUEST_FULFILL_ROLES } from "@comtammatu/shared/auth";
import { Button } from "@comtammatu/ui/components/button";
import { AppPage, AppPageHeader } from "@/components/surface";
import { loadAuthState } from "@/_lib/auth";
import { resolveInventoryListScope } from "../_lib/inventory-scope";
import { loadStockFulfillmentRows } from "@lib/inventory/stock-fulfillment-data";
import { loadStockRequestFulfillmentDetail } from "@lib/inventory/stock-request-fulfillment-detail-data";
import { loadTransferDetailPageData } from "@lib/inventory/transfer-detail-data";
import { messages } from "@lib/messages";
import { StockFulfillmentHubClient } from "./stock-fulfillment-hub-client";

const copy = messages.inventory.stockRequests.journey;

export default async function TransfersPage({
  searchParams,
}: {
  searchParams: Promise<{
    branch?: string | string[];
    requestId?: string | string[];
    transferId?: string | string[];
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
    queryBranch: params.branch,
  });
  const actorKind =
    claims.user_role === "central_supply_ops"
      ? "central_supply"
      : claims.user_role === "central_kitchen_lead"
        ? "central_kitchen"
        : undefined;
  const branchId = scope.selectedBranchId;
  const { data: selectedBranch } =
    branchId == null
      ? { data: null }
      : await supabase
          .from("branches")
          .select("branch_kind")
          .eq("tenant_id", claims.tenant_id)
          .eq("id", branchId)
          .maybeSingle();
  const scopeSiteKind =
    selectedBranch?.branch_kind === "branch" ||
    selectedBranch?.branch_kind === "central_supply" ||
    selectedBranch?.branch_kind === "central_kitchen"
      ? selectedBranch.branch_kind
      : undefined;
  const requestId = Number(
    Array.isArray(params.requestId) ? params.requestId[0] : params.requestId,
  );
  const transferId = Number(
    Array.isArray(params.transferId) ? params.transferId[0] : params.transferId,
  );
  const selectedRequestPromise =
    Number.isInteger(requestId) && requestId > 0
      ? loadStockRequestFulfillmentDetail({
          supabase,
          claims,
          requestId,
        })
      : Promise.resolve(null);
  const selectedTransferPromise =
    Number.isInteger(transferId) && transferId > 0
      ? loadTransferDetailPageData({
          transferId,
          queryBranch: params.branch,
        })
      : Promise.resolve(null);
  let rows;
  try {
    rows = await loadStockFulfillmentRows({
      supabase,
      tenantId: claims.tenant_id,
      mode: "central",
      branchId: branchId ?? undefined,
      fulfillSiteKind: actorKind,
      scopeSiteKind,
      seeAllSources: claims.user_role === "owner",
    });
  } catch {
    throw new Error("inventory.transfers.load_failed");
  }
  const [selectedRequest, selectedTransfer] = await Promise.all([
    selectedRequestPromise,
    selectedTransferPromise,
  ]);
  const canCreateManualTransfer =
    claims.user_role === "owner" ||
    claims.user_role === "central_supply_ops" ||
    claims.user_role === "central_kitchen_lead";
  const writeRequiresSitePick = scope.scopeMode === "all" || branchId == null;
  const sitePickTitle = messages.controlSurface.scopeControl.pickSite;
  const activeCount = rows.filter((row) => row.lifecycle === "active").length;
  const completedCount = rows.filter(
    (row) => row.lifecycle === "completed",
  ).length;

  return (
    <AppPage width="xwide" density="compact">
      <AppPageHeader
        title={copy.hubTitle}
        meta={
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="inline-flex items-center gap-1.5">
              <span>{copy.listMetaActive}</span>
              <span className="font-mono font-semibold tabular-nums text-foreground">
                {activeCount}
              </span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span>{copy.listMetaCompleted}</span>
              <span className="font-mono font-semibold tabular-nums text-foreground">
                {completedCount}
              </span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span>{copy.listMetaTotal}</span>
              <span className="font-mono font-semibold tabular-nums text-foreground">
                {rows.length}
              </span>
            </span>
          </div>
        }
        actions={
          canCreateManualTransfer ? (
            <div className="flex flex-wrap gap-2">
              {writeRequiresSitePick ? (
                <Button
                  type="button"
                  disabled
                  title={sitePickTitle}
                >
                  <IconPlus data-icon="inline-start" />
                  {copy.manualTransferAction}
                </Button>
              ) : (
                <Button
                  render={
                    <Link
                      href={`/inventory/transfers/new?branch=${branchId}&branch=${branchId}`}
                    />
                  }
                >
                  <IconPlus data-icon="inline-start" />
                  {copy.manualTransferAction}
                </Button>
              )}
            </div>
          ) : null
        }
      />
      <StockFulfillmentHubClient
        rows={rows}
        mode="central"
        branchId={branchId}
        selectedRequest={selectedRequest}
        selectedTransfer={selectedTransfer}
      />
    </AppPage>
  );
}
