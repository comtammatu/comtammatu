"use client";

import { useState } from "react";
import type { FormEvent, TransitionStartFunction } from "react";
import { Button } from "@comtammatu/ui/components/button";
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
import { AppDialog, Combobox, FormattedNumberInput } from "@/components/form";
import { upsertGrnLine } from "../../../grn-actions";
import {
  getDefaultPurchaseUnit,
  getPurchaseUnitOptions,
} from "../../../_lib/purchase-units";
import { getReferenceCostForUnit } from "../../../_lib/reference-cost";
import type { IngredientRow } from "../../../_lib/types";
import { ACTIONS_VI } from "@comtammatu/shared/messages";
import {
  GRN_DETAIL_COPY as grnCopy,
  type EditableGrnLine as EditableLine,
  type GrnDetail as GRNDetail,
} from "@lib/inventory/grn-detail-model";

const ADD_GRN_LINE_FORM_ID = "add-grn-line-form";

function isSameReferenceCost(
  currentCost: number | null,
  referenceCost: { value: number } | null,
): boolean {
  return (
    currentCost != null &&
    referenceCost != null &&
    Math.abs(currentCost - referenceCost.value) < 0.01
  );
}

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
  }

  function handleDialogOpenChange(open: boolean) {
    onOpenChange(open);
    if (!open) resetForm();
  }

  function handleIngredientChange(value: string) {
    setIngredientId(value);
    const ingredient = ingredients.find((item) => item.id === Number(value));
    const defaultUnit = getDefaultPurchaseUnit(ingredient);
    const unitLabel =
      defaultUnit?.label ??
      ingredient?.units?.find((u) => u.is_base)?.unit_code ??
      "";
    const referenceCost = getReferenceCostForUnit(
      ingredient,
      defaultUnit?.unitId,
      unitLabel,
    );
    setUnit(unitLabel);
    setEntryUnitId(defaultUnit?.unitId ?? null);
    setUnitCost(referenceCost != null ? String(referenceCost.value) : "");
  }

  function handleUnitChange(unitIdValue: string) {
    const opt = purchaseUnitOptions.find(
      (o) => String(o.unitId) === unitIdValue,
    );
    if (!opt) return;
    const currentReferenceCost = getReferenceCostForUnit(
      selectedIngredient,
      entryUnitId,
      unit,
    );
    const nextReferenceCost = getReferenceCostForUnit(
      selectedIngredient,
      opt.unitId,
      opt.label,
    );
    setEntryUnitId(Number(unitIdValue));
    setUnit(opt.label);
    if (
      unitCost.trim() === "" ||
      isSameReferenceCost(Number(unitCost), currentReferenceCost)
    ) {
      setUnitCost(
        nextReferenceCost != null ? String(nextReferenceCost.value) : "",
      );
    }
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
        entryUnitId,
        unitCost: parsedUnitCost,
        qualityStatus: "accepted",
        rejectedQuantity: 0,
        rejectionReason: null,
        rejectedPhotoUrl: null,
        priceOverrideNote: null,
        priceOverridePhotoUrl: null,
        shortDeliveryAction: null,
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
        entryUnitId,
        cost: parsedUnitCost,
        temp: null,
        qualityStatus: "accepted",
        status: "pass",
        dirty: false,
      });
      notify.success(grnCopy.addDialog.success);
      handleDialogOpenChange(false);
    });
  }

  return (
    <AppDialog
      open={isOpen}
      onOpenChange={handleDialogOpenChange}
      title={grnCopy.addDialog.title}
      contentClassName="sm:max-w-2xl"
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleDialogOpenChange(false)}
          >
            {ACTIONS_VI.cancel}
          </Button>
          <Button
            type="submit"
            form={ADD_GRN_LINE_FORM_ID}
            disabled={isPending}
          >
            <IconPlus className="size-4" />
            {grnCopy.addDialog.saveAction}
          </Button>
        </>
      }
    >
      <form
        id={ADD_GRN_LINE_FORM_ID}
        onSubmit={handleSubmit}
        className="flex flex-col gap-4"
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
                hint: getDefaultPurchaseUnit(ingredient)?.label ?? "",
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
            <Label htmlFor="grn-line-unit">{grnCopy.addDialog.unitLabel}</Label>
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
      </form>
    </AppDialog>
  );
}
