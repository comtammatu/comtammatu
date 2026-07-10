"use client";

import { useState } from "react";
import type { FormEvent, TransitionStartFunction } from "react";
import { TriangleAlert as IconAlertTriangle } from "lucide-react";
import { formatPercent } from "@comtammatu/shared/format";
import { ACTIONS_VI } from "@comtammatu/shared/messages";
import { Alert, AlertDescription } from "@comtammatu/ui/components/alert";
import { Button } from "@comtammatu/ui/components/button";
import { Field, FieldGroup, FieldLabel } from "@comtammatu/ui/components/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@comtammatu/ui/components/sheet";
import { Textarea } from "@comtammatu/ui/components/textarea";
import { notify } from "@comtammatu/ui/lib/notify";
import { Combobox } from "@/components/form";
import {
  MoneyVndInput,
  QuantityInput,
} from "@/components/form/domain-number-inputs";
import { PhotoUploadInput } from "@/(protected)/inventory/_components/photo-upload-input";
import {
  getDefaultPurchaseUnit,
  getPurchaseUnitOptions,
} from "@/(protected)/inventory/_lib/purchase-units";
import { getReferenceCostForUnit } from "@/(protected)/inventory/_lib/reference-cost";
import type { IngredientRow } from "@/(protected)/inventory/_lib/types";
import { upsertGrnLine } from "@/(protected)/inventory/grn-actions";
import {
  createEditableGrnLine,
  deriveGrnVariance,
  GRN_DETAIL_COPY,
  type EditableGrnLine,
  type GrnDetail,
} from "@lib/inventory/grn-detail-model";

type BranchGrnReviewLineSheetProps = {
  grn: GrnDetail;
  line: EditableGrnLine | null;
  isPending: boolean;
  onClose: () => void;
  onPatch: (patch: Partial<EditableGrnLine>) => void;
  onDelete: (line: EditableGrnLine) => Promise<boolean>;
};

