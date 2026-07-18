import Link from "next/link";
import { ChevronLeft as IconChevronLeft } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { AppPageHeader, DocumentFormFrame } from "@/components/surface";
import { loadTransferCreatePageData } from "@lib/inventory/transfer-create-data";
import { withTransferBranchQuery } from "@lib/inventory/transfer-create-model";
import { messages } from "@lib/messages";
import { CreateTransferForm } from "../create-transfer-dialog";

interface NewTransferPageContentProps {
  searchParams: Promise<{
    branchId?: string | string[];
  }>;
}

export async function NewTransferPageContent({
  searchParams,
}: NewTransferPageContentProps) {
  const params = await searchParams;
  const data = await loadTransferCreatePageData({
    queryBranchId: params.branchId,
  });
  const basePath = "/inventory/transfers";
  const backHref = withTransferBranchQuery(basePath, data.userBranchId);
  const backAction = (
    <Button variant="outline" size="sm" render={<Link href={backHref} />}>
      <IconChevronLeft data-icon="inline-start" />
      {messages.inventory.grn.back}
    </Button>
  );

  return (
    <DocumentFormFrame
      width="default"
      header={
        <AppPageHeader
          eyebrow={messages.inventory.shell.moduleName}
          title={messages.inventory.transfer.createTransferTitle}
          description={messages.inventory.transfer.transferDescription}
          actions={backAction}
        />
      }
    >
      <CreateTransferForm {...data} basePath={basePath} />
    </DocumentFormFrame>
  );
}

export default async function NewTransferPage({
  searchParams,
}: NewTransferPageContentProps) {
  return <NewTransferPageContent searchParams={searchParams} />;
}
