"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { TriangleAlert as IconAlertTriangle } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { Label } from "@comtammatu/ui/components/label";
import { Textarea } from "@comtammatu/ui/components/textarea";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { toast } from "@comtammatu/ui/components/sonner";
import { NoteCallout } from "@comtammatu/ui/components/note-callout";
import { Alert, AlertDescription } from "@comtammatu/ui/components/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { messages } from "@lib/messages";
import { Combobox } from "@/components/form/combobox";
import {
  createSupplierReturnFromGrn,
  type ReturnableGrnRow,
} from "@/(protected)/inventory/supplier-return-actions";
import { AppDetailFooter } from "@/components/surface";

const COPY = messages.inventory.supplierReturns;
const CREATE = COPY.create;

const RESOLUTIONS = ["replacement", "credit_note", "cash_refund"] as const;
const REASONS = [
  "damaged",
  "wrong_item",
  "expired",
  "quality_fail",
  "short_delivery_credit",
  "other",
] as const;

type Resolution = (typeof RESOLUTIONS)[number];
type Reason = (typeof REASONS)[number];

interface Props {
  returnableGrns: ReturnableGrnRow[];
  detailBasePath: string;
  successBasePath: string;
}

export function SupplierReturnCreateClient({
  returnableGrns,
  detailBasePath,
  successBasePath,
}: Props) {
  const router = useRouter();
  const [resolution, setResolution] = React.useState<Resolution>("credit_note");
  const [reason, setReason] = React.useState<Reason>("damaged");
  const [notes, setNotes] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [grnId, setGrnId] = React.useState<string>("");

  const grnOptions = React.useMemo(
    () =>
      returnableGrns.map((g) => ({
        value: String(g.id),
        label: `${g.grn_number} · ${g.supplier_name} · ${CREATE.grnRejectedLines(g.rejected_lines)}`,
      })),
    [returnableGrns],
  );

  function resolutionLabel(value: Resolution) {
    return COPY.resolutionLabels[value];
  }
  function reasonLabel(value: Reason) {
    return COPY.reasonLabels[value];
  }

  async function submitFromGrn() {
    if (!grnId) {
      setSubmitError(CREATE.submitDisabledGrn);
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await createSupplierReturnFromGrn({
        grnId: Number(grnId),
        resolution,
        reason,
        notes: notes.trim() || undefined,
      });
      if (!res.success) {
        setSubmitError(res.error ?? CREATE.createFailed);
        toast.error(res.error ?? CREATE.createFailed);
        return;
      }
      toast.success(CREATE.createdOk);
      const id = res.data?.id;
      router.push(id != null ? `${detailBasePath}/${id}` : successBasePath);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmitGrn = grnId !== "" && !submitting;

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {CREATE.grnPickerLabel}
        </Label>
        <Combobox
          options={grnOptions}
          value={grnId}
          onValueChange={setGrnId}
          placeholder={CREATE.grnPickerPlaceholder}
          searchPlaceholder={CREATE.grnPickerSearch}
          emptyMessage={CREATE.grnPickerEmpty}
          size="touch"
          className="w-full"
        />
        <NoteCallout tone="muted">{CREATE.grnAutoLinesHint}</NoteCallout>
      </div>

      {/* Resolution + reason */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {CREATE.resolutionLabel}
          </Label>
          <Select
            value={resolution}
            onValueChange={(v) => setResolution(v as Resolution)}
          >
            <SelectTrigger size="touch" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RESOLUTIONS.map((r) => (
                <SelectItem key={r} value={r}>
                  {resolutionLabel(r)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {CREATE.reasonLabel}
          </Label>
          <Select value={reason} onValueChange={(v) => setReason(v as Reason)}>
            <SelectTrigger size="touch" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REASONS.map((r) => (
                <SelectItem key={r} value={r}>
                  {reasonLabel(r)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Notes */}
      <div className="flex flex-col gap-1.5">
        <Label
          htmlFor="return-notes"
          className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
        >
          {CREATE.notesLabel}
        </Label>
        <Textarea
          id="return-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          maxLength={500}
          placeholder={CREATE.notesPlaceholder}
        />
      </div>

      {submitError ? (
        <Alert variant="destructive">
          <IconAlertTriangle className="size-4" />
          <AlertDescription>{submitError}</AlertDescription>
        </Alert>
      ) : null}

      <AppDetailFooter
        sticky
        trailing={
          <Button
            type="button"
            size="touch-lg"
            onClick={submitFromGrn}
            disabled={!canSubmitGrn}
          >
            {submitting ? <Spinner className="size-5" /> : null}
            {grnId === "" ? CREATE.submitDisabledGrn : CREATE.submitFromGrn}
          </Button>
        }
      />
    </div>
  );
}
