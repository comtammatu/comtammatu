"use client";

import { useMemo, useState } from "react";
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
} from "@lib/inventory/purchase-units";
import type { IngredientRow } from "@lib/inventory/types";
import { ACTIONS_VI } from "@comtammatu/shared/messages";
import {
  createEditableGrnLine,
  GRN_DETAIL_COPY as grnCopy,
  uniqueGrnSuppliers,
  type EditableGrnLine as EditableLine,
  type GrnDetail as GRNDetail,
} from "@lib/inventory/grn-detail-model";
import { GRN_CREATE_COPY } from "@lib/inventory/grn-create-copy";

const ADD_GRN_LINE_FORM_ID = "add-grn-line-form";

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
  const supplierOptions = useMemo(() => {
    const options = uniqueGrnSuppliers(grn.items);
    if (
      grn.supplierId != null &&
      !options.some((item) => item.id === grn.supplierId)
    ) {
      options.push({
        id: grn.supplierId,
        name: grn.supplier,
      });
    }
    return options;
  }, [grn.items, grn.supplier, grn.supplierId]);

  const [ingredientId, setIngredientId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("");
  const [entryUnitId, setEntryUnitId] = useState<number | null>(null);
  const [supplierId, setSupplierId] = useState(() =>
    supplierOptions.length === 1 ? String(supplierOptions[0]!.id) : "",
  );

  const selectedIngredient = ingredients.find(
    (item) => item.id === Number(ingredientId),
  );
  const purchaseUnitOptions = getPurchaseUnitOptions(selectedIngredient);

  function resetForm() {
    setIngredientId("");
    setQuantity("");
    setUnit("");
    setEntryUnitId(null);
    setSupplierId(
      supplierOptions.length === 1 ? String(supplierOptions[0]!.id) : "",
    );
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
    setUnit(unitLabel);
    setEntryUnitId(defaultUnit?.unitId ?? null);
  }

  function handleUnitChange(unitIdValue: string) {
    const opt = purchaseUnitOptions.find(
      (o) => String(o.unitId) === unitIdValue,
    );
    if (!opt) return;
    setEntryUnitId(Number(unitIdValue));
    setUnit(opt.label);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsedIngredientId = Number(ingredientId);
    const parsedQuantity = Number(quantity);
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
    const parsedSupplierId = Number(supplierId);
    const supplier = supplierOptions.find(
      (item) => item.id === parsedSupplierId,
    );
    if (!parsedSupplierId || !supplier) {
      notify.error(GRN_CREATE_COPY.toastChooseSupplier);
      return;
    }

    startTransition(async () => {
      const res = await upsertGrnLine({
        grnId: grn.id,
        ingredientId: parsedIngredientId,
        supplierId: parsedSupplierId,
        receivedQuantity: parsedQuantity,
        entryUnitId,
        rejectedQuantity: 0,
        rejectionReason: null,
        rejectedPhotoUrl: null,
      });
      if (!res.success || !res.data) {
        notify.error(res.error ?? grnCopy.saveLineFailed);
        return;
      }

      const row = res.data as { id: number };
      onSaved(
        createEditableGrnLine({
          lineId: row.id,
          ingredient,
          quantity: parsedQuantity,
          entryUnitId,
          unit: unit.trim(),
          supplierId: supplier.id,
          supplierName: supplier.name,
        }),
      );
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

        {supplierOptions.length > 1 ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="grn-line-supplier">
              {GRN_CREATE_COPY.supplierLabel}
            </Label>
            <Select value={supplierId} onValueChange={setSupplierId}>
              <SelectTrigger id="grn-line-supplier">
                <SelectValue
                  placeholder={GRN_CREATE_COPY.supplierSelectPlaceholder}
                />
              </SelectTrigger>
              <SelectContent>
                {supplierOptions.map((supplier) => (
                  <SelectItem key={supplier.id} value={String(supplier.id)}>
                    {supplier.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : supplierOptions.length === 1 ? (
          <p className="text-sm">
            <span className="text-muted-foreground">
              {GRN_CREATE_COPY.supplierLabel}{" "}
            </span>
            <span className="font-semibold">{supplierOptions[0]!.name}</span>
          </p>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
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
                onChange={(event) => setUnit(event.target.value)}
                placeholder={grnCopy.addDialog.selectUnit}
              />
            )}
          </div>
        </div>
      </form>
    </AppDialog>
  );
}
