"use client";

import type { ReactNode } from "react";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Item } from "@comtammatu/ui/components/item";
import { Label } from "@comtammatu/ui/components/label";
import { Textarea } from "@comtammatu/ui/components/textarea";
import {
  CircleCheck as IconCircleCheck,
  Trash as IconTrash,
  TriangleAlert as IconTriangleAlert,
} from "lucide-react";
import { FormattedNumberInput, PhotoUploadInput } from "@/components/form";
import {
  GRN_DETAIL_COPY as grnCopy,
  type EditableGrnLine as EditableLine,
} from "@lib/inventory/grn-detail-model";
import { deriveGrnQualityStatus } from "@lib/inventory/grn-quality";

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
  chrome = "card",
}: {
  tenantId: number;
  grnId: number;
  line: EditableLine;
  idx: number;
  isDraft: boolean;
  showAmendAffordance: boolean;
  onChange: (patch: Partial<EditableLine>) => void;
  onDelete: () => void;
  onAmend: () => void;
  chrome?: "card" | "plain";
}) {
  const qualityStatus = deriveGrnQualityStatus(line.actual, line.rejected);
  const qualityLabel =
    qualityStatus === "accepted"
      ? grnCopy.line.qualityAccepted
      : qualityStatus === "partial"
        ? grnCopy.line.qualityPartial
        : grnCopy.line.qualityRejected;
  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-bold">{line.name}</p>
          {!isDraft ? (
            <p className="text-xs text-muted-foreground">
              {grnCopy.line.orderedDeliveredAccepted(
                line.required,
                line.actual,
                line.actual - line.rejected,
                line.rejected,
                line.unit,
              )}
            </p>
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
          {showAmendAffordance ? (
            <Button type="button" variant="outline" size="sm" onClick={onAmend}>
              {grnCopy.amend.action}
            </Button>
          ) : null}
          {isDraft ? (
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

      {isDraft ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              id={`received-${idx}`}
              label={grnCopy.line.actualLabel(line.unit)}
            >
              <FormattedNumberInput
                id={`received-${idx}`}
                value={String(line.actual)}
                onValueChange={(value) => {
                  const actual = Math.max(0, Number(value || 0));
                  onChange({
                    actual,
                    rejected: Math.min(line.rejected, actual),
                  });
                }}
                maxFractionDigits={3}
              />
            </Field>
            <Field
              id={`rejected-${idx}`}
              label={grnCopy.line.rejectedLabel(line.unit)}
            >
              <FormattedNumberInput
                id={`rejected-${idx}`}
                value={String(line.rejected)}
                onValueChange={(value) =>
                  onChange({
                    rejected: Math.min(
                      line.actual,
                      Math.max(0, Number(value || 0)),
                    ),
                  })
                }
                maxFractionDigits={3}
              />
            </Field>
          </div>

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
                  onChange={(url) => onChange({ rejectedPhotoUrl: url ?? "" })}
                  acceptTypes="image"
                  allowPaste={false}
                />
              </Field>
            </div>
          ) : null}
        </>
      ) : line.rejected > 0 ? (
        <div className="grid gap-2 text-sm">
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
        </div>
      ) : null}
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

function Field({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}
