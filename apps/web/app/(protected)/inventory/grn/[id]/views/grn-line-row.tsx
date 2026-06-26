"use client";

import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Input } from "@comtammatu/ui/components/input";
import { Label } from "@comtammatu/ui/components/label";
import { Textarea } from "@comtammatu/ui/components/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import {
  TriangleAlert as IconAlertTriangle,
  CircleCheck as IconCircleCheck,
  Trash as IconTrash,
} from "lucide-react";
import { PhotoUploadInput } from "../../../_components/photo-upload-input";
import { FormattedNumberInput } from "../../../_components/formatted-number-input";
import { formatVND } from "../../../_lib/format";
import {
  deriveVariance,
  grnCopy,
  inventoryCommon,
  type EditableLine,
  type GRNDetail,
} from "./grn-detail-types";

export function LineRow({
  tenantId,
  grnId,
  line,
  idx,
  isDraft,
  qc,
  showAmendAffordance,
  onChange,
  onDelete,
  onAmend,
}: {
  tenantId: number;
  grnId: number;
  line: EditableLine;
  idx: number;
  isDraft: boolean;
  qc: GRNDetail["qcSettings"];
  showAmendAffordance: boolean;
  onChange: (p: Partial<EditableLine>) => void;
  onDelete: () => void;
  onAmend: () => void;
}) {
  const variance = deriveVariance(line.cost, line.poUnitPrice);
  const variancesLabel =
    variance != null
      ? `${variance > 0 ? "+" : ""}${variance}%`
      : inventoryCommon.noValue;
  const varianceTone =
    variance == null
      ? "text-muted-foreground"
      : Math.abs(variance) > qc.priceVarianceReviewPct
        ? "text-destructive font-bold"
        : Math.abs(variance) > qc.priceVarianceWarnPct
          ? "text-warning font-semibold"
          : "text-muted-foreground";

  // Short delivery: supplier under the PO threshold. Uses gross delivered (actual) directly.
  const shortDeliveryRequired =
    line.poQuantity != null &&
    line.poQuantity > 0 &&
    line.actual < line.poQuantity * (1 - qc.qtyShortTolerancePct / 100);

  if (!isDraft) {
    return (
      <div className="rounded-md border bg-muted/30 p-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-bold">{line.name}</p>
            <p className="text-xs text-muted-foreground">
              {grnCopy.line.orderedDeliveredAccepted(
                line.required,
                line.actual,
                line.actual - line.rejected,
                line.rejected,
                line.unit,
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {showAmendAffordance ? (
              <Button type="button" variant="outline" size="sm" onClick={onAmend}>
                {grnCopy.amend.action}
              </Button>
            ) : null}
            {line.qualityStatus === "rejected" || line.rejected > 0 ? (
              <IconAlertTriangle className="size-5 text-warning" />
            ) : (
              <IconCircleCheck className="size-5 text-success" />
            )}
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
          <Stat label={grnCopy.line.importPrice}>
            {inventoryCommon.currency(formatVND(line.cost))}
          </Stat>
          <Stat label={grnCopy.line.poPrice}>
            {line.poUnitPrice != null
              ? inventoryCommon.currency(formatVND(line.poUnitPrice))
              : inventoryCommon.noValue}
          </Stat>
          <Stat label={grnCopy.line.priceVariance}>
            <span className={varianceTone}>{variancesLabel}</span>
          </Stat>
          <Stat label={grnCopy.line.expiry}>{line.expiryDisplay}</Stat>
        </div>
        {line.rejectionReason ? (
          <p className="mt-2 text-xs text-muted-foreground">
            <span className="font-semibold">
              {grnCopy.line.rejectionReason}
            </span>{" "}
            {line.rejectionReason}
          </p>
        ) : null}
        {line.priceOverrideNote ? (
          <p className="mt-1 text-xs text-muted-foreground">
            <span className="font-semibold">
              {grnCopy.line.priceOverrideReason}
            </span>{" "}
            {line.priceOverrideNote}
          </p>
        ) : null}
        {line.requiresReview ? (
          <Badge variant="destructive" className="mt-2">
            {grnCopy.line.reviewNeeded}
          </Badge>
        ) : null}
      </div>
    );
  }

  // Draft mode — editable
  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
        <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="font-bold">{line.name}</p>
            <p className="text-xs text-muted-foreground">
              {grnCopy.line.orderedPoPrice(
                line.poQuantity ?? inventoryCommon.noValue,
                line.unit,
              )}{" "}
              {line.poUnitPrice != null
                ? inventoryCommon.currency(formatVND(line.poUnitPrice))
                : inventoryCommon.noValue}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-sm ${varianceTone}`}>
              {grnCopy.line.priceVariance}: {variancesLabel}
            </span>
            {line.dirty ? (
              <Badge variant="outline" className="text-xs">
                {grnCopy.line.unsaved}
              </Badge>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onDelete}
              className="text-muted-foreground hover:text-destructive"
              aria-label={grnCopy.line.deleteLineAria}
            >
              <IconTrash className="size-4" />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Field
            id={`actual-${idx}`}
            label={grnCopy.line.actualLabel(line.unit)}
          >
            <FormattedNumberInput
              id={`actual-${idx}`}
              maxFractionDigits={3}
              value={String(line.actual)}
              onValueChange={(value) =>
                onChange({ actual: Number(value || 0) })
              }
            />
          </Field>
          <Field
            id={`rejected-${idx}`}
            label={grnCopy.line.rejectedLabel(line.unit)}
          >
            <FormattedNumberInput
              id={`rejected-${idx}`}
              maxFractionDigits={3}
              value={String(line.rejected)}
              onValueChange={(value) =>
                onChange({
                  rejected: Number(value || 0),
                  qualityStatus:
                    Number(value || 0) > 0 && line.actual === 0
                      ? "rejected"
                      : Number(value || 0) > 0
                        ? "partial"
                        : "accepted",
                })
              }
            />
          </Field>
          <Field id={`cost-${idx}`} label={grnCopy.line.unitCostCurrency}>
            <FormattedNumberInput
              id={`cost-${idx}`}
              maxFractionDigits={0}
              value={String(line.cost)}
              onValueChange={(value) => onChange({ cost: Number(value || 0) })}
            />
          </Field>
          <Field id={`expiry-${idx}`} label={grnCopy.line.expiry}>
            <Input
              id={`expiry-${idx}`}
              type="date"
              value={line.expiry || ""}
              onChange={(e) => onChange({ expiry: e.target.value })}
            />
          </Field>
        </div>

        {line.rejected > 0 || line.qualityStatus === "rejected" ? (
          <div className="grid gap-3 md:grid-cols-2">
            <Field
              id={`reason-${idx}`}
              label={grnCopy.line.rejectReasonRequired}
            >
              <Textarea
                id={`reason-${idx}`}
                rows={2}
                value={line.rejectionReason}
                placeholder={grnCopy.line.rejectReasonPlaceholder}
                onChange={(e) => onChange({ rejectionReason: e.target.value })}
              />
            </Field>
            <Field
              id={`reject-photo-${idx}`}
              label={grnCopy.line.proofPhotoLabel(qc.rejectRequiresPhoto)}
            >
              <PhotoUploadInput
                tenantId={tenantId}
                folder={`grn/${grnId}/rejected/${line.lineId}`}
                value={line.rejectedPhotoUrl || null}
                onChange={(url) => onChange({ rejectedPhotoUrl: url ?? "" })}
              />
            </Field>
          </div>
        ) : null}

        {variance != null && Math.abs(variance) > qc.priceVarianceWarnPct ? (
          <div className="grid gap-3 md:grid-cols-2">
            <Field
              id={`override-${idx}`}
              label={grnCopy.line.priceOverrideRequired}
            >
              <Textarea
                id={`override-${idx}`}
                rows={2}
                value={line.priceOverrideNote}
                placeholder={
                  Math.abs(variance) > qc.priceVarianceReviewPct
                    ? grnCopy.line.reviewVariancePlaceholder(
                        variance,
                        qc.priceVarianceReviewPct,
                      )
                    : grnCopy.line.warnVariancePlaceholder(
                        variance,
                        qc.priceVarianceWarnPct,
                      )
                }
                onChange={(e) =>
                  onChange({ priceOverrideNote: e.target.value })
                }
              />
            </Field>
            {Math.abs(variance) > qc.priceVarianceReviewPct ? (
              <Field
                id={`override-photo-${idx}`}
                label={grnCopy.line.supplierInvoicePhoto}
              >
                <PhotoUploadInput
                  tenantId={tenantId}
                  folder={`grn/${grnId}/price-override/${line.lineId}`}
                  value={line.priceOverridePhotoUrl || null}
                  onChange={(url) =>
                    onChange({ priceOverridePhotoUrl: url ?? "" })
                  }
                />
              </Field>
            ) : null}
          </div>
        ) : null}

        {shortDeliveryRequired ? (
          <Field id={`short-${idx}`} label={grnCopy.line.shortageAction}>
            <Select
              value={line.shortDeliveryAction ?? ""}
              onValueChange={(v) =>
                onChange({
                  shortDeliveryAction: v as EditableLine["shortDeliveryAction"],
                })
              }
            >
              <SelectTrigger id={`short-${idx}`}>
                <SelectValue placeholder={grnCopy.line.shortagePlaceholder} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="accept_and_close">
                  {grnCopy.line.acceptAndClose}
                </SelectItem>
                <SelectItem value="wait_backorder">
                  {grnCopy.line.waitBackorder}
                </SelectItem>
              </SelectContent>
            </Select>
          </Field>
        ) : null}

        <Field id={`lot-${idx}`} label={grnCopy.line.lot}>
          <Input
            id={`lot-${idx}`}
            value={line.lot}
            placeholder={inventoryCommon.noValue}
            onChange={(e) => onChange({ lot: e.target.value })}
          />
        </Field>
    </div>
  );
}

function Field({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

function Stat({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-muted-foreground">{label}</p>
      <p className="font-mono">{children}</p>
    </div>
  );
}
