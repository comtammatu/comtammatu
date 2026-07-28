"use client";

import { useState, type TransitionStartFunction } from "react";
import { TriangleAlert as IconAlertTriangle } from "lucide-react";
import { formatPercent, formatVND } from "@comtammatu/shared/format";
import { ACTIONS_VI, FORM_VI } from "@comtammatu/shared/messages";
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
import { Combobox, PhotoUploadInput } from "@/components/form";
import { NumberPadSheet } from "@/components/form/number-pad-sheet";
import { formatQty } from "@lib/inventory/format";
import {
  getDefaultPurchaseUnit,
  getPurchaseUnitOptions,
} from "@lib/inventory/purchase-units";
import { getReferenceCostForUnit } from "@lib/inventory/reference-cost";
import type { IngredientRow } from "@lib/inventory/types";
import { upsertGrnLine } from "@/(protected)/inventory/grn-actions";
import { GRN_CREATE_COPY } from "@lib/inventory/grn-create-copy";
import type { GrnLineEditState } from "@lib/inventory/grn-create-model";
import {
  createEditableGrnLine,
  deriveGrnVariance,
  GRN_DETAIL_COPY,
  type EditableGrnLine,
  type GrnDetail,
} from "@lib/inventory/grn-detail-model";
import {
  GRN_BASELINE_REVIEW_PCT,
  deriveGrnQualityStatus,
  isGrnBaselineReviewRequired,
} from "@lib/inventory/grn-quality";
import { messages } from "@lib/messages";

const DEFAULT_VARIANCE_WARNING = 0.2;

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
  showPurchasePrice?: boolean;
};

