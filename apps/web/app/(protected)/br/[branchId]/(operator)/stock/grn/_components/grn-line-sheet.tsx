"use client";

import { useState, type TransitionStartFunction } from "react";
import { ACTIONS_VI, FORM_VI } from "@comtammatu/shared/messages";
import { Button } from "@comtammatu/ui/components/button";
import { Field, FieldGroup, FieldLabel } from "@comtammatu/ui/components/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";

import { Textarea } from "@comtammatu/ui/components/textarea";
import { notify } from "@comtammatu/ui/lib/notify";
import { Combobox, PhotoUploadInput } from "@/components/form";
import { NumberPadSheet } from "@/components/form/number-pad-sheet";
import { formatQty } from "@lib/inventory/format";
import {
  getDefaultPurchaseUnit,
  getPurchaseUnitOptions,
} from "@lib/inventory/purchase-units";
import { filterPurchasedIngredientRows } from "@lib/inventory/catalog-readiness";
import type { IngredientRow } from "@lib/inventory/types";
import { upsertGrnLine } from "@/(protected)/inventory/grn-actions";
import { GRN_CREATE_COPY } from "@lib/inventory/grn-create-copy";
import {
  resolveDefaultGrnSupplier,
  type GrnLineEditState,
} from "@lib/inventory/grn-create-model";
import {
  applyGrnLineEntryUnit,
  createEditableGrnLine,
  GRN_DETAIL_COPY,
  acceptedGrnQuantity,
  combinePackLooseQuantity,
  deliveredGrnQuantity,
  grnLineHasPackLoose,
  splitGrnAcceptedPackLoose,
  type EditableGrnLine,
  type GrnDetail,
} from "@lib/inventory/grn-detail-model";
import { messages } from "@lib/messages";
import { AppSheet } from "@/components/surface";


function NumberPadValueField({
  id,
  label,
  value,
  emptyLabel,
  onClick,
}: {
  id: string;
  label: string;
  value: string | null;
  emptyLabel: string;
  onClick: () => void;
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Button
        id={id}
        type="button"
        variant="outline"
        size="touch"
        className="w-full justify-between font-semibold tabular-nums"
        onClick={onClick}
      >
        <span className={value == null ? "text-muted-foreground" : undefined}>
          {value ?? emptyLabel}
        </span>
        <span className="text-xs font-normal text-muted-foreground">
          {ACTIONS_VI.edit}
        </span>
      </Button>
    </Field>
  );
}

function unitDisplay(unit: { unit_name?: string | null; unit_code: string }) {
  return unit.unit_name?.trim() || unit.unit_code;
}

function buildBaseConversionPreview(edit: GrnLineEditState): string | null {
  const baseUnit = edit.ingredient.units?.find((unit) => unit.is_base) ?? null;
  const entryUnit =
    edit.entryUnitId == null
      ? null
      : (edit.ingredient.units?.find(
          (unit) => unit.unit_id === edit.entryUnitId,
        ) ?? null);
  if (!baseUnit || !entryUnit || entryUnit.is_base) return null;

  const factor = Number(entryUnit.to_base_factor);
  if (!Number.isFinite(factor) || factor <= 0) {
    return GRN_CREATE_COPY.conversionMissing;
  }

  return GRN_CREATE_COPY.baseConversionPreview(
    formatQty(edit.quantity),
    unitDisplay(entryUnit),
    formatQty(edit.quantity * factor),
    unitDisplay(baseUnit),
  );
}

type BranchGrnCreateLineSheetProps = {
  edit: GrnLineEditState | null;
  onClose: () => void;
  onSave: () => void;
  onRemove: () => void;
  onPatch: (patch: Partial<GrnLineEditState>) => void;
  onUnitChange: (unitId: number, label: string) => void;
};

