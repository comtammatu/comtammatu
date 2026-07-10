"use client";

import { useState } from "react";
import type { FormEvent, TransitionStartFunction } from "react";
import { Alert, AlertDescription } from "@comtammatu/ui/components/alert";
import { Button } from "@comtammatu/ui/components/button";
import { Item } from "@comtammatu/ui/components/item";
import { Label } from "@comtammatu/ui/components/label";
import { Textarea } from "@comtammatu/ui/components/textarea";
import {
  TriangleAlert as IconAlertTriangle,
  Save as IconDeviceFloppy,
} from "lucide-react";
import { notify } from "@comtammatu/ui/lib/notify";
import { AppDialog, FormattedNumberInput } from "@/components/form";
import { amendGrnLine } from "../../../grn-actions";
import { formatVND } from "../../../_lib/format";
import { ACTIONS_VI } from "@comtammatu/shared/messages";
import {
  GRN_DETAIL_COPY as grnCopy,
  type EditableGrnLine as EditableLine,
} from "@lib/inventory/grn-detail-model";

const AMEND_OWNER_FORM_ID = "amend-owner-form";

export function AmendOwnerDialog({
  grnId,
  line,
  isPending,
  onClose,
  onSaved,
  startTransition,
}: {
  grnId: number;
  line: EditableLine | null;
  isPending: boolean;
  onClose: () => void;
  onSaved: (line: EditableLine) => void;
  startTransition: TransitionStartFunction;
}) {
  const [quantity, setQuantity] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [reason, setReason] = useState("");

  const isOpen = line !== null;

  function resetForm() {
    setQuantity("");
    setUnitCost("");
    setReason("");
  }

  function handleOpenChange(open: boolean) {
    if (!open) {
      resetForm();
      onClose();
    }
  }

  // Sync form fields when a new line is selected.
  if (line && quantity === "" && unitCost === "") {
    setQuantity(String(line.actual));
    setUnitCost(String(line.cost));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!line) return;

    const parsedQty = Number(quantity);
    const parsedCost = Number(unitCost);
    const trimmedReason = reason.trim();

    if (!Number.isFinite(parsedQty) || parsedQty < 0) {
      notify.error(grnCopy.validation.invalidQuantity);
      return;
    }
    if (!Number.isFinite(parsedCost) || parsedCost < 0) {
      notify.error(grnCopy.validation.invalidUnitCost);
      return;
    }
    if (trimmedReason.length < 5) {
      notify.error(grnCopy.validation.reasonMinLength);
      return;
    }

    startTransition(async () => {
      const res = await amendGrnLine({
        grnId,
        lineId: line.lineId,
        receivedQuantity: parsedQty,
        unitCost: parsedCost,
        reason: trimmedReason,
      });
      if (!res.success) {
        notify.error(res.error ?? grnCopy.amend.failed);
        return;
      }
      notify.success(grnCopy.amend.success);
      onSaved({
        ...line,
        actual: parsedQty,
        accepted: parsedQty - line.rejected,
        cost: parsedCost,
        dirty: false,
      });
      resetForm();
    });
  }

  return (
    <AppDialog
      open={isOpen}
      onOpenChange={handleOpenChange}
      title={grnCopy.amend.title}
      footer={
        line ? (
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isPending}
            >
              {ACTIONS_VI.cancel}
            </Button>
            <Button
              type="submit"
              form={AMEND_OWNER_FORM_ID}
              disabled={isPending}
            >
              <IconDeviceFloppy className="size-4" />
              {grnCopy.amend.saveAction}
            </Button>
          </>
        ) : null
      }
    >
      {line ? (
        <form
          id={AMEND_OWNER_FORM_ID}
          onSubmit={handleSubmit}
          className="flex flex-col gap-4"
        >
          <Alert>
            <IconAlertTriangle className="size-4" />
            <AlertDescription>{grnCopy.amend.warning}</AlertDescription>
          </Alert>

          <Item variant="outline" className="flex-col items-stretch gap-1 p-3">
            <p className="font-bold">{line.name}</p>
            <p className="text-xs text-muted-foreground">
              {grnCopy.amend.current(
                line.actual,
                line.unit,
                formatVND(line.cost).replace(/đ$/, ""),
              )}
            </p>
          </Item>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="amend-qty">{grnCopy.amend.quantityLabel}</Label>
              <FormattedNumberInput
                id="amend-qty"
                value={quantity}
                onValueChange={setQuantity}
                maxFractionDigits={3}
                placeholder="0"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="amend-cost">{grnCopy.amend.unitCostLabel}</Label>
              <FormattedNumberInput
                id="amend-cost"
                value={unitCost}
                onValueChange={setUnitCost}
                maxFractionDigits={0}
                placeholder="0"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="amend-reason">{grnCopy.amend.reasonLabel}</Label>
            <Textarea
              id="amend-reason"
              rows={3}
              value={reason}
              placeholder={grnCopy.amend.reasonPlaceholder}
              onChange={(event) => setReason(event.target.value)}
            />
          </div>
        </form>
      ) : null}
    </AppDialog>
  );
}