export function BranchGrnCreateLineSheet({
  edit,
  onClose,
  onSave,
  onRemove,
  onPatch,
  onUnitChange,
  showPurchasePrice = true,
}: BranchGrnCreateLineSheetProps) {
  const [numericField, setNumericField] = useState<"quantity" | "cost" | null>(
    null,
  );
  const open = edit != null;
  const referenceCost = edit
    ? getReferenceCostForUnit(edit.ingredient, edit.entryUnitId, edit.unit)
    : null;
  const variance =
    showPurchasePrice &&
    edit?.unitCost != null &&
    edit.unitCost > 0 &&
    referenceCost != null &&
    referenceCost.value > 0
      ? (edit.unitCost - referenceCost.value) / referenceCost.value
      : null;
  const valid =
    edit != null &&
    edit.quantity > 0 &&
    (!showPurchasePrice ||
      (edit.unitCost != null && edit.unitCost > 0));
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
                {edit.ingredient.sku ? (
                  <p className="text-xs text-muted-foreground">
                    {edit.ingredient.sku}
                  </p>
                ) : null}
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

                  <div className="grid grid-cols-2 gap-3">
                    <NumberPadValueField
                      id="branch-grn-create-quantity"
                      label={FORM_VI.quantity}
                      value={
                        edit.quantity > 0 ? formatQty(edit.quantity) : null
                      }
                      emptyLabel="Nhập số"
                      onClick={() => setNumericField("quantity")}
                    />
                    {showPurchasePrice ? (
                      <NumberPadValueField
                        id="branch-grn-create-cost"
                        label={GRN_CREATE_COPY.unitCostTitle}
                        value={
                          edit.unitCost != null && edit.unitCost > 0
                            ? GRN_CREATE_COPY.moneyVnd(edit.unitCost)
                            : null
                        }
                        emptyLabel={GRN_CREATE_COPY.priceRequired}
                        onClick={() => setNumericField("cost")}
                      />
                    ) : null}
                  </div>

                  {showPurchasePrice && referenceCost ? (
                    <p
                      className={
                        variance != null &&
                        Math.abs(variance) > DEFAULT_VARIANCE_WARNING
                          ? "text-xs font-medium text-warning"
                          : "text-xs text-muted-foreground"
                      }
                    >
                      {GRN_CREATE_COPY.priorPriceLine(
                        referenceCost.value,
                        referenceCost.unit || edit.unit,
                        variance,
                      )}
                    </p>
                  ) : null}

                  {baseConversionPreview ? (
                    <p className="text-xs text-muted-foreground">
                      {baseConversionPreview}
                    </p>
                  ) : null}

                  {showPurchasePrice &&
                  variance != null &&
                  Math.abs(variance) > DEFAULT_VARIANCE_WARNING ? (
                    <Alert variant="destructive">
                      <IconAlertTriangle className="size-4" />
                      <AlertDescription>
                        {GRN_CREATE_COPY.varianceWarning(variance)}
                      </AlertDescription>
                    </Alert>
                  ) : null}

                  <Field>
                    <FieldLabel htmlFor="branch-grn-create-note">
                      {GRN_CREATE_COPY.optionalNote}
                    </FieldLabel>
                    <Textarea
                      id="branch-grn-create-note"
                      value={edit.note}
                      onChange={(event) =>
                        onPatch({ note: event.target.value })
                      }
                      rows={2}
                      maxLength={200}
                      placeholder={GRN_CREATE_COPY.notePlaceholder}
                    />
                  </Field>
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
        title={
          numericField === "quantity"
            ? `${FORM_VI.quantity} · ${edit?.unit ?? ""}`
            : GRN_CREATE_COPY.unitCostTitle
        }
        suffix={numericField === "quantity" ? edit?.unit : "₫"}
        initialValue={
          numericField === "quantity"
            ? (edit?.quantity ?? null)
            : (edit?.unitCost ?? null)
        }
        onConfirm={(value) => {
          onPatch(
            numericField === "quantity"
              ? { quantity: value }
              : { unitCost: value },
          );
        }}
        allowDecimal={numericField === "quantity"}
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
    "actual" | "rejected" | "cost" | null
  >(null);
  const baselineVariance = line?.baselineVariancePct ?? null;
  const variance = line
    ? (baselineVariance ?? deriveGrnVariance(line.cost, line.poUnitPrice))
    : null;
  const varianceLabel =
    baselineVariance != null
      ? GRN_DETAIL_COPY.line.baselineVariance(line?.baselineSampleN ?? 0)
      : GRN_DETAIL_COPY.line.priceVariance;
  const formattedVariance =
    variance != null ? formatPercent(variance, 2) : formatPercent(0, 2);
  const needsShortDeliveryAction =
    line != null &&
    line.poQuantity != null &&
    line.poQuantity > 0 &&
    line.actual <
      line.poQuantity * (1 - grn.qcSettings.qtyShortTolerancePct / 100);
  const needsRejectionDetails =
    line != null && line.qualityStatus !== "accepted";
  const needsPriceOverride =
    variance != null &&
    Math.abs(variance) >
      (baselineVariance != null
        ? GRN_BASELINE_REVIEW_PCT
        : grn.qcSettings.priceVarianceWarnPct);
  const needsPriceEvidence =
    baselineVariance != null
      ? isGrnBaselineReviewRequired(baselineVariance)
      : variance != null &&
        Math.abs(variance) > grn.qcSettings.priceVarianceReviewPct;

  function patchActual(actual: number) {
    if (!line) return;
    const rejected = line.qualityStatus === "rejected" ? actual : line.rejected;
    onPatch({
      actual,
      rejected,
      qualityStatus: deriveGrnQualityStatus(actual, rejected),
    });
  }

  function patchRejected(rejected: number) {
    if (!line) return;
    onPatch({
      rejected,
      qualityStatus: deriveGrnQualityStatus(line.actual, rejected),
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
                  <Field>
                    <FieldLabel htmlFor={`branch-grn-quality-${line.lineId}`}>
                      {GRN_DETAIL_COPY.line.qualityStatusLabel}
                    </FieldLabel>
                    <Select
                      value={line.qualityStatus}
                      onValueChange={(value) => {
                        const qualityStatus =
                          value as EditableGrnLine["qualityStatus"];
                        if (qualityStatus === "accepted") {
                          onPatch({
                            qualityStatus,
                            rejected: 0,
                            rejectionReason: "",
                            rejectedPhotoUrl: "",
                          });
                          return;
                        }
                        onPatch({
                          qualityStatus,
                          rejected:
                            qualityStatus === "rejected"
                              ? line.actual
                              : line.rejected > 0 && line.rejected < line.actual
                                ? line.rejected
                                : 0,
                        });
                      }}
                    >
                      <SelectTrigger
                        id={`branch-grn-quality-${line.lineId}`}
                        size="touch"
                        className="w-full"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="accepted" size="touch">
                          {GRN_DETAIL_COPY.line.qualityAccepted}
                        </SelectItem>
                        <SelectItem value="partial" size="touch">
                          {GRN_DETAIL_COPY.line.qualityPartial}
                        </SelectItem>
                        <SelectItem value="rejected" size="touch">
                          {GRN_DETAIL_COPY.line.qualityRejected}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
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
                  <NumberPadValueField
                    id={`branch-grn-cost-${line.lineId}`}
                    label={GRN_DETAIL_COPY.line.unitCostCurrency}
                    value={formatVND(line.cost)}
                    emptyLabel="Nhập số"
                    onClick={() => setNumericField("cost")}
                  />

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
                        />
                      </Field>
                    </>
                  ) : null}

                  {needsPriceOverride ? (
                    <>
                      <Alert variant="destructive">
                        <IconAlertTriangle className="size-4" />
                        <AlertDescription>
                          {varianceLabel}: {formattedVariance}
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
                            baselineVariance != null
                              ? GRN_DETAIL_COPY.line.baselineVariancePlaceholder(
                                  formattedVariance,
                                  line.baselineSampleN ?? 0,
                                )
                              : needsPriceEvidence
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
                            placeholder={
                              GRN_DETAIL_COPY.line.shortagePlaceholder
                            }
                          />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="accept_and_close" size="touch">
                            {GRN_DETAIL_COPY.line.acceptAndClose}
                          </SelectItem>
                          <SelectItem value="wait_backorder" size="touch">
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

      <NumberPadSheet
        open={numericField != null}
        onOpenChange={(next) => {
          if (!next) setNumericField(null);
        }}
        title={
          numericField === "actual"
            ? GRN_DETAIL_COPY.line.actualLabel(line?.unit ?? "")
            : numericField === "rejected"
              ? GRN_DETAIL_COPY.line.rejectedLabel(line?.unit ?? "")
              : GRN_DETAIL_COPY.line.unitCostCurrency
        }
        suffix={numericField === "cost" ? "₫" : line?.unit}
        initialValue={
          numericField === "actual"
            ? line?.actual
            : numericField === "rejected"
              ? line?.rejected
              : line?.cost
        }
        onConfirm={(value) => {
          if (numericField === "actual") patchActual(value);
          if (numericField === "rejected") patchRejected(value);
          if (numericField === "cost") onPatch({ cost: value });
        }}
        allowDecimal={numericField !== "cost"}
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
  const [unitCost, setUnitCost] = useState("");
  const [numericField, setNumericField] = useState<"quantity" | "cost" | null>(
    null,
  );
  const selectedIngredient = ingredients.find(
    (ingredient) => ingredient.id === Number(ingredientId),
  );
  const purchaseUnitOptions = getPurchaseUnitOptions(selectedIngredient);
  const referenceCost = getReferenceCostForUnit(
    selectedIngredient,
    entryUnitId,
    unit,
  );

  function resetForm() {
    setIngredientId("");
    setQuantity("");
    setUnit("");
    setEntryUnitId(null);
    setUnitCost("");
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
    setUnitCost("");
  }

  function handleUnitChange(value: string) {
    const option = purchaseUnitOptions.find(
      (item) => String(item.unitId) === value,
    );
    if (!option) return;
    setEntryUnitId(option.unitId);
    setUnit(option.label);
    setUnitCost("");
  }

  function handleSubmit() {
    const ingredient = selectedIngredient;
    const parsedQuantity = Number(quantity);
    const parsedUnitCost = unitCost.trim() ? Number(unitCost) : Number.NaN;
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
    if (!Number.isFinite(parsedUnitCost) || parsedUnitCost <= 0) {
      notify.error(GRN_CREATE_COPY.priceRequired);
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
          baselineVariancePct:
            (result.data as { baseline_variance_pct?: number | null })
              .baseline_variance_pct ?? null,
          baselineSampleN:
            (result.data as { baseline_sample_n?: number | null })
              .baseline_sample_n ?? null,
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
              <div className="grid grid-cols-2 gap-3">
                <NumberPadValueField
                  id="branch-grn-add-quantity"
                  label={GRN_DETAIL_COPY.addDialog.quantityLabel}
                  value={quantity === "" ? null : formatQty(Number(quantity))}
                  emptyLabel="Nhập số"
                  onClick={() => setNumericField("quantity")}
                />
                <NumberPadValueField
                  id="branch-grn-add-cost"
                  label={GRN_DETAIL_COPY.addDialog.unitCostLabel}
                  value={unitCost === "" ? null : formatVND(Number(unitCost))}
                  emptyLabel={GRN_CREATE_COPY.priceRequired}
                  onClick={() => setNumericField("cost")}
                />
              </div>
              {referenceCost ? (
                <p className="text-xs text-muted-foreground">
                  {GRN_CREATE_COPY.lastCostReference(
                    referenceCost.value,
                    referenceCost.unit || unit,
                  )}
                </p>
              ) : null}
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
        title={
          numericField === "quantity"
            ? GRN_DETAIL_COPY.addDialog.quantityLabel
            : GRN_DETAIL_COPY.addDialog.unitCostLabel
        }
        suffix={numericField === "quantity" ? unit : "₫"}
        initialValue={
          numericField === "quantity"
            ? quantity === ""
              ? null
              : Number(quantity)
            : unitCost === ""
              ? null
              : Number(unitCost)
        }
        onConfirm={(value) => {
          if (numericField === "quantity") setQuantity(String(value));
          if (numericField === "cost") setUnitCost(String(value));
        }}
        allowDecimal={numericField === "quantity"}
        maxFractionDigits={3}
      />
    </>
  );
}
