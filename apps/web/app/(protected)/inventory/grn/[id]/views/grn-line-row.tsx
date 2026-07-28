"use client";

import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Item } from "@comtammatu/ui/components/item";
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
import { FormattedNumberInput, PhotoUploadInput } from "@/components/form";
import { formatPercent } from "@comtammatu/shared/format";
import { formatVND } from "@lib/inventory/format";
import {
  deriveGrnVariance as deriveVariance,
  GRN_DETAIL_COPY as grnCopy,
  INVENTORY_COMMON_COPY as inventoryCommon,
  type EditableGrnLine as EditableLine,
  type GrnDetail as GRNDetail,
} from "@lib/inventory/grn-detail-model";
import { GRN_CREATE_COPY } from "@lib/inventory/grn-create-copy";
import {
  GRN_BASELINE_REVIEW_PCT,
  deriveGrnQualityStatus,
  isGrnBaselineReviewRequired,
} from "@lib/inventory/grn-quality";

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
  chrome = "card",
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
  /** `plain` drops Item chrome for sheet / desk editors. */
  chrome?: "card" | "plain";
}) {
  const baselineVariance = line.baselineVariancePct;
  const variance =
    baselineVariance ?? deriveVariance(line.cost, line.poUnitPrice);
  const varianceLabel =
    baselineVariance != null
      ? grnCopy.line.baselineVariance(line.baselineSampleN ?? 0)
      : grnCopy.line.priceVariance;
  const warnPct =
    baselineVariance != null
      ? GRN_BASELINE_REVIEW_PCT
      : qc.priceVarianceWarnPct;
  const reviewPct =
    baselineVariance != null
      ? GRN_BASELINE_REVIEW_PCT
      : qc.priceVarianceReviewPct;
  const needsPriceOverride = variance != null && Math.abs(variance) > warnPct;
  const needsPriceEvidence =
    baselineVariance != null
      ? isGrnBaselineReviewRequired(baselineVariance)
      : variance != null && Math.abs(variance) > reviewPct;
  const variancesLabel =
    variance != null
      ? `${variance > 0 ? "+" : ""}${formatPercent(variance, 2)}`
      : inventoryCommon.noValue;
  const varianceTone =
    variance == null
      ? "text-muted-foreground"
      : Math.abs(variance) > reviewPct
        ? "text-destructive font-bold"
        : Math.abs(variance) > warnPct
          ? "text-warning font-semibold"
          : "text-muted-foreground";

  // Short delivery: supplier under the PO threshold. Uses gross delivered (actual) directly.
  const shortDeliveryRequired =
    line.poQuantity != null &&
    line.poQuantity > 0 &&
    line.actual < line.poQuantity * (1 - qc.qtyShortTolerancePct / 100);

  if (!isDraft) {
    return (
      <Item variant="outline" className="flex-col items-stretch gap-3 p-3">
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
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onAmend}
              >
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
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs md:grid-cols-3">
          <Stat label={grnCopy.line.importPrice}>
            {inventoryCommon.currency(formatVND(line.cost))}
          </Stat>
          <Stat label={grnCopy.line.poPrice}>
            {line.poUnitPrice != null
              ? inventoryCommon.currency(formatVND(line.poUnitPrice))
              : inventoryCommon.noValue}
          </Stat>
          <Stat label={varianceLabel}>
            <span className={varianceTone}>{variancesLabel}</span>
          </Stat>
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
      </Item>
    );
  }

  // Draft mode — editable
  const draftHeader =
    chrome === "plain" ? null : (
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
            {varianceLabel}: {variancesLabel}
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
    );

  const draftFields = (
    <>
      {draftHeader}

      {chrome === "plain" && line.dirty ? (
        <Badge variant="outline" className="w-fit text-xs">
          {grnCopy.line.unsaved}
        </Badge>
      ) : null}

      {chrome === "plain" ? (
        <p className={`text-sm ${varianceTone}`}>
          {varianceLabel}: {variancesLabel}
        </p>
      ) : null}

      <Field id={`quality-${idx}`} label={grnCopy.line.qualityStatusLabel}>
        <Select
          value={line.qualityStatus}
          onValueChange={(value) => {
            const qualityStatus = value as EditableLine["qualityStatus"];
            if (qualityStatus === "accepted") {
              onChange({
                qualityStatus,
                rejected: 0,
                rejectionReason: "",
                rejectedPhotoUrl: "",
              });
              return;
            }
            onChange({
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
          <SelectTrigger id={`quality-${idx}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="accepted">
              {grnCopy.line.qualityAccepted}
            </SelectItem>
            <SelectItem value="partial">
              {grnCopy.line.qualityPartial}
            </SelectItem>
            <SelectItem value="rejected">
              {grnCopy.line.qualityRejected}
            </SelectItem>
          </SelectContent>
        </Select>
      </Field>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Field id={`actual-${idx}`} label={grnCopy.line.actualLabel(line.unit)}>
          <FormattedNumberInput
            id={`actual-${idx}`}
            maxFractionDigits={3}
            value={String(line.actual)}
            onValueChange={(value) => {
              const actual = Number(value || 0);
              const rejected =
                line.qualityStatus === "rejected" ? actual : line.rejected;
              onChange({
                actual,
                rejected,
                qualityStatus: deriveGrnQualityStatus(actual, rejected),
              });
            }}
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
            onValueChange={(value) => {
              const rejected = Number(value || 0);
              onChange({
                rejected,
                qualityStatus: deriveGrnQualityStatus(line.actual, rejected),
              });
            }}
          />
        </Field>
        {line.cost > 0 ? (
          <Field id={`cost-${idx}`} label={grnCopy.line.unitCostCurrency}>
            <p className="text-sm font-semibold tabular-nums">
              {formatVND(line.cost)}
            </p>
            <p className="text-xs text-muted-foreground">
              {GRN_CREATE_COPY.priceOnPoShort}
            </p>
          </Field>
        ) : null}
      </div>

      {line.qualityStatus !== "accepted" ? (
        <div className="grid gap-3 md:grid-cols-2">
          <Field id={`reason-${idx}`} label={grnCopy.line.rejectReasonRequired}>
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
            label={grnCopy.line.proofPhotoLabel(true)}
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

      {needsPriceOverride ? (
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
                baselineVariance != null
                  ? grnCopy.line.baselineVariancePlaceholder(
                      formatPercent(variance, 2),
                      line.baselineSampleN ?? 0,
                    )
                  : needsPriceEvidence
                    ? grnCopy.line.reviewVariancePlaceholder(
                        formatPercent(variance, 2),
                        formatPercent(reviewPct),
                      )
                    : grnCopy.line.warnVariancePlaceholder(
                        formatPercent(variance, 2),
                        formatPercent(warnPct),
                      )
              }
              onChange={(e) => onChange({ priceOverrideNote: e.target.value })}
            />
          </Field>
          {needsPriceEvidence ? (
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
    </>
  );

  if (chrome === "plain") {
    return <div className="flex flex-col gap-3">{draftFields}</div>;
  }

  return (
    <Item variant="outline" className="flex-col items-stretch gap-3 p-4">
      {draftFields}
    </Item>
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
