"use client";

import { useEffect, useMemo, useState } from "react";
import { Field, FieldLabel } from "@comtammatu/ui/components/field";
import { toast } from "@comtammatu/ui/components/sonner";
import { ACTIONS_VI } from "@comtammatu/shared/messages";
import { formatVND } from "@comtammatu/shared/format";
import { ReasonConfirmDialog } from "@/components/reason-confirm-dialog";
import { MoneyVndInput } from "@/components/form";
import { messages } from "@lib/messages";
import type { IngredientUnitRow } from "@lib/inventory/types";
import { resolveStockDisplayUnit, stockUnitLabel } from "../_lib/stock-unit-format";
import { ownerSetCompanyWac } from "../stock-actions";

const copy = messages.inventory.stock.detail;
const REASON_MIN_LENGTH = 10;

export type CompanyWacTarget = {
  ingredientId: number;
  name: string;
  units: IngredientUnitRow[];
  currentWac: number | null;
};

export function CompanyWacDialog({
  target,
  onClose,
  onSaved,
}: {
  target: CompanyWacTarget | null;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const [unitCost, setUnitCost] = useState("");
  const [reason, setReason] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [isPending, setIsPending] = useState(false);

  const baseUnit = useMemo(
    () => resolveStockDisplayUnit(target?.units),
    [target],
  );
  const baseUnitLabel = stockUnitLabel(baseUnit, "");

  useEffect(() => {
    if (target == null) {
      setUnitCost("");
      setReason("");
      setIdempotencyKey("");
      setIsPending(false);
      return;
    }
    setUnitCost(
      target.currentWac != null && target.currentWac > 0
        ? String(target.currentWac)
        : "",
    );
    setReason("");
    setIdempotencyKey(crypto.randomUUID());
    setIsPending(false);
  }, [target]);

  const parsedUnitCost = Number(unitCost);
  const canConfirm =
    Number.isFinite(parsedUnitCost) &&
    parsedUnitCost > 0 &&
    target != null &&
    baseUnit != null;

  async function handleConfirm() {
    if (!target || !canConfirm) return;
    setIsPending(true);
    const result = await ownerSetCompanyWac({
      ingredientId: target.ingredientId,
      unitCost: parsedUnitCost,
      reason,
      idempotencyKey,
    });
    if (!result.success || result.data == null) {
      setIsPending(false);
      toast.error(result.error);
      return;
    }
    toast.success(copy.setCompanyWacSuccess);
    onSaved?.();
    onClose();
  }

  return (
    <ReasonConfirmDialog
      open={target != null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={copy.setCompanyWacTitle}
      description={
        target
          ? copy.setCompanyWacDescription(target.name, baseUnitLabel)
          : undefined
      }
      reasonId="company-wac-reason"
      reason={reason}
      onReasonChange={setReason}
      reasonLabel={copy.setCompanyWacReasonLabel}
      reasonPlaceholder={copy.setCompanyWacReasonPlaceholder}
      reasonMinLength={REASON_MIN_LENGTH}
      cancelLabel={ACTIONS_VI.close}
      confirmLabel={copy.setCompanyWacTitle}
      canConfirm={canConfirm}
      isPending={isPending}
      onConfirm={() => {
        void handleConfirm();
      }}
    >
      {target?.currentWac != null && target.currentWac > 0 ? (
        <p className="text-sm text-muted-foreground">
          {copy.setCompanyWacCurrent(formatVND(target.currentWac), baseUnitLabel)}
        </p>
      ) : null}
      <Field>
        <FieldLabel htmlFor="company-wac-unit-cost">
          {messages.inventory.stock.table.wacPerUnit(baseUnitLabel)}
        </FieldLabel>
        <MoneyVndInput
          id="company-wac-unit-cost"
          value={unitCost}
          onValueChange={setUnitCost}
          placeholder="0"
        />
      </Field>
    </ReasonConfirmDialog>
  );
}
