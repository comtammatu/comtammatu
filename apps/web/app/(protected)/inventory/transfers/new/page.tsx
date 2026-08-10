import Link from "next/link";
import { Button } from "@comtammatu/ui/components/button";
import { AppPageHeader, DocumentFormFrame } from "@/components/surface";
import { loadTransferCreatePageData } from "@lib/inventory/transfer-create-data";
import { messages } from "@lib/messages";
import { CreateTransferForm } from "../create-transfer-dialog";

const copy = messages.inventory.stockRequests.journey;

export default async function NewTransferPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string | string[] }>;
}) {
  const params = await searchParams;
  const data = await loadTransferCreatePageData({
    queryBranch: params.branch,
  });

  return (
    <DocumentFormFrame
      width="wide"
      header={
        <AppPageHeader
          title={copy.manualTransferAction}
          description={copy.manualTransferDescription}
          actions={
            <Button
              variant="ghost"
              render={<Link href="/inventory/transfers" />}
            >
              {copy.back}
            </Button>
          }
        />
      }
    >
      <CreateTransferForm {...data} />
    </DocumentFormFrame>
  );
}
