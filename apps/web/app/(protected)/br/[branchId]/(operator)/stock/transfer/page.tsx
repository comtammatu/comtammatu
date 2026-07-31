import Link from "next/link";
import { notFound } from "next/navigation";
import { Plus as IconPlus } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { AppDetailFooter } from "@/components/surface";
import { loadAuthState } from "@/_lib/auth";
import { resolveBranchContext } from "@/_lib/branch-context";
import { loadStockFulfillmentRows } from "@lib/inventory/stock-fulfillment-data";
import type { StockFulfillmentSiteKind } from "@lib/inventory/stock-fulfillment-projection";
import { BranchOperatorPage } from "@lib/branch-operator/components/branch-operator-page";
import { messages } from "@lib/messages";
import { StockFulfillmentHubClient } from "@/(protected)/inventory/transfers/stock-fulfillment-hub-client";
import { parseOperatorBranchId } from "../../../_lib/parse-branch-id";

const copy = messages.inventory.stockRequests.journey;

export default async function OperatorStockTransferPage({
  params,
}: {
  params: Promise<{ branchId: string }>;
}) {
  const { branchId: rawBranchId } = await params;
  const branchId = parseOperatorBranchId(rawBranchId);
  if (branchId == null) notFound();

  const { supabase, claims } = await loadAuthState();
  const branchContext = await resolveBranchContext(supabase, claims, branchId);
  if (!branchContext) notFound();

  const kind = branchContext.branch.branch_kind;
  const isBranchKind = kind === "branch";
  const isCentralKind = kind === "central_supply" || kind === "central_kitchen";
  if (!isBranchKind && !isCentralKind) notFound();

  const mode = isBranchKind ? "branch" : "central";
  const scopeSiteKind = kind as StockFulfillmentSiteKind;
  const fulfillSiteKind =
    kind === "central_kitchen"
      ? "central_kitchen"
      : kind === "central_supply"
        ? "central_supply"
        : undefined;

  const rows = await loadStockFulfillmentRows({
    supabase,
    tenantId: claims.tenant_id,
    mode,
    branchId,
    fulfillSiteKind,
    scopeSiteKind,
    seeAllSources: claims.user_role === "owner",
  });

  const canRequestCentralSupply =
    kind === "central_kitchen" &&
    (claims.user_role === "owner" ||
      claims.user_role === "central_kitchen_lead");
  const canCreateManualTransfer =
    isCentralKind &&
    (claims.user_role === "owner" ||
      claims.user_role === "central_supply_ops" ||
      claims.user_role === "central_kitchen_lead");

  const createAction = isBranchKind ? (
    <Button render={<Link href={`/br/${branchId}/stock/requests/new`} />}>
      <IconPlus data-icon="inline-start" />
      {copy.requestAction}
    </Button>
  ) : (
    <div className="flex flex-wrap gap-2">
      {canRequestCentralSupply ? (
        <Button render={<Link href={`/br/${branchId}/stock/requests/new`} />}>
          <IconPlus data-icon="inline-start" />
          {copy.centralSupplyRequestAction}
        </Button>
      ) : null}
      {canCreateManualTransfer ? (
        <Button
          variant="outline"
          render={<Link href={`/br/${branchId}/stock/transfer/new`} />}
        >
          <IconPlus data-icon="inline-start" />
          {copy.manualTransferAction}
        </Button>
      ) : null}
    </div>
  );

  return (
    <BranchOperatorPage
      title={copy.hubTitle}
      description={
        isBranchKind ? copy.branchHubDescription : copy.centralHubDescription
      }
      action={
        createAction ? (
          <div className="max-sm:hidden">{createAction}</div>
        ) : undefined
      }
    >
      <StockFulfillmentHubClient
        rows={rows}
        mode={mode}
        branchId={branchId}
      />
      {createAction ? (
        <AppDetailFooter sticky className="sm:hidden" trailing={createAction} />
      ) : null}
    </BranchOperatorPage>
  );
}