export function BranchGrnReviewLineSheet({
  grn,
  line,
  isPending,
  onClose,
  onPatch,
  onDelete,
}: BranchGrnReviewLineSheetProps) {
  const open = line != null;
  const variance = line ? deriveGrnVariance(line.cost, line.poUnitPrice) : null;
  const formattedVariance =
    variance != null ? formatPercent(variance, 2) : formatPercent(0, 2);
  const needsShortDeliveryAction =
    line != null &&
    line.poQuantity != null &&
    line.poQuantity > 0 &&
    line.actual <
      line.poQuantity * (1 - grn.qcSettings.qtyShortTolerancePct / 100);
  const needsRejectionDetails =
    line != null && (line.rejected > 0 || line.qualityStatus === "rejected");
  const needsPriceOverride =
    variance != null &&
    Math.abs(variance) > grn.qcSettings.priceVarianceWarnPct;
  const needsPriceEvidence =
    variance != null &&
    Math.abs(variance) > grn.qcSettings.priceVarianceReviewPct;

  function patchActual(value: string) {
    if (!line) return;
    const actual = Number(value) || 0;
    const rejected = line.rejected;
    onPatch({
      actual,
      qualityStatus:
        rejected > 0 && actual === 0
          ? "rejected"
          : rejected > 0
            ? "partial"
            : "accepted",
    });
  }

  function patchRejected(value: string) {
    if (!line) return;
    const rejected = Number(value) || 0;
    onPatch({
      rejected,
      qualityStatus:
        rejected > 0 && line.actual === 0
          ? "rejected"
          : rejected > 0
            ? "partial"
            : "accepted",
    });
  }

  async function handleDelete() {
    if (!line) return;
    const deletionStarted = await onDelete(line);
    if (deletionStarted) onClose();
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <SheetContent
        side="bottom"
        className="h-auto max-h-dvh-95 gap-1 overflow-y-auto bg-background p-0 text-foreground"
        showCloseButton={false}
      >
        {line ? (
          <>
            <SheetHeader>
              <SheetTitle className="text-lg font-semibold">
                {line.name}
              </SheetTitle>
              <p className="text-xs text-muted-foreground">
                {line.sku ? `${line.sku} · ` : ""}
                {line.unit}
              </p>
            </SheetHeader>

            <div className="p-4">
              <FieldGroup>
                <div className="grid grid-cols-2 gap-3">
                  <Field>
                    <FieldLabel htmlFor={`branch-grn-actual-${line.lineId}`}>
                      {GRN_DETAIL_COPY.line.actualLabel(line.unit)}
                    </FieldLabel>
                    <QuantityInput
                      id={`branch-grn-actual-${line.lineId}`}
                      value={String(line.actual)}
                      onValueChange={patchActual}
                      maxFractionDigits={3}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor={`branch-grn-rejected-${line.lineId}`}>
                      {GRN_DETAIL_COPY.line.rejectedLabel(line.unit)}
                    </FieldLabel>
                    <QuantityInput
                      id={`branch-grn-rejected-${line.lineId}`}
                      value={String(line.rejected)}
                      onValueChange={patchRejected}
                      maxFractionDigits={3}
                    />
                  </Field>
                </div>

                <Field>
                  <FieldLabel htmlFor={`branch-grn-cost-${line.lineId}`}>
                    {GRN_DETAIL_COPY.line.unitCostCurrency}
                  </FieldLabel>
                  <MoneyVndInput
                    id={`branch-grn-cost-${line.lineId}`}
                    value={String(line.cost)}
                    onValueChange={(value) =>
                      onPatch({ cost: Number(value) || 0 })
                    }
                  />
                </Field>

                {needsRejectionDetails ? (
                  <>
                    <Field>
                      <FieldLabel htmlFor={`branch-grn-reason-${line.lineId}`}>
                        {GRN_DETAIL_COPY.line.rejectReasonRequired}
                      </FieldLabel>
                      <Textarea
                        id={`branch-grn-reason-${line.lineId}`}
                        rows={2}
                        value={line.rejectionReason}
                        placeholder={
                          GRN_DETAIL_COPY.line.rejectReasonPlaceholder
                        }
                        onChange={(event) =>
                          onPatch({ rejectionReason: event.target.value })
                        }
                      />
                    </Field>
                    <Field>
                      <FieldLabel>
                        {GRN_DETAIL_COPY.line.proofPhotoLabel(
                          grn.qcSettings.rejectRequiresPhoto,
                        )}
                      </FieldLabel>
                      <PhotoUploadInput
                        tenantId={grn.tenantId}
                        folder={`grn/${grn.id}/rejected/${line.lineId}`}
                        value={line.rejectedPhotoUrl || null}
                        onChange={(url) =>
                          onPatch({ rejectedPhotoUrl: url ?? "" })
                        }
                      />
                    </Field>
                  </>
                ) : null}

                {needsPriceOverride ? (
                  <>
                    <Alert variant="destructive">
                      <IconAlertTriangle className="size-4" />
                      <AlertDescription>
                        {GRN_DETAIL_COPY.line.priceVariance}:{" "}
                        {formattedVariance}
                      </AlertDescription>
                    </Alert>
                    <Field>
                      <FieldLabel
                        htmlFor={`branch-grn-override-${line.lineId}`}
                      >
                        {GRN_DETAIL_COPY.line.priceOverrideRequired}
                      </FieldLabel>
                      <Textarea
                        id={`branch-grn-override-${line.lineId}`}
                        rows={2}
                        value={line.priceOverrideNote}
                        placeholder={
                          needsPriceEvidence
                            ? GRN_DETAIL_COPY.line.reviewVariancePlaceholder(
                                formattedVariance,
                                formatPercent(
                                  grn.qcSettings.priceVarianceReviewPct,
                                ),
                              )
                            : GRN_DETAIL_COPY.line.warnVariancePlaceholder(
                                formattedVariance,
                                formatPercent(
                                  grn.qcSettings.priceVarianceWarnPct,
                                ),
                              )
                        }
                        onChange={(event) =>
                          onPatch({ priceOverrideNote: event.target.value })
                        }
                      />
                    </Field>
                    {needsPriceEvidence ? (
                      <Field>
                        <FieldLabel>
                          {GRN_DETAIL_COPY.line.supplierInvoicePhoto}
                        </FieldLabel>
                        <PhotoUploadInput
                          tenantId={grn.tenantId}
                          folder={`grn/${grn.id}/price-override/${line.lineId}`}
                          value={line.priceOverridePhotoUrl || null}
                          onChange={(url) =>
                            onPatch({ priceOverridePhotoUrl: url ?? "" })
                          }
                        />
                      </Field>
                    ) : null}
                  </>
                ) : null}

                {needsShortDeliveryAction ? (
                  <Field>
                    <FieldLabel htmlFor={`branch-grn-short-${line.lineId}`}>
                      {GRN_DETAIL_COPY.line.shortageAction}
                    </FieldLabel>
                    <Select
                      value={line.shortDeliveryAction ?? ""}
                      onValueChange={(value) =>
                        onPatch({
                          shortDeliveryAction:
                            value as EditableGrnLine["shortDeliveryAction"],
                        })
                      }
                    >
                      <SelectTrigger
                        id={`branch-grn-short-${line.lineId}`}
                        size="touch"
                        className="w-full"
                      >
                        <SelectValue
                          placeholder={GRN_DETAIL_COPY.line.shortagePlaceholder}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="accept_and_close">
                          {GRN_DETAIL_COPY.line.acceptAndClose}
                        </SelectItem>
                        <SelectItem value="wait_backorder">
                          {GRN_DETAIL_COPY.line.waitBackorder}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                ) : null}
              </FieldGroup>
            </div>

            <SheetFooter>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="destructive"
                  size="touch-lg"
                  className="flex-1"
                  disabled={isPending}
                  onClick={() => void handleDelete()}
                >
                  {GRN_DETAIL_COPY.deleteLineAction}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="touch-lg"
                  className="flex-1"
                  onClick={onClose}
                >
                  {ACTIONS_VI.close}
                </Button>
              </div>
            </SheetFooter>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

type BranchGrnAddLineSheetProps = {
  grn: GrnDetail;
  ingredients: IngredientRow[];
  open: boolean;
  isPending: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (line: EditableGrnLine) => void;
  startTransition: TransitionStartFunction;
};

export function BranchGrnAddLineSheet({
  grn,
  ingredients,
  open,
  isPending,
  onOpenChange,
  onSaved,
  startTransition,
}: BranchGrnAddLineSheetProps) {
  const [ingredientId, setIngredientId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("");
  const [entryUnitId, setEntryUnitId] = useState<number | null>(null);
  const [unitCost, setUnitCost] = useState("");
  const selectedIngredient = ingredients.find(
    (ingredient) => ingredient.id === Number(ingredientId),
  );
  const purchaseUnitOptions = getPurchaseUnitOptions(selectedIngredient);

  function resetForm() {
    setIngredientId("");
    setQuantity("");
    setUnit("");
    setEntryUnitId(null);
    setUnitCost("");
  }

  function handleOpenChange(nextOpen: boolean) {
    onOpenChange(nextOpen);
    if (!nextOpen) resetForm();
  }

  function handleIngredientChange(value: string) {
    setIngredientId(value);
    const ingredient = ingredients.find((item) => item.id === Number(value));
    const defaultUnit = getDefaultPurchaseUnit(ingredient);
    const unitLabel =
      defaultUnit?.label ??
      ingredient?.units?.find((item) => item.is_base)?.unit_code ??
      "";
    const referenceCost = getReferenceCostForUnit(
      ingredient,
      defaultUnit?.unitId,
      unitLabel,
    );
    setUnit(unitLabel);
    setEntryUnitId(defaultUnit?.unitId ?? null);
    setUnitCost(referenceCost ? String(referenceCost.value) : "");
  }

  function handleUnitChange(value: string) {
    const option = purchaseUnitOptions.find(
      (item) => String(item.unitId) === value,
    );
    if (!option) return;
    const currentReferenceCost = getReferenceCostForUnit(
      selectedIngredient,
      entryUnitId,
      unit,
    );
    const nextReferenceCost = getReferenceCostForUnit(
      selectedIngredient,
      option.unitId,
      option.label,
    );
    setEntryUnitId(option.unitId);
    setUnit(option.label);
    if (
      unitCost.trim() === "" ||
      (currentReferenceCost &&
        Math.abs(Number(unitCost) - currentReferenceCost.value) < 0.01)
    ) {
      setUnitCost(nextReferenceCost ? String(nextReferenceCost.value) : "");
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const ingredient = selectedIngredient;
    const parsedQuantity = Number(quantity);
    const parsedUnitCost = unitCost.trim() ? Number(unitCost) : 0;
    if (!ingredient) {
      notify.error(GRN_DETAIL_COPY.validation.chooseIngredient);
      return;
    }
    if (!Number.isFinite(parsedQuantity) || parsedQuantity < 0) {
      notify.error(GRN_DETAIL_COPY.validation.invalidReceivedQuantity);
      return;
    }
    if (!unit.trim()) {
      notify.error(GRN_DETAIL_COPY.validation.unitRequired);
      return;
    }
    if (!Number.isFinite(parsedUnitCost) || parsedUnitCost < 0) {
      notify.error(GRN_DETAIL_COPY.validation.invalidUnitCost);
      return;
    }

    startTransition(async () => {
      const result = await upsertGrnLine({
        grnId: grn.id,
        ingredientId: ingredient.id,
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
      if (!result.success || !result.data) {
        notify.error(result.error ?? GRN_DETAIL_COPY.saveLineFailed);
        return;
      }

      onSaved(
        createEditableGrnLine({
          lineId: (result.data as { id: number }).id,
          ingredient,
          quantity: parsedQuantity,
          entryUnitId,
          unit: unit.trim(),
          unitCost: parsedUnitCost,
        }),
      );
      notify.success(GRN_DETAIL_COPY.addDialog.success);
      handleOpenChange(false);
    });
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="bottom"
        className="h-auto max-h-dvh-95 gap-1 overflow-y-auto bg-background p-0 text-foreground"
        showCloseButton={false}
      >
        <SheetHeader>
          <SheetTitle className="text-lg font-semibold">
            {GRN_DETAIL_COPY.addDialog.title}
          </SheetTitle>
        </SheetHeader>
        <form
          id="branch-grn-add-line-form"
          onSubmit={handleSubmit}
          className="p-4"
        >
          <FieldGroup>
            <Field>
              <FieldLabel>
                {GRN_DETAIL_COPY.addDialog.ingredientLabel}
              </FieldLabel>
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
                placeholder={GRN_DETAIL_COPY.addDialog.ingredientPlaceholder}
                searchPlaceholder={
                  GRN_DETAIL_COPY.addDialog.ingredientSearchPlaceholder
                }
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field>
                <FieldLabel htmlFor="branch-grn-add-quantity">
                  {GRN_DETAIL_COPY.addDialog.quantityLabel}
                </FieldLabel>
                <QuantityInput
                  id="branch-grn-add-quantity"
                  value={quantity}
                  onValueChange={setQuantity}
                  maxFractionDigits={3}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="branch-grn-add-cost">
                  {GRN_DETAIL_COPY.addDialog.unitCostLabel}
                </FieldLabel>
                <MoneyVndInput
                  id="branch-grn-add-cost"
                  value={unitCost}
                  onValueChange={setUnitCost}
                />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="branch-grn-add-unit">
                {GRN_DETAIL_COPY.addDialog.unitLabel}
              </FieldLabel>
              <Select
                value={entryUnitId != null ? String(entryUnitId) : ""}
                onValueChange={handleUnitChange}
                disabled={purchaseUnitOptions.length === 0}
              >
                <SelectTrigger
                  id="branch-grn-add-unit"
                  size="touch"
                  className="w-full"
                >
                  <SelectValue
                    placeholder={
                      purchaseUnitOptions.length > 0
                        ? GRN_DETAIL_COPY.addDialog.selectUnit
                        : unit || GRN_DETAIL_COPY.addDialog.selectUnit
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {purchaseUnitOptions.map((option) => (
                    <SelectItem
                      key={option.unitId}
                      value={String(option.unitId)}
                    >
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </FieldGroup>
        </form>
        <SheetFooter>
          <Button
            type="submit"
            form="branch-grn-add-line-form"
            size="touch-lg"
            className="w-full"
            disabled={isPending}
          >
            {GRN_DETAIL_COPY.addDialog.saveAction}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="touch-lg"
            className="w-full"
            onClick={() => handleOpenChange(false)}
          >
            {ACTIONS_VI.cancel}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
