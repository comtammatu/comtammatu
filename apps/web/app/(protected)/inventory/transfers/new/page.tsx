import Link from "next/link";
import { Button } from "@comtammatu/ui/components/button";
import { AppPageHeader, DocumentFormFrame } from "@/components/surface";
import { loadTransferCreatePageData } from "@lib/inventory/transfer-create-data";
import { parseTransferCreateDirection } from "@lib/inventory/transfer-paths";
import { messages } from "@lib/messages";
import { CreateTransferForm } from "../create-transfer-dialog";

const copy = messages.inventory.stockRequests.journey;

export default async function NewTransferPage({
  searchParams,
}: {
  searchParams: Promise<{
    branch?: string | string[];
    direction?: string | string[];
    ingredientId?: string | string[];
    quantity?: string | string[];
    entryUnitId?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const data = await loadTransferCreatePageData({
    queryBranch: params.branch,
  });

  const ingredientIdRaw = Array.isArray(params.ingredientId)
    ? params.ingredientId[0]
    : params.ingredientId;
  const quantityRaw = Array.isArray(params.quantity)
    ? params.quantity[0]
    : params.quantity;
  const entryUnitIdRaw = Array.isArray(params.entryUnitId)
    ? params.entryUnitId[0]
    : params.entryUnitId;

  const parsedIngredientId = ingredientIdRaw ? Number(ingredientIdRaw) : undefined;
  const parsedQuantity = quantityRaw ? Number(quantityRaw) : undefined;
  const parsedEntryUnitId = entryUnitIdRaw ? Number(entryUnitIdRaw) : undefined;

  const initialPrefillLine =
    parsedIngredientId != null &&
    Number.isInteger(parsedIngredientId) &&
    parsedIngredientId > 0
      ? {
          ingredientId: parsedIngredientId,
          quantity:
            parsedQuantity != null &&
            Number.isFinite(parsedQuantity) &&
            parsedQuantity > 0
              ? parsedQuantity
              : undefined,
          entryUnitId:
            parsedEntryUnitId != null &&
            Number.isInteger(parsedEntryUnitId) &&
            parsedEntryUnitId > 0
              ? parsedEntryUnitId
              : undefined,
        }
      : undefined;

  return (
    <DocumentFormFrame
      width="wide"
      header={
        <AppPageHeader
          title={copy.manualTransferAction}
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
      <CreateTransferForm
        {...data}
        initialDirection={parseTransferCreateDirection(params.direction)}
        initialPrefillLine={initialPrefillLine}
      />
    </DocumentFormFrame>
  );
}
