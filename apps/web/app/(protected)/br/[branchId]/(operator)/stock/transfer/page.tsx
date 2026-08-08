import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  ArrowLeft as IconArrowLeft,
  Plus as IconPlus,
} from "lucide-react";
import { ACTIONS_VI } from "@comtammatu/shared/messages";
import { Button } from "@comtammatu/ui/components/button";
import { AppDetailFooter } from "@/components/surface";
import { loadAuthState } from "@/_lib/auth";
import { resolveBranchContext } from "@/_lib/branch-context";
import { loadStockFulfillmentRows } from "@lib/inventory/stock-fulfillment-data";
import type { StockFulfillmentSiteKind } from "@lib/inventory/stock-fulfillment-projection";
import {
  BranchOperatorControlBar,
  BranchOperatorPage,
} from "@lib/branch-operator/components/branch-operator-page";
import { messages } from "@lib/messages";
import { BranchStockFulfillmentHubClient } from "./branch-stock-fulfillment-hub-client";
import { parseOperatorBranchId } from "../../../_lib/parse-branch-id";

const copy = messages.inventory.stockRequests.journey;

export default async function OperatorStockTransferPage({
  params,
  searchParams,
}: {
  params: Promise<{ branchId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
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

  // Store branch: fulfillment list lives on /stock (one work surface).
  if (isBranchKind) {
    const query = await searchParams;
    const paramsOut = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (typeof value === "string" && value.length > 0) {
        paramsOut.set(key, value);
      } else if (Array.isArray(value)) {
        const first = value[0];
        if (typeof first === "string" && first.length > 0) {
          paramsOut.set(key, first);
        }
      }
    }
    const qs = paramsOut.toString();
    redirect(qs ? `/br/${branchId}/stock?${qs}` : `/br/${branchId}/stock`);
  }

  const mode = "central" as const;
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

  const createAction = (
    <div className="flex flex-wrap gap-2">
      {canRequestCentralSupply ? (
        <Button
          size="touch"
          render={<Link href={`/br/${branchId}/stock/requests/new`} />}
        >
          <IconPlus data-icon="inline-start" />
          {copy.centralSupplyRequestAction}
        </Button>
      ) : null}
      {canCreateManualTransfer ? (
        <Button
          size="touch"
          variant="outline"
          render={<Link href={`/br/${branchId}/stock/transfer/new`} />}
        >
          <IconPlus data-icon="inline-start" />
          {copy.manualTransferAction}
        </Button>
      ) : null}
    </div>
  );

  const stockBasePath = `/br/${branchId}/stock`;

  return (
    <BranchOperatorPage
      title={copy.hubTitle}
      description={copy.centralHubDescription}
      hideHeaderOnMobile
      action={
        createAction ? (
          <div className="max-sm:hidden">{createAction}</div>
        ) : undefined
      }
    >
      <BranchOperatorControlBar className="sm:hidden">
        <Button
          variant="ghost"
          size="icon-touch"
          render={
            <Link href={stockBasePath} aria-label={ACTIONS_VI.back} />
          }
        >
          <IconArrowLeft />
        </Button>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{copy.hubTitle}</p>
          <p className="truncate text-xs text-muted-foreground">
            {copy.centralHubDescription}
          </p>
        </div>
      </BranchOperatorControlBar>
      <BranchStockFulfillmentHubClient
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
