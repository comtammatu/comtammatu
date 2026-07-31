import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Button } from "@comtammatu/ui/components/button";
import { loadAuthState } from "@/_lib/auth";
import { resolveBranchContext } from "@/_lib/branch-context";
import { BranchOperatorPage } from "@lib/branch-operator/components/branch-operator-page";
import { loadTransferCreatePageData } from "@lib/inventory/transfer-create-data";
import { messages } from "@lib/messages";
import { CreateTransferForm } from "@/(protected)/inventory/transfers/create-transfer-dialog";
import { parseOperatorBranchId } from "../../../../_lib/parse-branch-id";

const copy = messages.inventory.stockRequests.journey;

export default async function OperatorManualTransferNewPage({
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
  if (
    branchContext.branch.branch_kind !== "central_supply" &&
    branchContext.branch.branch_kind !== "central_kitchen"
  ) {
    redirect(`/br/${branchId}/stock/transfer`);
  }

  const data = await loadTransferCreatePageData({
    routeBranchId: branchId,
  });

  return (
    <BranchOperatorPage
      title={copy.manualTransferAction}
      description={copy.manualTransferDescription}
      hideHeaderOnMobile
      action={
        <Button
          variant="ghost"
          size="touch"
          render={<Link href={`/br/${branchId}/stock/transfer`} />}
        >
          {copy.back}
        </Button>
      }
    >
      <CreateTransferForm {...data} />
    </BranchOperatorPage>
  );
}
