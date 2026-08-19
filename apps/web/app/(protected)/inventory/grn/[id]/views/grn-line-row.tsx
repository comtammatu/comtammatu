"use client";

import type { ReactNode } from "react";
import { FORM_VI } from "@comtammatu/shared/messages";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Item } from "@comtammatu/ui/components/item";
import { Label } from "@comtammatu/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { Textarea } from "@comtammatu/ui/components/textarea";
import {
  CircleCheck as IconCircleCheck,
  Trash as IconTrash,
  TriangleAlert as IconTriangleAlert,
} from "lucide-react";
import { MoneyVndInput, PhotoUploadInput, QuantityInput } from "@/components/form";
import { getPurchaseUnitOptions } from "@lib/inventory/purchase-units";
import {
  GRN_DETAIL_COPY as grnCopy,
  acceptedGrnQuantity,
  applyGrnLineEntryUnit,
  applyGrnLinePriceUnit,
  combinePackLooseQuantity,
  deliveredGrnQuantity,
  formatGrnPersistQty,
  formatGrnPoQty,
  grnLineHasPackLoose,
  grnLineOrderedDeliveredSummary,
  patchGrnLineUnitPrice,
  splitGrnAcceptedPackLoose,
  type EditableGrnLine as EditableLine,
} from "@lib/inventory/grn-detail-model";
import { deriveGrnQualityStatus } from "@lib/inventory/grn-quality";
import type { IngredientRow } from "@lib/inventory/types";
import { formatVND } from "@lib/inventory/format";
import { messages } from "@lib/messages";

const valuationCopy = messages.inventory.valuationDisplay;

