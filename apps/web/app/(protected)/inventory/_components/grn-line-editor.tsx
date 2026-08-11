"use client";

import type { ComponentProps, ReactNode } from "react";
import { ACTIONS_VI, FORM_VI } from "@comtammatu/shared/messages";
import { Button } from "@comtammatu/ui/components/button";
import { SectionLabel } from "@comtammatu/ui/components/section-label";
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
import { QuantityInput } from "@/components/form/domain-number-inputs";
import { FormField } from "@/components/form/form-field";
import { formatQty } from "@lib/inventory/format";
import {
  getPurchaseUnitOptions,
  type PurchaseUnitOption,
} from "@lib/inventory/purchase-units";
import type { IngredientUnitRow } from "@lib/inventory/types";
import { messages } from "@lib/messages";
import { GRN_CREATE_COPY } from "@lib/inventory/grn-create-copy";
import {
  resolveDefaultGrnSupplier,
  type GrnLineEditState,
} from "@lib/inventory/grn-create-model";

import {
  OWNER_SHELL_BREAKPOINT,
  useIsMobile,
} from "@comtammatu/ui/hooks/use-mobile";

type GrnLineEditorControlSize = Extract<
  ComponentProps<typeof Button>["size"],
  "field" | "touch"
>;

type GrnLineEditFieldsProps = {
  edit: GrnLineEditState;
  onPatch: (patch: Partial<GrnLineEditState>) => void;
  onUnitChange: (unitId: number, label: string) => void;
  controlSize?: GrnLineEditorControlSize;
};

function unitDisplay(unit: IngredientUnitRow): string {
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

export function GrnLineEditFields({
  edit,
  onPatch,
  onUnitChange,
  controlSize = "touch",
}: GrnLineEditFieldsProps) {
  const baseConversionPreview = buildBaseConversionPreview(edit);
  const suppliers = edit.ingredient.suppliers;
  const defaultSupplier = resolveDefaultGrnSupplier(suppliers);
  const showSupplierPicker = suppliers.length > 1;
  const lockedSupplier =
    !showSupplierPicker && defaultSupplier != null ? defaultSupplier : null;

  return (
    <div className="flex flex-col gap-3">
      {showSupplierPicker ? (
        <FormField
          controlId="grn-line-supplier"
          label={GRN_CREATE_COPY.supplierLabel}
        >
          <Select
            value={edit.supplierId != null ? String(edit.supplierId) : ""}
            onValueChange={(value) =>
              onPatch({ supplierId: Number(value) || null })
            }
          >
            <SelectTrigger
              id="grn-line-supplier"
              size={controlSize}
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
                  size={controlSize === "field" ? undefined : "touch"}
                >
                  {supplier.isPreferred
                    ? `${supplier.name} · ${GRN_CREATE_COPY.preferredSupplierSuffix}`
                    : supplier.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
      ) : lockedSupplier ? (
        <p className="text-sm">
          <span className="text-muted-foreground">
            {GRN_CREATE_COPY.supplierLabel}{" "}
          </span>
          <span className="font-semibold">{lockedSupplier.name}</span>
        </p>
      ) : null}

      <UnitField
        options={getPurchaseUnitOptions(edit.ingredient)}
        entryUnitId={edit.entryUnitId}
        onUnitChange={onUnitChange}
        controlSize={controlSize}
      />
      <LineValueField
        controlId="grn-line-quantity"
        label={FORM_VI.quantity}
        detail={edit.unit}
      >
        <QuantityInput
          id="grn-line-quantity"
          value={String(edit.quantity)}
          onValueChange={(value) => onPatch({ quantity: Number(value) || 0 })}
          maxFractionDigits={3}
          autoFocus
          onFocus={(event) => event.currentTarget.select()}
          className={
            controlSize === "field"
              ? "h-10"
              : "h-auto border-0 bg-transparent p-0 text-2xl font-semibold tabular-nums shadow-none ring-0 focus-visible:border-0 focus-visible:ring-0"
          }
        />
      </LineValueField>

      {baseConversionPreview ? (
        <p className="text-xs text-muted-foreground">{baseConversionPreview}</p>
      ) : null}
    </div>
  );
}

type GrnLineEditSheetProps = Omit<GrnLineEditFieldsProps, "edit"> & {
  edit: GrnLineEditState | null;
  onClose: () => void;
  onSave: () => void;
  onRemove: () => void;
};

export function GrnLineEditSheet({
  edit,
  onClose,
  onSave,
  onRemove,
  onPatch,
  onUnitChange,
  controlSize = "touch",
}: GrnLineEditSheetProps) {
  const isTouchLayout = useIsMobile(OWNER_SHELL_BREAKPOINT);
  const open = edit != null;
  const valid =
    edit != null && edit.quantity > 0 && edit.supplierId != null;

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <SheetContent
        side="bottom"
        className="h-auto max-h-dvh-95 gap-1 bg-background p-0 text-foreground"
        showCloseButton={false}
      >
        {edit ? (
          <>
            <SheetHeader>
              <SectionLabel density="dense">
                {edit.line ? GRN_CREATE_COPY.editItem : GRN_CREATE_COPY.addItem}
              </SectionLabel>
              <SheetTitle className="text-lg font-semibold">
                {edit.ingredient.name}
              </SheetTitle>
              <p className="text-xs text-muted-foreground">
                {edit.ingredient.sku ? `${edit.ingredient.sku} · ` : ""}
                {GRN_CREATE_COPY.unitLabel(edit.unit)}
              </p>
            </SheetHeader>

            <div className="p-4">
              <GrnLineEditFields
                edit={edit}
                onPatch={onPatch}
                onUnitChange={onUnitChange}
                controlSize={controlSize}
              />
            </div>

            <SheetFooter>
              <Button
                type="button"
                size={isTouchLayout ? "touch-lg" : "lg"}
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
                    size={isTouchLayout ? "touch-lg" : "lg"}
                    onClick={onRemove}
                    className="flex-1"
                  >
                    {ACTIONS_VI.delete}
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  size={isTouchLayout ? "touch-lg" : "lg"}
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
  );
}

function LineValueField({
  controlId,
  label,
  detail,
  children,
}: {
  controlId: string;
  label: string;
  detail: ReactNode;
  children: ReactNode;
}) {
  return (
    <FormField controlId={controlId} label={label} description={detail}>
      {children}
    </FormField>
  );
}

function UnitField({
  options,
  entryUnitId,
  onUnitChange,
  controlSize,
}: {
  options: PurchaseUnitOption[];
  entryUnitId: number | null;
  onUnitChange: (unitId: number, label: string) => void;
  controlSize: GrnLineEditorControlSize;
}) {
  return (
    <FormField
      controlId="grn-line-unit"
      label={messages.inventory.grn.addDialog.unitLabel}
    >
      {options.length > 0 ? (
        <Select
          value={entryUnitId != null ? String(entryUnitId) : ""}
          onValueChange={(value) => {
            const option = options.find(
              (item) => String(item.unitId) === value,
            );
            if (option) onUnitChange(option.unitId, option.label);
          }}
        >
          <SelectTrigger
            id="grn-line-unit"
            size={controlSize}
            className="w-full"
          >
            <SelectValue
              placeholder={messages.inventory.grn.addDialog.selectUnit}
            />
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem key={option.unitId} value={String(option.unitId)}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <Select disabled value="">
          <SelectTrigger
            id="grn-line-unit"
            size={controlSize}
            className="w-full"
          >
            <SelectValue
              placeholder={messages.inventory.grn.addDialog.selectUnit}
            />
          </SelectTrigger>
          <SelectContent />
        </Select>
      )}
    </FormField>
  );
}