export function BranchGrnCreateLineSheet({
  edit,
  onClose,
  onSave,
  onRemove,
  onPatch,
  onUnitChange,
}: BranchGrnCreateLineSheetProps) {
  const [numericField, setNumericField] = useState<"quantity" | null>(null);
  const open = edit != null;
  const valid =
    edit != null && edit.quantity > 0 && edit.supplierId != null;
  const baseConversionPreview = edit ? buildBaseConversionPreview(edit) : null;
  const suppliers = edit?.ingredient.suppliers ?? [];
  const defaultSupplier = resolveDefaultGrnSupplier(suppliers);
  const showSupplierPicker = suppliers.length > 1;
  const lockedSupplier =
    !showSupplierPicker && defaultSupplier != null ? defaultSupplier : null;

  return (
    <>
      <AppSheet
        open={open}
        onOpenChange={(next) => {
          if (!next) onClose();
        }}
        title={edit?.ingredient.name ?? GRN_CREATE_COPY.editItem}
        description={
          edit
            ? `${edit.ingredient.sku ? `${edit.ingredient.sku} · ` : ""}${GRN_CREATE_COPY.unitLabel(edit.unit)}`
            : undefined
        }
        side="bottom"
        showCloseButton={false}
        contentClassName="h-auto max-h-dvh-95 gap-1 bg-background text-foreground"
        footer={
          edit ? (
            <>
              <Button
                type="button"
                size="touch-lg"
                className="w-full"
                onClick={onSave}
                disabled={!valid}
              >
                {edit.line
                  ? GRN_CREATE_COPY.updateLineOnReceipt
                  : GRN_CREATE_COPY.addLineToReceipt}
              </Button>
              <div className="flex items-center gap-2">
                {edit.line ? (
                  <Button
                    type="button"
                    variant="destructive"
                    size="touch-lg"
                    onClick={onRemove}
                    className="flex-1"
                  >
                    {ACTIONS_VI.delete}
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  size="touch-lg"
                  onClick={onClose}
                  className="flex-1"
                >
                  {ACTIONS_VI.close}
                </Button>
              </div>
            </>
          ) : null
        }
      >
        {edit ? (
          <FieldGroup>
            {showSupplierPicker ? (
              <Field>
                <FieldLabel htmlFor="branch-grn-create-supplier">
                  {GRN_CREATE_COPY.supplierLabel}
                </FieldLabel>
                <Select
                  value={
                    edit.supplierId != null ? String(edit.supplierId) : ""
                  }
                  onValueChange={(value) =>
                    onPatch({ supplierId: Number(value) || null })
                  }
                >
                  <SelectTrigger
                    id="branch-grn-create-supplier"
                    size="touch"
                    className="w-full"
                  >
                    <SelectValue
                      placeholder={GRN_CREATE_COPY.supplierSelectPlaceholder}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliers.map((supplier) => (
                      <SelectItem
                        key={supplier.id}
                        value={String(supplier.id)}
                        size="touch"
                      >
                        {supplier.isPreferred
                          ? `${supplier.name} · ${GRN_CREATE_COPY.preferredSupplierSuffix}`
                          : supplier.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            ) : lockedSupplier ? (
              <p className="text-sm">
                <span className="text-muted-foreground">
                  {GRN_CREATE_COPY.supplierLabel}{" "}
                </span>
                <span className="font-semibold">{lockedSupplier.name}</span>
              </p>
            ) : null}

            <Field>
              <FieldLabel htmlFor="branch-grn-create-unit">
                {messages.inventory.grn.addDialog.unitLabel}
              </FieldLabel>
              <Select
                value={
                  edit.entryUnitId != null ? String(edit.entryUnitId) : ""
                }
                onValueChange={(value) => {
                  const option = getPurchaseUnitOptions(edit.ingredient).find(
                    (item) => String(item.unitId) === value,
                  );
                  if (option) onUnitChange(option.unitId, option.label);
                }}
              >
                <SelectTrigger
                  id="branch-grn-create-unit"
                  size="touch"
                  className="w-full"
                >
                  <SelectValue
                    placeholder={messages.inventory.grn.addDialog.selectUnit}
                  />
                </SelectTrigger>
                <SelectContent>
                  {getPurchaseUnitOptions(edit.ingredient).map((option) => (
                    <SelectItem
                      key={option.unitId}
                      value={String(option.unitId)}
                      size="touch"
                    >
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <NumberPadValueField
              id="branch-grn-create-quantity"
              label={`${FORM_VI.quantity} (${edit.unit})`}
              value={edit.quantity > 0 ? formatQty(edit.quantity) : null}
              emptyLabel={messages.inventory.grn.quantityEmptyLabel}
              onClick={() => setNumericField("quantity")}
            />

            {baseConversionPreview ? (
              <p className="text-xs text-muted-foreground">
                {baseConversionPreview}
              </p>
            ) : null}
          </FieldGroup>
        ) : null}
      </AppSheet>

      <NumberPadSheet
        open={numericField != null}
        onOpenChange={(next) => {
          if (!next) setNumericField(null);
        }}
        title={FORM_VI.quantity}
        suffix={edit?.unit}
        initialValue={edit?.quantity}
        onConfirm={(value) => {
          onPatch({ quantity: value });
        }}
        maxFractionDigits={3}
      />
    </>
  );
}

type BranchGrnReviewLineSheetProps = {
  grn: GrnDetail;
  line: EditableGrnLine | null;
  ingredients: IngredientRow[];
  isPending: boolean;
  onClose: () => void;
  onPatch: (patch: Partial<EditableGrnLine>) => void;
  onDelete: (line: EditableGrnLine) => Promise<boolean>;
};

export function BranchGrnReviewLineSheet({
  grn,
  line,
  ingredients,
  isPending,
  onClose,
  onPatch,
  onDelete,
}: BranchGrnReviewLineSheetProps) {
  const [numericField, setNumericField] = useState<
    "pack" | "loose" | "accepted" | "rejected" | null
  >(null);
  const needsRejectionDetails = line != null && line.rejected > 0;
  const hasPackLoose = line != null && grnLineHasPackLoose(line);
  const packLooseSplit = line ? splitGrnAcceptedPackLoose(line) : null;
  const acceptedQuantity = line
    ? acceptedGrnQuantity(line.actual, line.rejected)
    : 0;
  const ingredient = line
    ? ingredients.find((item) => item.id === line.ingredientId)
    : undefined;
  const unitOptions = getPurchaseUnitOptions(ingredient);

  function commitAccepted(nextAccepted: number) {
    if (!line) return;
    onPatch({
      actual: deliveredGrnQuantity(Math.max(0, nextAccepted), line.rejected),
    });
  }

  function commitPackLoose(packQty: number, looseQty: number) {
    if (!line?.packUnit || !line.looseUnit) return;
    commitAccepted(
      combinePackLooseQuantity(
        packQty,
        looseQty,
        line.packUnit.toBaseFactor,
        line.looseUnit.toBaseFactor,
      ),
    );
  }

  function patchRejected(rejected: number) {
    if (!line) return;
    onPatch({
      actual: deliveredGrnQuantity(acceptedQuantity, Math.max(0, rejected)),
      rejected: Math.max(0, rejected),
    });
  }

  async function handleDelete() {
    if (!line) return;
    const deletionStarted = await onDelete(line);
    if (deletionStarted) onClose();
  }

  return (
    <>
      <AppSheet
        open={line != null}
        onOpenChange={(next) => {
          if (!next) onClose();
        }}
        title={line?.name ?? GRN_DETAIL_COPY.deleteLineAction}
        description={
          line
            ? `${line.sku ? `${line.sku} · ` : ""}${line.unit}`
            : undefined
        }
        side="bottom"
        showCloseButton={false}
        contentClassName="h-auto max-h-dvh-95 gap-1 bg-background text-foreground"
        footer={
          line ? (
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
          ) : null
        }
      >
        {line ? (
          <FieldGroup>
            <div className={hasPackLoose ? "grid gap-3" : "grid grid-cols-2 gap-3"}>
              {hasPackLoose && line.packUnit && line.looseUnit ? (
                <>
                  <NumberPadValueField
                    id={`branch-grn-pack-${line.lineId}`}
                    label={GRN_DETAIL_COPY.line.acceptedLabel(line.packUnit.label)}
                    value={formatQty(packLooseSplit?.packQty ?? 0)}
                    emptyLabel={messages.inventory.grn.quantityEmptyLabel}
                    onClick={() => setNumericField("pack")}
                  />
                  <NumberPadValueField
                    id={`branch-grn-loose-${line.lineId}`}
                    label={GRN_DETAIL_COPY.line.acceptedLabel(line.looseUnit.label)}
                    value={formatQty(packLooseSplit?.looseQty ?? 0)}
                    emptyLabel={messages.inventory.grn.quantityEmptyLabel}
                    onClick={() => setNumericField("loose")}
                  />
                </>
              ) : (
                <NumberPadValueField
                  id={`branch-grn-actual-${line.lineId}`}
                  label={GRN_DETAIL_COPY.line.acceptedLabel(line.unit)}
                  value={formatQty(acceptedQuantity)}
                  emptyLabel={messages.inventory.grn.quantityEmptyLabel}
                  onClick={() => setNumericField("accepted")}
                />
              )}
              <NumberPadValueField
                id={`branch-grn-rejected-${line.lineId}`}
                label={GRN_DETAIL_COPY.line.rejectedLabel(line.unit)}
                value={formatQty(line.rejected)}
                emptyLabel={messages.inventory.grn.quantityEmptyLabel}
                onClick={() => setNumericField("rejected")}
              />
              {unitOptions.length > 0 ? (
                <Field className={hasPackLoose ? undefined : "col-span-2"}>
                  <FieldLabel htmlFor={`branch-grn-unit-${line.lineId}`}>
                    {FORM_VI.unit}
                  </FieldLabel>
                  <Select
                    value={
                      line.entryUnitId != null ? String(line.entryUnitId) : ""
                    }
                    onValueChange={(value) => {
                      const next = applyGrnLineEntryUnit(
                        line,
                        ingredient?.units,
                        Number(value),
                      );
                      if (next) onPatch(next);
                    }}
                  >
                    <SelectTrigger
                      id={`branch-grn-unit-${line.lineId}`}
                      size="touch"
                      aria-label={FORM_VI.unit}
                    >
                      <SelectValue
                        placeholder={GRN_DETAIL_COPY.addDialog.selectUnit}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {unitOptions.map((option) => (
                        <SelectItem
                          key={option.unitId}
                          value={String(option.unitId)}
                          size="touch"
                        >
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              ) : line.unit ? (
                <p className="text-sm text-muted-foreground">{line.unit}</p>
              ) : null}
            </div>
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
                    placeholder={GRN_DETAIL_COPY.line.rejectReasonPlaceholder}
                    onChange={(event) =>
                      onPatch({ rejectionReason: event.target.value })
                    }
                  />
                </Field>
                <Field>
                  <FieldLabel>
                    {GRN_DETAIL_COPY.line.proofPhotoLabel(true)}
                  </FieldLabel>
                  <PhotoUploadInput
                    tenantId={grn.tenantId}
                    folder={`grn/${grn.id}/rejected/${line.lineId}`}
                    value={line.rejectedPhotoUrl || null}
                    onChange={(url) =>
                      onPatch({ rejectedPhotoUrl: url ?? "" })
                    }
                    acceptTypes="image"
                    allowPaste={false}
                  />
                </Field>
              </>
            ) : null}
          </FieldGroup>
        ) : null}
      </AppSheet>

      <NumberPadSheet
        open={numericField != null}
        onOpenChange={(next) => {
          if (!next) setNumericField(null);
        }}
        title={
          numericField === "rejected"
            ? GRN_DETAIL_COPY.line.rejectedLabel(line?.unit ?? "")
            : numericField === "pack"
              ? GRN_DETAIL_COPY.line.acceptedLabel(line?.packUnit?.label ?? "")
              : numericField === "loose"
                ? GRN_DETAIL_COPY.line.acceptedLabel(line?.looseUnit?.label ?? "")
                : GRN_DETAIL_COPY.line.acceptedLabel(line?.unit ?? "")
        }
        suffix={
          numericField === "pack"
            ? line?.packUnit?.label
            : numericField === "loose"
              ? line?.looseUnit?.label
              : line?.unit
        }
        initialValue={
          numericField === "rejected"
            ? line?.rejected
            : numericField === "pack"
              ? packLooseSplit?.packQty
              : numericField === "loose"
                ? packLooseSplit?.looseQty
                : acceptedQuantity
        }
        onConfirm={(value) => {
          if (numericField === "accepted") commitAccepted(value);
          if (numericField === "pack") {
            commitPackLoose(value, packLooseSplit?.looseQty ?? 0);
          }
          if (numericField === "loose") {
            commitPackLoose(packLooseSplit?.packQty ?? 0, value);
          }
          if (numericField === "rejected") patchRejected(value);
        }}
        maxFractionDigits={3}
      />
    </>
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
  const [numericField, setNumericField] = useState<"quantity" | null>(null);
  const selectedIngredient = ingredients.find(
    (ingredient) => ingredient.id === Number(ingredientId),
  );
  const purchaseUnitOptions = getPurchaseUnitOptions(selectedIngredient);

  function resetForm() {
    setIngredientId("");
    setQuantity("");
    setUnit("");
    setEntryUnitId(null);
    setNumericField(null);
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
    setUnit(unitLabel);
    setEntryUnitId(defaultUnit?.unitId ?? null);
  }

  function handleUnitChange(value: string) {
    const option = purchaseUnitOptions.find(
      (item) => String(item.unitId) === value,
    );
    if (!option) return;
    setEntryUnitId(option.unitId);
    setUnit(option.label);
  }

  function handleSubmit() {
    const ingredient = selectedIngredient;
    const parsedQuantity = Number(quantity);
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
    startTransition(async () => {
      const supplierId =
        grn.supplierId ?? grn.items[0]?.supplierId ?? null;
      const supplierName =
        supplierId != null
          ? (grn.items.find((item) => item.supplierId === supplierId)
              ?.supplierName ?? grn.supplier)
          : grn.supplier;
      if (supplierId == null) {
        notify.error(GRN_CREATE_COPY.toastChooseSupplier);
        return;
      }

      const result = await upsertGrnLine({
        grnId: grn.id,
        ingredientId: ingredient.id,
        supplierId,
        receivedQuantity: parsedQuantity,
        entryUnitId,
        rejectedQuantity: 0,
        rejectionReason: null,
        rejectedPhotoUrl: null,
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
          supplierId,
          supplierName,
        }),
      );
      notify.success(GRN_DETAIL_COPY.addDialog.success);
      handleOpenChange(false);
    });
  }

  return (
    <>
      <AppSheet
        open={open}
        onOpenChange={handleOpenChange}
        title={GRN_DETAIL_COPY.addDialog.title}
        side="bottom"
        showCloseButton={false}
        contentClassName="h-auto max-h-dvh-95 gap-1 bg-background text-foreground"
        footer={
          <>
            <Button
              type="button"
              size="touch-lg"
              className="w-full"
              disabled={isPending}
              onClick={handleSubmit}
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
          </>
        }
      >
        <FieldGroup>
          <Field>
            <FieldLabel>{GRN_DETAIL_COPY.addDialog.ingredientLabel}</FieldLabel>
            <Combobox
              value={ingredientId}
              onValueChange={handleIngredientChange}
              options={filterPurchasedIngredientRows(
                ingredients.filter((ingredient) => ingredient.is_active),
              ).map((ingredient) => ({
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
                    size="touch"
                  >
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <NumberPadValueField
            id="branch-grn-add-quantity"
            label={GRN_DETAIL_COPY.addDialog.quantityLabel}
            value={quantity === "" ? null : formatQty(Number(quantity))}
            emptyLabel={messages.inventory.grn.quantityEmptyLabel}
            onClick={() => setNumericField("quantity")}
          />
        </FieldGroup>
      </AppSheet>

      <NumberPadSheet
        open={numericField != null}
        onOpenChange={(next) => {
          if (!next) setNumericField(null);
        }}
        title={GRN_DETAIL_COPY.addDialog.quantityLabel}
        suffix={unit}
        initialValue={quantity === "" ? null : Number(quantity)}
        onConfirm={(value) => {
          setQuantity(String(value));
        }}
        maxFractionDigits={3}
      />
    </>
  );
}