export function LineRow({
  tenantId,
  grnId,
  line,
  idx,
  isDraft,
  showAmendAffordance,
  onChange,
  onDelete,
  onAmend,
  onPatchUnitCost,
  chrome = "card",
  showHeader = true,
  ingredient,
}: {
  tenantId: number;
  grnId: number;
  line: EditableLine;
  idx: number;
  isDraft: boolean;
  showAmendAffordance: boolean;
  onChange: (patch: Partial<EditableLine>) => void;
  onDelete?: () => void;
  onAmend: () => void;
  onPatchUnitCost?: () => void;
  chrome?: "card" | "plain";
  showHeader?: boolean;
  ingredient?: IngredientRow;
}) {
  const qualityStatus = deriveGrnQualityStatus(line.actual, line.rejected);
  const qualityLabel =
    qualityStatus === "accepted"
      ? grnCopy.line.qualityAccepted
      : qualityStatus === "partial"
        ? grnCopy.line.qualityPartial
        : grnCopy.line.qualityRejected;
  const acceptedQuantity = acceptedGrnQuantity(line.actual, line.rejected);
  const excessQuantity = line.excessQuantity;
  const shortageQuantity = line.shortageQuantity;
  const hasPackLoose = grnLineHasPackLoose(line);
  const packLooseSplit = splitGrnAcceptedPackLoose(line);
  const showInspectedValues = line.actual > 0 || line.dirty;

  function commitAccepted(nextAccepted: number) {
    onChange({
      actual: deliveredGrnQuantity(Math.max(0, nextAccepted), line.rejected),
    });
  }

  function commitPackLoose(packQty: number, looseQty: number) {
    if (!line.packUnit || !line.looseUnit) return;
    commitAccepted(
      combinePackLooseQuantity(
        packQty,
        looseQty,
        line.packUnit.toBaseFactor,
        line.looseUnit.toBaseFactor,
      ),
    );
  }

  const unitOptions = getPurchaseUnitOptions(ingredient);

  function commitEntryUnit(nextUnitId: number) {
    const next = applyGrnLineEntryUnit(line, ingredient?.units, nextUnitId);
    if (next) onChange(next);
  }

  function commitPriceUnit(nextUnitId: number) {
    const next = applyGrnLinePriceUnit(line, ingredient?.units, nextUnitId);
    if (next) onChange(next);
  }

  const persistUnitSelect = (
    <GrnLineUnitSelect
      id={`received-unit-${line.lineId}`}
      lineUnit={line.unit}
      value={line.entryUnitId}
      unitOptions={unitOptions}
      onUnitChange={commitEntryUnit}
    />
  );
  const priceUnitSelect = (
    <GrnLineUnitSelect
      id={`unit-price-unit-${line.lineId}`}
      lineUnit={line.unitCostUnitLabel || line.unit}
      value={line.unitCostUnitId}
      unitOptions={unitOptions}
      onUnitChange={commitPriceUnit}
    />
  );
  const content = (
    <>
      {showHeader ? (
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-semibold">{line.name}</p>
            {!isDraft ? (
              <>
                <p className="text-xs text-muted-foreground">
                  {grnLineOrderedDeliveredSummary(line)}
                </p>
                {excessQuantity > 0 || shortageQuantity > 0 ? (
                  <p className="text-xs text-warning-foreground">
                    {excessQuantity > 0
                      ? grnCopy.line.excessShortText(
                          formatGrnPersistQty(excessQuantity, line),
                        )
                      : grnCopy.line.shortageShortText(
                          formatGrnPoQty(shortageQuantity, line),
                        )}
                  </p>
                ) : null}
              </>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Badge
              variant={
                qualityStatus === "accepted"
                  ? "success"
                  : qualityStatus === "partial"
                    ? "warning"
                    : "destructive"
              }
            >
              {qualityStatus === "accepted" ? (
                <IconCircleCheck className="size-3.5" />
              ) : (
                <IconTriangleAlert className="size-3.5" />
              )}
              {qualityLabel}
            </Badge>
            {!isDraft && line.costPending ? (
              <Badge variant="warning">{valuationCopy.pendingInvoice}</Badge>
            ) : null}
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
            {isDraft && onDelete ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="text-destructive hover:text-destructive"
                onClick={onDelete}
                aria-label={grnCopy.line.deleteLineAria}
              >
                <IconTrash className="size-4" />
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {isDraft ? (
        <>
          {hasPackLoose && line.packUnit && line.looseUnit ? (
            <div className="flex min-w-0 flex-col gap-2">
              <div className="grid min-w-0 gap-3 md:grid-cols-2">
                <Field
                  id={`received-pack-${idx}`}
                  label={grnCopy.line.acceptedLabel(line.packUnit.label)}
                >
                  <QuantityInput
                    id={`received-pack-${idx}`}
                    value={
                      showInspectedValues
                        ? String(packLooseSplit?.packQty ?? 0)
                        : ""
                    }
                    onValueChange={(value) =>
                      commitPackLoose(
                        Math.max(0, Number(value || 0)),
                        packLooseSplit?.looseQty ?? 0,
                      )
                    }
                    maxFractionDigits={3}
                  />
                </Field>
                <Field
                  id={`received-loose-${idx}`}
                  label={grnCopy.line.acceptedLabel(line.looseUnit.label)}
                >
                  <QuantityInput
                    id={`received-loose-${idx}`}
                    value={
                      showInspectedValues
                        ? String(packLooseSplit?.looseQty ?? 0)
                        : ""
                    }
                    onValueChange={(value) =>
                      commitPackLoose(
                        packLooseSplit?.packQty ?? 0,
                        Math.max(0, Number(value || 0)),
                      )
                    }
                    maxFractionDigits={3}
                  />
                </Field>
              </div>
              {persistUnitSelect}
            </div>
          ) : (
            <div
              className={
                unitOptions.length > 0 || line.unit
                  ? "flex min-w-0 items-end gap-2"
                  : "min-w-0"
              }
            >
              <div className="min-w-0 flex-1">
                <Field
                  id={`received-${idx}`}
                  label={grnCopy.line.acceptedLabel(line.unit)}
                >
                  <QuantityInput
                    id={`received-${idx}`}
                    value={
                      showInspectedValues ? String(acceptedQuantity) : ""
                    }
                    onValueChange={(value) =>
                      commitAccepted(Math.max(0, Number(value || 0)))
                    }
                    maxFractionDigits={3}
                  />
                </Field>
              </div>
              <div className="w-36 shrink-0">{persistUnitSelect}</div>
            </div>
          )}

          <div
            className={
              unitOptions.length > 0 || line.unitCostUnitLabel || line.unit
                ? "flex min-w-0 items-end gap-2"
                : "min-w-0"
            }
          >
            <div className="min-w-0 flex-1">
              <Field
                id={`unit-price-${idx}`}
                label={grnCopy.line.unitPriceLabel(
                  line.unitCostUnitLabel || line.unit,
                )}
              >
                <MoneyVndInput
                  id={`unit-price-${idx}`}
                  value={
                    line.monetary?.unitPrice != null &&
                    line.monetary.unitPrice > 0
                      ? String(line.monetary.unitPrice)
                      : ""
                  }
                  onValueChange={(value) =>
                    onChange(patchGrnLineUnitPrice(line, Number(value || 0)))
                  }
                  placeholder="0"
                  aria-describedby={`unit-price-hint-${idx}`}
                />
                <p
                  id={`unit-price-hint-${idx}`}
                  className="text-xs text-muted-foreground"
                >
                  {grnCopy.line.unitPriceHint}
                </p>
              </Field>
            </div>
            <div className="w-36 shrink-0">{priceUnitSelect}</div>
          </div>

          <details open={line.rejected > 0 ? true : undefined}>
            <summary className="cursor-pointer text-sm font-medium text-muted-foreground">
              {grnCopy.qcQueue}
            </summary>
            <div className="mt-3 flex flex-col gap-3">
              <Field
                id={`rejected-${idx}`}
                label={grnCopy.line.rejectedLabel(line.unit)}
              >
                <QuantityInput
                  id={`rejected-${idx}`}
                  value={String(line.rejected)}
                  onValueChange={(value) => {
                    const rejected = Math.max(0, Number(value || 0));
                    onChange({
                      actual: deliveredGrnQuantity(
                        acceptedQuantity,
                        rejected,
                      ),
                      rejected,
                    });
                  }}
                  maxFractionDigits={3}
                />
              </Field>

              {line.rejected > 0 ? (
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
                      onChange={(event) =>
                        onChange({ rejectionReason: event.target.value })
                      }
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
                      onChange={(url) =>
                        onChange({ rejectedPhotoUrl: url ?? "" })
                      }
                      acceptTypes="image"
                      allowPaste={false}
                    />
                  </Field>
                </div>
              ) : null}
            </div>
          </details>
        </>
      ) : (
        <div className="grid gap-2 text-sm">
          {line.monetary?.unitPrice != null && line.monetary.unitPrice > 0 ? (
            <p>
              <span className="text-muted-foreground">
                {grnCopy.line.unitPriceLabel(
                  line.unitCostUnitLabel || line.unit,
                )}
              </span>{" "}
              {formatVND(line.monetary.unitPrice)}
            </p>
          ) : onPatchUnitCost && acceptedQuantity > 0 ? (
            <div className="flex flex-col items-start gap-2">
              <Badge variant="warning">{valuationCopy.pendingInvoice}</Badge>
              <Button type="button" size="sm" onClick={onPatchUnitCost}>
                {grnCopy.confirmedUnitCost.confirmAction}
              </Button>
            </div>
          ) : null}
          {line.rejected > 0 ? (
            <>
              <p>
                <span className="text-muted-foreground">
                  {grnCopy.line.rejectionReason}
                </span>{" "}
                {line.rejectionReason}
              </p>
              {line.rejectedPhotoUrl ? (
                <a
                  href={line.rejectedPhotoUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-primary underline-offset-4 hover:underline"
                >
                  {grnCopy.line.viewProofPhoto}
                </a>
              ) : null}
            </>
          ) : null}
        </div>
      )}
    </>
  );

  if (chrome === "plain") {
    return <div className="flex flex-col gap-3">{content}</div>;
  }
  return (
    <Item variant="outline" className="flex-col items-stretch gap-3 p-3">
      {content}
    </Item>
  );
}

function GrnLineUnitSelect({
  id,
  lineUnit,
  value,
  unitOptions,
  onUnitChange,
}: {
  id: string;
  lineUnit: string;
  value: number | null;
  unitOptions: ReturnType<typeof getPurchaseUnitOptions>;
  onUnitChange: (unitId: number) => void;
}) {
  if (unitOptions.length === 0) {
    return lineUnit ? (
      <Field id={id} label={FORM_VI.unit}>
        <p className="flex h-7 items-center text-sm text-muted-foreground">
          {lineUnit}
        </p>
      </Field>
    ) : null;
  }

  return (
    <Field id={id} label={FORM_VI.unit}>
      <Select
        value={value != null ? String(value) : ""}
        onValueChange={(next) => onUnitChange(Number(next))}
      >
        <SelectTrigger id={id} className="w-full" aria-label={FORM_VI.unit}>
          <SelectValue placeholder={grnCopy.addDialog.selectUnit} />
        </SelectTrigger>
        <SelectContent>
          {unitOptions.map((option) => (
            <SelectItem key={option.unitId} value={String(option.unitId)}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

function Field({
  id,
  label,
  children,
  showLabel = true,
}: {
  id: string;
  label: string;
  children: ReactNode;
  showLabel?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className={showLabel ? undefined : "sr-only"}>
        {label}
      </Label>
      {children}
    </div>
  );
}
