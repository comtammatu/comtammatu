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
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@comtammatu/ui/components/sheet";
import { Textarea } from "@comtammatu/ui/components/textarea";
import { notify } from "@comtammatu/ui/lib/notify";
import { Combobox, PhotoUploadInput } from "@/components/form";
import { NumberPadSheet } from "@/components/form/number-pad-sheet";
import { formatQty } from "@lib/inventory/format";
import {
  getDefaultPurchaseUnit,
  getPurchaseUnitOptions,
} from "@lib/inventory/purchase-units";
import type { IngredientRow } from "@lib/inventory/types";
import { upsertGrnLine } from "@/(protected)/inventory/grn-actions";
import { GRN_CREATE_COPY } from "@lib/inventory/grn-create-copy";
import type { GrnLineEditState } from "@lib/inventory/grn-create-model";
import {
  createEditableGrnLine,
  GRN_DETAIL_COPY,
  type EditableGrnLine,
  type GrnDetail,
} from "@lib/inventory/grn-detail-model";
import { messages } from "@lib/messages";

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
  const valid = edit != null && edit.quantity > 0;
  const baseConversionPreview = edit ? buildBaseConversionPreview(edit) : null;

  return (
    <>
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
          {edit ? (
            <>
              <SheetHeader>
                <SheetTitle className="text-lg font-semibold">
                  {edit.ingredient.name}
                </SheetTitle>
                <p className="text-xs text-muted-foreground">
                  {edit.ingredient.sku ? `${edit.ingredient.sku} · ` : ""}
                  {GRN_CREATE_COPY.unitLabel(edit.unit)}
                </p>
              </SheetHeader>

              <div className="p-4">
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="branch-grn-create-unit">
                      {messages.inventory.grn.addDialog.unitLabel}
                    </FieldLabel>
                    <Select
                      value={
                        edit.entryUnitId != null ? String(edit.entryUnitId) : ""
                      }
                      onValueChange={(value) => {
                        const option = getPurchaseUnitOptions(
                          edit.ingredient,
                        ).find((item) => String(item.unitId) === value);
                        if (option) onUnitChange(option.unitId, option.label);
                      }}
                    >
                      <SelectTrigger
                        id="branch-grn-create-unit"
                        size="touch"
                        className="w-full"
                      >
                        <SelectValue
                          placeholder={
                            messages.inventory.grn.addDialog.selectUnit
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {getPurchaseUnitOptions(edit.ingredient).map(
                          (option) => (
                            <SelectItem
                              key={option.unitId}
                              value={String(option.unitId)}
                              size="touch"
                            >
                              {option.label}
                            </SelectItem>
                          ),
                        )}
                      </SelectContent>
                    </Select>
                  </Field>

                  <NumberPadValueField
                    id="branch-grn-create-quantity"
                    label={`${FORM_VI.quantity} (${edit.unit})`}
                    value={edit.quantity > 0 ? formatQty(edit.quantity) : null}
                    emptyLabel="Nhập số"
                    onClick={() => setNumericField("quantity")}
                  />

                  {baseConversionPreview ? (
                    <p className="text-xs text-muted-foreground">
                      {baseConversionPreview}
                    </p>
                  ) : null}
                </FieldGroup>
              </div>

              <SheetFooter>
                <Button
                  type="button"
                  size="touch-lg"
                  className="w-full"
                  onClick={onSave}
                  disabled={!valid}
                >
                  {edit.line ? "Cập nhật" : "Thêm vào phiếu"}
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
              </SheetFooter>
            </>
          ) : null}
        </SheetContent>
      </Sheet>

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
  const [numericField, setNumericField] = useState<
    "actual" | "rejected" | null
  >(null);
  const needsRejectionDetails = line != null && line.rejected > 0;

  function patchActual(actual: number) {
    if (!line) return;
    onPatch({
      actual,
      rejected: Math.min(line.rejected, actual),
    });
  }

  function patchRejected(rejected: number) {
    if (!line) return;
    onPatch({
      rejected: Math.min(line.actual, Math.max(0, rejected)),
    });
  }

  async function handleDelete() {
    if (!line) return;
    const deletionStarted = await onDelete(line);
    if (deletionStarted) onClose();
  }

  return (
    <>
      <Sheet
        open={line != null}
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
                    <NumberPadValueField
                      id={`branch-grn-actual-${line.lineId}`}
                      label={GRN_DETAIL_COPY.line.actualLabel(line.unit)}
                      value={formatQty(line.actual)}
                      emptyLabel="Nhập số"
                      onClick={() => setNumericField("actual")}
                    />
                    <NumberPadValueField
                      id={`branch-grn-rejected-${line.lineId}`}
                      label={GRN_DETAIL_COPY.line.rejectedLabel(line.unit)}
                      value={formatQty(line.rejected)}
                      emptyLabel="Nhập số"
                      onClick={() => setNumericField("rejected")}
                    />
                  </div>
                  {needsRejectionDetails ? (
                    <>
                      <Field>
                        <FieldLabel
                          htmlFor={`branch-grn-reason-${line.lineId}`}
                        >
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

      <NumberPadSheet
        open={numericField != null}
        onOpenChange={(next) => {
          if (!next) setNumericField(null);
        }}
        title={
          numericField === "rejected"
            ? GRN_DETAIL_COPY.line.rejectedLabel(line?.unit ?? "")
            : GRN_DETAIL_COPY.line.actualLabel(line?.unit ?? "")
        }
        suffix={line?.unit}
        initialValue={
          numericField === "rejected" ? line?.rejected : line?.actual
        }
        onConfirm={(value) => {
          if (numericField === "actual") patchActual(value);
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
      const result = await upsertGrnLine({
        grnId: grn.id,
        ingredientId: ingredient.id,
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
        }),
      );
      notify.success(GRN_DETAIL_COPY.addDialog.success);
      handleOpenChange(false);
    });
  }

  return (
    <>
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
          <div className="p-4">
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
                      keywords: [
                        ingredient.sku ?? "",
                        ingredient.category ?? "",
                      ],
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
                emptyLabel="Nhập số"
                onClick={() => setNumericField("quantity")}
              />
            </FieldGroup>
          </div>
          <SheetFooter>
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
          </SheetFooter>
        </SheetContent>
      </Sheet>

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
