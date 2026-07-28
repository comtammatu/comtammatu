"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@comtammatu/ui/components/button";
import { Input } from "@comtammatu/ui/components/input";
import { Label } from "@comtammatu/ui/components/label";
import { toast } from "@comtammatu/ui/components/sonner";
import { AppSection } from "@/components/surface";
import { messages } from "@lib/messages";
import { addStockRequestLine } from "@/(protected)/inventory/stock-request-actions";

const copy = messages.inventory.stockRequests.branch.addLine;

interface AddStockRequestLineFormProps {
  branchId: number;
  requestId: number;
}

export function AddStockRequestLineForm({
  branchId,
  requestId,
}: AddStockRequestLineFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [ingredientId, setIngredientId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [entryUnitId, setEntryUnitId] = useState("");

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const parsedIngredientId = Number(ingredientId);
    const parsedQuantity = Number(quantity);
    const parsedEntryUnitId = Number(entryUnitId);

    if (
      !Number.isInteger(parsedIngredientId) ||
      parsedIngredientId <= 0
    ) {
      toast.error(copy.toastInvalidIngredient);
      return;
    }
    if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
      toast.error(copy.toastInvalidQuantity);
      return;
    }
    if (!Number.isInteger(parsedEntryUnitId) || parsedEntryUnitId <= 0) {
      toast.error(copy.toastInvalidUnit);
      return;
    }

    startTransition(async () => {
      const result = await addStockRequestLine({
        branchId,
        requestId,
        ingredientId: parsedIngredientId,
        entryUnitId: parsedEntryUnitId,
        quantity: parsedQuantity,
      });

      if (!result.success) {
        toast.error(result.error ?? copy.toastAddFailed);
        return;
      }

      toast.success(copy.toastAddSuccess);
      setIngredientId("");
      setQuantity("");
      setEntryUnitId("");
      router.refresh();
    });
  }

  return (
    <AppSection title={copy.title} className="mb-6">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="stock-request-ingredient-id">{copy.ingredientId}</Label>
            <Input
              id="stock-request-ingredient-id"
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              value={ingredientId}
              onChange={(event) => setIngredientId(event.target.value)}
              placeholder="VD: 12"
              disabled={isPending}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="stock-request-quantity">{copy.quantity}</Label>
            <Input
              id="stock-request-quantity"
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              placeholder="VD: 5"
              disabled={isPending}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="stock-request-entry-unit-id">{copy.entryUnitId}</Label>
            <Input
              id="stock-request-entry-unit-id"
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              value={entryUnitId}
              onChange={(event) => setEntryUnitId(event.target.value)}
              placeholder="VD: 3"
              disabled={isPending}
              required
            />
          </div>
        </div>
        <Button type="submit" size="touch" disabled={isPending} className="w-full">
          {isPending ? copy.submitting : copy.submit}
        </Button>
      </form>
    </AppSection>
  );
}
