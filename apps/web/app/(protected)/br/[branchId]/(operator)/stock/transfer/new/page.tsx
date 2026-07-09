import Link from "next/link";
import { ChevronLeft as IconChevronLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { Button } from "@comtammatu/ui/components/button";
import { BranchOperatorPage } from "@lib/branch-operator/components/branch-operator-page";
import { loadTransferCreatePageData } from "@lib/inventory/transfer-create-data";
import { messages } from "@lib/messages";
import { BranchTransferCreateClient } from "./branch-transfer-create-client";

interface PageProps {
  params: Promise<{ branchId: string }>;
}

export default async function OperatorNewTransferPage({ params }: PageProps) {
  const { branchId: rawBranchId } = await params;
  const branchId = Number(rawBranchId);
  if (!Number.isInteger(branchId) || branchId <= 0) notFound();

  const basePath = `/br/${branchId}/stock/transfer`;
  const data = await loadTransferCreatePageData({ routeBranchId: branchId });

  return (
    <BranchOperatorPage
      title={messages.inventory.operatorFlow.transferCreateTitle}
      description={messages.inventory.operatorFlow.transferCreateDescription}
      action={
        <Button variant="outline" size="touch" asChild>
          <Link href={basePath}>
            <IconChevronLeft data-icon="inline-start" />
            {messages.inventory.grn.back}
          </Link>
        </Button>
      }
    >
      <BranchTransferCreateClient {...data} basePath={basePath} />
    </BranchOperatorPage>
  );
}
