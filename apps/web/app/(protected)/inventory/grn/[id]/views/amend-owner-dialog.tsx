"use client";

import { useEffect, useState } from "react";
import type { FormEvent, TransitionStartFunction } from "react";
import { Alert, AlertDescription } from "@comtammatu/ui/components/alert";
import { Button } from "@comtammatu/ui/components/button";
import { Item } from "@comtammatu/ui/components/item";
import { Label } from "@comtammatu/ui/components/label";
import { Textarea } from "@comtammatu/ui/components/textarea";
import {
  Save as IconDeviceFloppy,
  TriangleAlert as IconAlertTriangle,
} from "lucide-react";
import { notify } from "@comtammatu/ui/lib/notify";
import {
  AppDialog,
  QuantityInput,
  PhotoUploadInput,
} from "@/components/form";
import { amendGrnLine } from "../../../grn-actions";
import { ACTIONS_VI } from "@comtammatu/shared/messages";
import {
  GRN_DETAIL_COPY as grnCopy,
  type EditableGrnLine as EditableLine,
} from "@lib/inventory/grn-detail-model";

const AMEND_OWNER_FORM_ID = "amend-owner-form";

export function AmendOwnerDialog({
  tenantId,
  grnId,
  line,
  isPending,
  onClose,
  onSaved,
  startTransition,
}: {
  tenantId: number;
  grnId: number;
  line: EditableLine | null;
  isPending: boolean;
  onClose: () => void;
  onSaved: (line: EditableLine) => void;
  startTransition: TransitionStartFunction;
}) {
  const [quantity, setQuantity] = useState("");
  const [rejectedQuantity, setRejectedQuantity] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [rejectedPhotoUrl, setRejectedPhotoUrl] = useState("");
  const [amendmentReason, setAmendmentReason] = useState("");

  useEffect(() => {
    setQuantity(line ? String(line.actual) : "");
    setRejectedQuantity(line ? String(line.rejected) : "");
    setRejectionReason(line?.rejectionReason ?? "");
    setRejectedPhotoUrl(line?.rejectedPhotoUrl ?? "");
    setAmendmentReason("");
  }, [line]);

  function handleOpenChange(open: boolean) {
    if (!open) onClose();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!line) return;

    const parsedQuantity = Number(quantity);
    const parsedRejected = Number(rejectedQuantity);
    if (!Number.isFinite(parsedQuantity) || parsedQuantity < 0) {
      notify.error(grnCopy.validation.invalidQuantity);
      return;
    }
    if (
      !Number.isFinite(parsedRejected) ||
      parsedRejected < 0 ||
      parsedRejected > parsedQuantity
    ) {
      notify.error(grnCopy.validation.rejectedExceedsDelivered(line.name));
      return;
    }
    if (parsedRejected > 0 && !rejectionReason.trim()) {
      notify.error(grnCopy.validation.rejectReasonRequired(line.name));
      return;
    }
    if (parsedRejected > 0 && !rejectedPhotoUrl) {
      notify.error(grnCopy.validation.rejectPhotoRequired(line.name));
      return;
    }
    if (amendmentReason.trim().length < 5) {
      notify.error(grnCopy.validation.reasonMinLength);
      return;
    }

    startTransition(async () => {
      const result = await amendGrnLine({
        grnId,
        lineId: line.lineId,
        receivedQuantity: parsedQuantity,
        rejectedQuantity: parsedRejected,
        rejectionReason: parsedRejected > 0 ? rejectionReason.trim() : null,
        rejectedPhotoUrl: parsedRejected > 0 ? rejectedPhotoUrl : null,
        reason: amendmentReason.trim(),
      });
      if (!result.success) {
        notify.error(result.error ?? grnCopy.amend.failed);
        return;
      }
      notify.success(grnCopy.amend.success);
      onSaved({
        ...line,
        actual: parsedQuantity,
        rejected: parsedRejected,
        rejectionReason: parsedRejected > 0 ? rejectionReason.trim() : "",
        rejectedPhotoUrl: parsedRejected > 0 ? rejectedPhotoUrl : "",
        dirty: false,
      });
    });
  }

  return (
    <AppDialog
      open={line !== null}
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
            <p className="font-semibold">{line.name}</p>
            <p className="text-xs text-muted-foreground">
              {grnCopy.line.orderedDeliveredAccepted(
                line.required,
                line.actual,
                line.actual - line.rejected,
                line.rejected,
                line.unit,
              )}
            </p>
          </Item>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="amend-qty">
                {grnCopy.line.actualLabel(line.unit)}
              </Label>
              <QuantityInput
                id="amend-qty"
                value={quantity}
                onValueChange={setQuantity}
                maxFractionDigits={3}
                placeholder="0"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="amend-rejected">
                {grnCopy.line.rejectedLabel(line.unit)}
              </Label>
              <QuantityInput
                id="amend-rejected"
                value={rejectedQuantity}
                onValueChange={setRejectedQuantity}
                maxFractionDigits={3}
                placeholder="0"
              />
            </div>
          </div>

          {Number(rejectedQuantity) > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="amend-rejection-reason">
                  {grnCopy.line.rejectReasonRequired}
                </Label>
                <Textarea
                  id="amend-rejection-reason"
                  rows={3}
                  value={rejectionReason}
                  placeholder={grnCopy.line.rejectReasonPlaceholder}
                  onChange={(event) => setRejectionReason(event.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>{grnCopy.line.proofPhotoLabel(true)}</Label>
                <PhotoUploadInput
                  tenantId={tenantId}
                  folder={`grn/${grnId}/rejected/${line.lineId}`}
                  value={rejectedPhotoUrl || null}
                  onChange={(url) => setRejectedPhotoUrl(url ?? "")}
                  acceptTypes="image"
                  allowPaste={false}
                />
              </div>
            </div>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="amend-reason">{grnCopy.amend.reasonLabel}</Label>
            <Textarea
              id="amend-reason"
              rows={3}
              value={amendmentReason}
              placeholder={grnCopy.amend.reasonPlaceholder}
              onChange={(event) => setAmendmentReason(event.target.value)}
            />
          </div>
        </form>
      ) : null}
    </AppDialog>
  );
}
