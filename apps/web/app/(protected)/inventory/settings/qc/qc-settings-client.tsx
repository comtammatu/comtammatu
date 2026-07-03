"use client";

import { useState, useTransition } from "react";
import { Alert, AlertDescription } from "@comtammatu/ui/components/alert";
import { Button } from "@comtammatu/ui/components/button";
import { Label } from "@comtammatu/ui/components/label";
import { Switch } from "@comtammatu/ui/components/switch";
import { toast } from "@comtammatu/ui/components/sonner";
import { Save as IconDeviceFloppy } from "lucide-react";
import { AppSection } from "@/components/surface";
import { FormattedNumberInput } from "@/(protected)/inventory/_components/formatted-number-input";
import { messages } from "@lib/messages";
import { saveQcSettings } from "../../notifications-actions";

type Initial = {
  qty_short_tolerance_pct: number;
  price_variance_warn_pct: number;
  price_variance_review_pct: number;
  reject_requires_photo: boolean;
};

export function QcSettingsClient({ initial }: { initial: Initial }) {
  const copy = messages.settings.qcSettings;
  const [shortTol, setShortTol] = useState(
    Number(initial.qty_short_tolerance_pct ?? 5),
  );
  const [warnPct, setWarnPct] = useState(
    Number(initial.price_variance_warn_pct ?? 5),
  );
  const [reviewPct, setReviewPct] = useState(
    Number(initial.price_variance_review_pct ?? 15),
  );
  const [requirePhoto, setRequirePhoto] = useState(
    Boolean(initial.reject_requires_photo ?? true),
  );
  const [isSaving, start] = useTransition();

  function handleSave() {
    if (warnPct >= reviewPct) {
      toast.error(copy.warnBelowReview);
      return;
    }
    start(async () => {
      const res = await saveQcSettings({
        qtyShortTolerancePct: shortTol,
        priceVarianceWarnPct: warnPct,
        priceVarianceReviewPct: reviewPct,
        rejectRequiresPhoto: requirePhoto,
      });
      if (!res.success) {
        toast.error(res.error ?? copy.saveFailed);
        return;
      }
      toast.success(copy.saved);
    });
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <Alert>
        <AlertDescription>{copy.description}</AlertDescription>
      </Alert>

      <AppSection
        title={copy.toleranceTitle}
        size="sm"
        contentClassName="grid gap-4 md:grid-cols-3"
      >
        <div className="flex flex-col gap-1">
          <Label htmlFor="short-tol">{copy.shortToleranceLabel}</Label>
          <FormattedNumberInput
            id="short-tol"
            value={String(shortTol)}
            onValueChange={(v) => setShortTol(Number(v || 0))}
            maxFractionDigits={1}
          />
          <p className="text-xs text-muted-foreground">
            {copy.shortToleranceHelp}
          </p>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="warn-pct">{copy.warningThresholdLabel}</Label>
          <FormattedNumberInput
            id="warn-pct"
            value={String(warnPct)}
            onValueChange={(v) => setWarnPct(Number(v || 0))}
            maxFractionDigits={1}
          />
          <p className="text-xs text-muted-foreground">
            {copy.warningThresholdHelp}
          </p>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="review-pct">{copy.reviewThresholdLabel}</Label>
          <FormattedNumberInput
            id="review-pct"
            value={String(reviewPct)}
            onValueChange={(v) => setReviewPct(Number(v || 0))}
            maxFractionDigits={1}
          />
          <p className="text-xs text-muted-foreground">
            {copy.reviewThresholdHelp}
          </p>
        </div>
        <div className="md:col-span-3">
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <Label className="text-sm">{copy.rejectPhotoLabel}</Label>
              <p className="text-xs text-muted-foreground">
                {copy.rejectPhotoHelp}
              </p>
            </div>
            <Switch checked={requirePhoto} onCheckedChange={setRequirePhoto} />
          </div>
        </div>
      </AppSection>

      <footer className="flex justify-end gap-2 border-t pt-4">
        <Button onClick={handleSave} disabled={isSaving}>
          <IconDeviceFloppy className="size-4" /> {copy.saveButton}
        </Button>
      </footer>
    </div>
  );
}
