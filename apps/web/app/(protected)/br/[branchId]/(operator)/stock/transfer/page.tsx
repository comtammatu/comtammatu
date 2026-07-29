import Link from "next/link";
import { notFound } from "next/navigation";
import { Plus as IconPlus } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { AppDetailFooter } from "@/components/surface";
import { loadAuthState } from "@/_lib/auth";
import { resolveBranchContext } from "@/_lib/branch-context";
import { loadStockFulfillmentRows } from "@lib/inventory/stock-fulfillment-data";
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
  if (!(await resolveBranchContext(supabase, claims, branchId))) notFound();

  const rows = await loadStockFulfillmentRows({
    supabase,
    tenantId: claims.tenant_id,
    branchId,
  });
  const createAction = (
    <Button render={<Link href={`/br/${branchId}/stock/requests/new`} />}>
      <IconPlus data-icon="inline-start" />
      {copy.requestAction}
    </Button>
  );

  return (
    <BranchOperatorPage
      title={copy.hubTitle}
      description={copy.branchHubDescription}
      action={<div className="max-sm:hidden">{createAction}</div>}
    >
      <StockFulfillmentHubClient
        rows={rows}
        mode="branch"
        branchId={branchId}
      />
      <AppDetailFooter sticky className="sm:hidden" trailing={createAction} />
    </BranchOperatorPage>
  );
}
