"use client";

import { useState } from "react";
import type { FormEvent, TransitionStartFunction } from "react";
import { Button } from "@comtammatu/ui/components/button";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@comtammatu/ui/components/sheet";
import { Input } from "@comtammatu/ui/components/input";
import { Label } from "@comtammatu/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { Plus as IconPlus } from "lucide-react";
import { notify } from "@comtammatu/ui/lib/notify";
import { Combobox } from "@/components/form";
import { FormattedNumberInput } from "../../../_components/formatted-number-input";
import { upsertGrnLine } from "../../../grn-actions";
import {
  getDefaultPurchaseUnit,
  getPurchaseUnitOptions,
} from "../../../_lib/purchase-units";
import type { IngredientRow } from "../../../page";
import { ACTIONS_VI } from "@comtammatu/shared/messages";
import {
  grnCopy,
  inventoryCommon,
  type EditableLine,
  type GRNDetail,
} from "./grn-detail-types";

export function AddGrnLineDialog({
  grn,
  ingredients,
  isOpen,
  isPending,
  onOpenChange,
  onSaved,
  startTransition,
}: {
  grn: GRNDetail;
  ingredients: IngredientRow[];
  isOpen: boolean;
  isPending: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (line: EditableLine) => void;
  startTransition: TransitionStartFunction;
}) {
  const [ingredientId, setIngredientId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("");
  const [entryUnitId, setEntryUnitId] = useState<number | null>(null);
  const [unitCost, setUnitCost] = useState("");
  const [batchNumber, setBatchNumber] = useState("");
  const [expiryDate, setExpiryDate] = useState("");

  const selectedIngredient = ingredients.find(
    (item) => item.id === Number(ingredientId),
  );
  const purchaseUnitOptions = getPurchaseUnitOptions(selectedIngredient);

  function resetForm() {
    setIngredientId("");
    setQuantity("");
    setUnit("");
    setEntryUnitId(null);
    setUnitCost("");
    setBatchNumber("");
    setExpiryDate("");
  }

  function handleIngredientChange(value: string) {
    setIngredientId(value);
    const ingredient = ingredients.find((item) => item.id === Number(value));
    const defaultUnit = getDefaultPurchaseUnit(ingredient);
    setUnit(
      defaultUnit?.code ?? ingredient?.purchase_unit ?? ingredient?.unit ?? "",
    );
    setEntryUnitId(defaultUnit?.unitId ?? null);
    setUnitCost(
      ingredient?.unit_cost != null ? String(Number(ingredient.unit_cost)) : "",
    );
  }

  function handleUnitChange(unitIdValue: string) {
    setEntryUnitId(Number(unitIdValue));
    const opt = purchaseUnitOptions.find(
      (o) => String(o.unitId) === unitIdValue,
    );
    if (opt) setUnit(opt.code);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsedIngredientId = Number(ingredientId);
    const parsedQuantity = Number(quantity);
    const parsedUnitCost = unitCost.trim() ? Number(unitCost) : 0;
    const ingredient = ingredients.find(
      (item) => item.id === parsedIngredientId,
    );

    if (!parsedIngredientId || !ingredient) {
      notify.error(grnCopy.validation.chooseIngredient);
      return;
    }
    if (!Number.isFinite(parsedQuantity) || parsedQuantity < 0) {
      notify.error(grnCopy.validation.invalidReceivedQuantity);
      return;
    }
    if (!unit.trim()) {
      notify.error(grnCopy.validation.unitRequired);
      return;
    }
    if (!Number.isFinite(parsedUnitCost) || parsedUnitCost < 0) {
      notify.error(grnCopy.validation.invalidUnitCost);
      return;
    }

    startTransition(async () => {
      const res = await upsertGrnLine({
        grnId: grn.id,
        ingredientId: parsedIngredientId,
        receivedQuantity: parsedQuantity,
        unit: unit.trim(),
        entryUnitId,
        unitCost: parsedUnitCost,
        qualityStatus: "accepted",
        rejectedQuantity: 0,
        rejectionReason: null,
        rejectedPhotoUrl: null,
        priceOverrideNote: null,
        priceOverridePhotoUrl: null,
        shortDeliveryAction: null,
        batchNumber: batchNumber.trim() || null,
        expiryDate: expiryDate || null,
      });
      if (!res.success || !res.data) {
        notify.error(res.error ?? grnCopy.saveLineFailed);
        return;
      }

      const row = res.data as { id: number };
      onSaved({
        lineId: row.id,
        ingredientId: parsedIngredientId,
        name: ingredient.name,
        sku: ingredient.sku ?? "",
        poQuantity: null,
        poUnitPrice: null,
        required: parsedQuantity,
        actual: parsedQuantity,
        accepted: parsedQuantity,
        rejected: 0,
        rejectionReason: "",
        rejectedPhotoUrl: "",
        priceOverrideNote: "",
        priceOverridePhotoUrl: "",
        priceVariancePct: null,
        requiresReview: false,
        shortDeliveryAction: null,
        unit: unit.trim(),
        cost: parsedUnitCost,
        lot: batchNumber.trim(),
        expiry: expiryDate,
        expiryDisplay: expiryDate || inventoryCommon.noValue,
        temp: null,
        qualityStatus: "accepted",
        status: "pass",
        dirty: false,
      });
      notify.success(grnCopy.addDialog.success);
      onOpenChange(false);
      resetForm();
    });
  }

  return (
    <Sheet
      open={isOpen}
      onOpenChange={(open) => {
        onOpenChange(open);
        if (!open) resetForm();
      }}
    >
      <SheetContent className="gap-0 overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{grnCopy.addDialog.title}</SheetTitle>
        </SheetHeader>
        <form
          onSubmit={handleSubmit}
          className="flex flex-1 flex-col gap-4 p-4"
        >
          <div className="flex flex-col gap-1.5">
            <Label>{grnCopy.addDialog.ingredientLabel}</Label>
            <Combobox
              value={ingredientId}
              onValueChange={handleIngredientChange}
              options={ingredients
                .filter((ingredient) => ingredient.is_active)
                .map((ingredient) => ({
                  value: String(ingredient.id),
                  label: ingredient.name,
                  hint: ingredient.purchase_unit ?? ingredient.unit,
                  keywords: [ingredient.sku ?? "", ingredient.category ?? ""],
                }))}
              placeholder={grnCopy.addDialog.ingredientPlaceholder}
              searchPlaceholder={grnCopy.addDialog.ingredientSearchPlaceholder}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="grn-line-qty">
                {grnCopy.addDialog.quantityLabel}
              </Label>
              <FormattedNumberInput
                id="grn-line-qty"
                value={quantity}
                onValueChange={setQuantity}
                maxFractionDigits={3}
                placeholder="0"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="grn-line-unit">
                {grnCopy.addDialog.unitLabel}
              </Label>
              {purchaseUnitOptions.length > 0 ? (
                <Select
                  value={entryUnitId != null ? String(entryUnitId) : ""}
                  onValueChange={handleUnitChange}
                >
                  <SelectTrigger id="grn-line-unit" aria-label={unit}>
                    <SelectValue placeholder={grnCopy.addDialog.selectUnit} />
                  </SelectTrigger>
                  <SelectContent>
                    {purchaseUnitOptions.map((o) => (
                      <SelectItem key={o.unitId} value={String(o.unitId)}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  id="grn-line-unit"
                  value={unit}
                  readOnly
                  aria-readonly="true"
                  placeholder="kg"
                />
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="grn-line-cost">
                {grnCopy.addDialog.unitCostLabel}
              </Label>
              <FormattedNumberInput
                id="grn-line-cost"
                value={unitCost}
                onValueChange={setUnitCost}
                maxFractionDigits={0}
                placeholder="0"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="grn-line-batch">
                {grnCopy.addDialog.batchLabel}
              </Label>
              <Input
                id="grn-line-batch"
                value={batchNumber}
                onChange={(event) => setBatchNumber(event.target.value)}
                placeholder={inventoryCommon.noValue}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="grn-line-expiry">
                {grnCopy.addDialog.expiryLabel}
              </Label>
              <Input
                id="grn-line-expiry"
                type="date"
                value={expiryDate}
                onChange={(event) => setExpiryDate(event.target.value)}
              />
            </div>
          </div>

          <SheetFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {ACTIONS_VI.cancel}
            </Button>
            <Button type="submit" disabled={isPending}>
              <IconPlus className="size-4" />
              {grnCopy.addDialog.saveAction}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
