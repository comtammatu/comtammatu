"use client";

import { useState } from "react";
import { ACTIONS_VI, INVENTORY_VI } from "@comtammatu/shared/messages";
import {
  WASTE_REASON_LABELS_VI,
  getWasteReasonLabelVi,
} from "@comtammatu/shared/labels";
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
  Combobox,
  NumberPadSheet,
  PhotoUploadInput,
} from "@/components/form";
import { AppSheet } from "@/components/surface";
import { formatQty } from "@lib/inventory/format";
import {
  isAlwaysTier2WasteReason,
  isRiskyWasteReason,
} from "@lib/inventory/waste-tier-model";
import type {
  WasteFormContext,
  WasteLineState,
} from "@lib/inventory/waste-create-model";
import { messages } from "@lib/messages";

type WasteReason = keyof typeof WASTE_REASON_LABELS_VI;

const MANUAL_REASON_CODES = (
  Object.keys(WASTE_REASON_LABELS_VI) as WasteReason[]
).filter(
  (key) =>
    key !== "customer_return" &&
    key !== "kds_cancel_mid_cook" &&
    key !== "kds_cancel_after_cook",
);

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

export function WasteLineSheet({
  line,
  context,
  stockHint,
  isShortage,
  onClose,
  onPatch,
  onSelectIngredient,
  onRemove,
}: {
  line: WasteLineState | null;
  context: WasteFormContext;
  stockHint: string;
  isShortage: boolean;
  onClose: () => void;
  onPatch: (patch: Partial<WasteLineState>) => void;
  onSelectIngredient: (value: string) => void;
  onRemove: () => void;
}) {
  const copy = messages.inventory.waste.operational;
  const [quantityPadOpen, setQuantityPadOpen] = useState(false);
  const open = line != null;
  const ingredient =
    line?.ingredientId == null
      ? null
      : context.ingredients.find((item) => item.id === line.ingredientId);
  const quantityValue =
    line != null && line.quantity !== "" && Number(line.quantity) > 0
      ? formatQty(Number(line.quantity))
      : null;

  return (
    <>
      <AppSheet
        open={open}
        onOpenChange={(next) => {
          if (!next) onClose();
        }}
        title={ingredient?.name ?? copy.lineSheetTitle}
        description={
          ingredient
            ? `${copy.unitLabel}: ${line?.unit || ingredient.unit}`
            : messages.inventory.waste.chooseIngredient
        }
        side="bottom"
        showCloseButton={false}
        footer={
          line ? (
            <>
              <Button
                type="button"
                size="touch-lg"
                className="w-full"
                onClick={onClose}
              >
                {ACTIONS_VI.confirm}
              </Button>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="destructive"
                  size="touch-lg"
                  onClick={onRemove}
                  className="flex-1"
                >
                  {copy.removeLine}
                </Button>
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
        {line ? (
          <FieldGroup>
            <Field>
              <FieldLabel>{copy.ingredientLabel(1)}</FieldLabel>
              <Combobox
                value={
                  line.ingredientId == null ? "" : String(line.ingredientId)
                }
                onValueChange={onSelectIngredient}
                options={context.ingredients.map((item) => ({
                  value: String(item.id),
                  label: item.name,
                }))}
                size="touch"
              />
            </Field>
            <Field>
              <FieldLabel>{copy.unitLabel}</FieldLabel>
              <Select
                value={line.entryUnitId}
                onValueChange={(value) => {
                  const selected = ingredient?.issueUnits.find(
                    (item) => String(item.unitId) === value,
                  );
                  onPatch({
                    entryUnitId: value,
                    unit: selected?.label ?? "",
                  });
                }}
              >
                <SelectTrigger size="touch">
                  <SelectValue placeholder={copy.unitPlaceholder} />
                </SelectTrigger>
                <SelectContent>
                  {(ingredient?.issueUnits ?? []).map((item) => (
                    <SelectItem
                      key={item.unitId}
                      value={String(item.unitId)}
                      size="touch"
                    >
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <NumberPadValueField
              id="branch-waste-line-quantity"
              label={`${copy.quantityLabel}${stockHint}`}
              value={quantityValue}
              emptyLabel={copy.quantityPlaceholder}
              onClick={() => setQuantityPadOpen(true)}
            />
            {isShortage ? (
              <p className="text-xs text-destructive">{copy.lineShortageHint}</p>
            ) : null}
            <Field>
              <FieldLabel>{copy.reasonLabel}</FieldLabel>
              <Select
                value={line.reasonCode}
                onValueChange={(value) => onPatch({ reasonCode: value })}
              >
                <SelectTrigger size="touch">
                  <SelectValue placeholder={INVENTORY_VI.selectReason} />
                </SelectTrigger>
                <SelectContent>
                  {MANUAL_REASON_CODES.map((key) => {
                    const isAlwaysT2 = isAlwaysTier2WasteReason(key);
                    const isRisky = isRiskyWasteReason(key);
                    return (
                      <SelectItem key={key} value={key} size="touch">
                        {getWasteReasonLabelVi(key)}
                        {isAlwaysT2 || isRisky ? " ⚠" : ""}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel>{copy.evidenceLabel(true)}</FieldLabel>
              <PhotoUploadInput
                tenantId={context.tenantId}
                folder={`branches/${context.branch.id}/waste/${line.uid}`}
                value={line.photoUrls[0] ?? null}
                onChange={(url) =>
                  onPatch({ photoUrls: url ? [url] : [] })
                }
                acceptTypes="image"
                captureCamera
                allowPaste={false}
                previewSize="touch"
              />
            </Field>
          </FieldGroup>
        ) : null}
      </AppSheet>
      <NumberPadSheet
        open={quantityPadOpen}
        onOpenChange={setQuantityPadOpen}
        title={copy.quantityLabel}
        initialValue={
          line != null && line.quantity !== "" ? Number(line.quantity) : null
        }
        suffix={line?.unit || undefined}
        onConfirm={(value) => onPatch({ quantity: String(value) })}
      />
    </>
  );
}
