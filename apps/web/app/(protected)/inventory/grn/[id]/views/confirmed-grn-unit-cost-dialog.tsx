"use client";

import { useEffect, useMemo, useState } from "react";
import { Field, FieldLabel } from "@comtammatu/ui/components/field";
import { Label } from "@comtammatu/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { toast } from "@comtammatu/ui/components/sonner";
import { ACTIONS_VI, FORM_VI } from "@comtammatu/shared/messages";
import { formatQuantity, formatVND } from "@comtammatu/shared/format";
import { ReasonConfirmDialog } from "@/components/reason-confirm-dialog";
import { MoneyVndInput } from "@/components/form";
import { messages } from "@lib/messages";
import type { ConfirmedGrnUnitCostTarget } from "@lib/inventory/grn-unpriced-queue-model";
import { ownerPatchConfirmedGrnUnitCost } from "../../../grn-actions";

const copy = messages.inventory.grn.confirmedUnitCost;

const REASON_MIN_LENGTH = 10;

export type ConfirmedGrnUnitCostPatch = {
  grnItemId: number;
  unitCost: number;
  unitCostUnitId: number;
  unitCostUnitLabel: string;
  totalCost: number;
};

export function ConfirmedGrnUnitCostDialog({
  target,
  onClose,
  onPatched,
}: {
  target: ConfirmedGrnUnitCostTarget | null;
  onClose: () => void;
  onPatched?: (patch: ConfirmedGrnUnitCostPatch) => void;
}) {
  const [unitCost, setUnitCost] = useState("");
  const [unitCostUnitId, setUnitCostUnitId] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [isPending, setIsPending] = useState(false);

  useEffect(() => {
    if (target == null) {
      setUnitCost("");
      setUnitCostUnitId(null);
      setReason("");
      setIdempotencyKey("");
      setIsPending(false);
      return;
    }
    const suggested =
      target.suggestedUnitCost != null && target.suggestedUnitCost > 0
        ? String(target.suggestedUnitCost)
        : "";
    const nextUnitId =
      target.suggestedUnitCostUnitId ??
      target.unitCostUnitId ??
      target.unitOptions[0]?.unitId ??
      null;
    setUnitCost(suggested);
    setUnitCostUnitId(nextUnitId);
    setReason("");
    setIdempotencyKey(crypto.randomUUID());
    setIsPending(false);
  }, [target]);

  const selectedUnitLabel = useMemo(() => {
    if (unitCostUnitId == null) return "";
    return (
      target?.unitOptions.find((option) => option.unitId === unitCostUnitId)
        ?.label ?? ""
    );
  }, [target, unitCostUnitId]);

  const parsedUnitCost = Number(unitCost);
  const canConfirm =
    Number.isFinite(parsedUnitCost) &&
    parsedUnitCost > 0 &&
    unitCostUnitId != null &&
    target != null &&
    target.unitOptions.length > 0;

  const suggestionText =
    target?.suggestedUnitCost != null &&
    target.suggestedUnitCost > 0 &&
    target.suggestedUnitCostUnitId != null
      ? copy.suggestedHint(
          formatVND(target.suggestedUnitCost),
          target.suggestedUnitName ?? "",
          target.suggestedSourceGrnNumber ??
            target.grnNumber,
        )
      : copy.noSuggestion;

  async function handleConfirm() {
    if (!target || !canConfirm || unitCostUnitId == null) return;
    setIsPending(true);
    const result = await ownerPatchConfirmedGrnUnitCost({
      grnItemId: target.grnItemId,
      unitCost: parsedUnitCost,
      unitCostUnitId,
      reason,
      idempotencyKey,
    });
    if (!result.success || result.data == null) {
      setIsPending(false);
      toast.error(result.error);
      return;
    }
    toast.success(copy.success);
    onPatched?.({
      grnItemId: target.grnItemId,
      unitCost: result.data.unitCost,
      unitCostUnitId: result.data.unitCostUnitId,
      unitCostUnitLabel: selectedUnitLabel,
      totalCost: result.data.totalCost,
    });
    onClose();
  }

  return (
    <ReasonConfirmDialog
      open={target != null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={copy.dialogTitle}
      description={
        target
          ? copy.dialogDescription(
              target.ingredientName,
              formatQuantity(target.acceptedQuantity),
              target.entryUnitName,
            )
          : undefined
      }
      reasonId="confirmed-grn-unit-cost-reason"
      reason={reason}
      onReasonChange={setReason}
      reasonLabel={copy.reasonLabel}
      reasonPlaceholder={copy.reasonPlaceholder}
      reasonMinLength={REASON_MIN_LENGTH}
      cancelLabel={ACTIONS_VI.close}
      confirmLabel={copy.confirmAction}
      canConfirm={canConfirm}
      isPending={isPending}
      onConfirm={() => {
        void handleConfirm();
      }}
    >
      <p className="text-sm text-muted-foreground">{suggestionText}</p>
      <Field>
        <FieldLabel htmlFor="confirmed-grn-unit-cost">
          {messages.inventory.grn.line.unitPriceLabel(selectedUnitLabel)}
        </FieldLabel>
        <MoneyVndInput
          id="confirmed-grn-unit-cost"
          value={unitCost}
          onValueChange={setUnitCost}
          placeholder="0"
        />
        <p className="text-xs text-muted-foreground">
          {messages.inventory.grn.line.unitPriceHint}
        </p>
      </Field>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="confirmed-grn-unit-cost-unit">{FORM_VI.unit}</Label>
        {target != null && target.unitOptions.length > 0 ? (
          <Select
            value={unitCostUnitId != null ? String(unitCostUnitId) : undefined}
            onValueChange={(value) => setUnitCostUnitId(Number(value))}
          >
            <SelectTrigger
              id="confirmed-grn-unit-cost-unit"
              aria-label={FORM_VI.unit}
            >
              <SelectValue placeholder={messages.inventory.grn.addDialog.selectUnit} />
            </SelectTrigger>
            <SelectContent>
              {target.unitOptions.map((option) => (
                <SelectItem key={option.unitId} value={String(option.unitId)}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <p className="text-sm text-muted-foreground">
            {messages.inventory.grn.addDialog.selectUnit}
          </p>
        )}
      </div>
    </ReasonConfirmDialog>
  );
}
