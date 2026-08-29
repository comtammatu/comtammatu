"use client";

import { useMemo, useState, useTransition } from "react";
import { Save as IconSave } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { Switch } from "@comtammatu/ui/components/switch";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { toast } from "@comtammatu/ui/components/sonner";
import { Field, FieldDescription, FieldLabel } from "@comtammatu/ui/components/field";
import { Frame } from "@comtammatu/ui/components/frame";
import { NoteCallout } from "@comtammatu/ui/components/note-callout";
import { QuantityInput } from "@/components/form";
import {
  AppDetailFooter,
  AppListFrame,
  AppSection,
  AppToolbar,
} from "@/components/surface";
import { messages } from "@lib/messages";
import type { WasteTierSettings } from "@comtammatu/shared/settings";
import { saveWasteTierSettings, type WasteTierFormValues } from "./actions";

const copy = messages.inventory.settings.waste;

export function WasteSettingsClient({
  initialSettings,
}: {
  initialSettings: WasteTierSettings;
}) {
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState<WasteTierFormValues>({
    tierEnabled: initialSettings.tierEnabled,
    tier1Threshold: initialSettings.tier1Threshold,
    tier2Threshold: initialSettings.tier2Threshold,
    shiftCap: initialSettings.shiftCap,
    qtyRatioThreshold: initialSettings.qtyRatioThreshold,
    enforceReasonRules: initialSettings.enforceReasonRules,
  });

  const isDirty = useMemo(() => {
    return (
      form.tierEnabled !== initialSettings.tierEnabled ||
      form.tier1Threshold !== initialSettings.tier1Threshold ||
      form.tier2Threshold !== initialSettings.tier2Threshold ||
      form.shiftCap !== initialSettings.shiftCap ||
      form.qtyRatioThreshold !== initialSettings.qtyRatioThreshold ||
      form.enforceReasonRules !== initialSettings.enforceReasonRules
    );
  }, [form, initialSettings]);

  const validationError = useMemo(() => {
    if (form.tier2Threshold < form.tier1Threshold) {
      return "Ngưỡng cần duyệt phải lớn hơn hoặc bằng ngưỡng cần ảnh.";
    }
    return null;
  }, [form.tier1Threshold, form.tier2Threshold]);

  function handleSave() {
    if (!isDirty) {
      toast.info(copy.nothingToSave);
      return;
    }
    if (validationError) {
      toast.error(validationError);
      return;
    }

    startTransition(async () => {
      const result = await saveWasteTierSettings(form);
      if (!result.success) {
        toast.error(result.error ?? copy.saveFailed);
        return;
      }
      toast.success(copy.saveSuccess);
    });
  }

  return (
    <AppListFrame
      toolbar={
        <AppToolbar variant="inline">
          <span className="text-xs text-muted-foreground">{copy.hint}</span>
        </AppToolbar>
      }
    >
      <div className="flex flex-col gap-6 p-4 max-w-3xl">
        {/* Tier Enabled Toggle */}
        <Frame className="flex items-center justify-between p-4 bg-card">
          <div className="flex flex-col gap-1 pr-4">
            <FieldLabel className="text-sm font-semibold">
              {copy.tierEnabledLabel}
            </FieldLabel>
            <FieldDescription className="text-xs text-muted-foreground">
              {copy.tierEnabledDescription}
            </FieldDescription>
          </div>
          <Switch
            checked={form.tierEnabled}
            onCheckedChange={(checked) =>
              setForm((prev) => ({ ...prev, tierEnabled: checked }))
            }
          />
        </Frame>

        {!form.tierEnabled ? (
          <NoteCallout tone="muted" label={copy.streamlinedModeLabel}>
            {copy.streamlinedModeHint}
          </NoteCallout>
        ) : (
          <AppSection
            title={copy.rulesSectionTitle}
            description={copy.rulesSectionDescription}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              {/* Tier 1 Threshold */}
              <Frame className="p-3 bg-card">
                <Field className="flex flex-col gap-1.5">
                  <FieldLabel className="text-xs font-semibold">
                    {copy.tier1Label}
                  </FieldLabel>
                  <QuantityInput
                    value={String(form.tier1Threshold)}
                    onValueChange={(val) =>
                      setForm((prev) => ({
                        ...prev,
                        tier1Threshold: Math.max(0, parseInt(val || "0", 10)),
                      }))
                    }
                    maxFractionDigits={0}
                    className="h-10 text-right tabular-nums font-mono"
                  />
                  <FieldDescription className="text-xs text-muted-foreground">
                    {copy.tier1Description}
                  </FieldDescription>
                </Field>
              </Frame>

              {/* Tier 2 Threshold */}
              <Frame className="p-3 bg-card">
                <Field className="flex flex-col gap-1.5">
                  <FieldLabel className="text-xs font-semibold">
                    {copy.tier2Label}
                  </FieldLabel>
                  <QuantityInput
                    value={String(form.tier2Threshold)}
                    onValueChange={(val) =>
                      setForm((prev) => ({
                        ...prev,
                        tier2Threshold: Math.max(0, parseInt(val || "0", 10)),
                      }))
                    }
                    maxFractionDigits={0}
                    className="h-10 text-right tabular-nums font-mono"
                  />
                  <FieldDescription className="text-xs text-muted-foreground">
                    {copy.tier2Description}
                  </FieldDescription>
                </Field>
              </Frame>

              {/* Shift Cap */}
              <Frame className="p-3 bg-card">
                <Field className="flex flex-col gap-1.5">
                  <FieldLabel className="text-xs font-semibold">
                    {copy.shiftCapLabel}
                  </FieldLabel>
                  <QuantityInput
                    value={String(form.shiftCap)}
                    onValueChange={(val) =>
                      setForm((prev) => ({
                        ...prev,
                        shiftCap: Math.max(0, parseInt(val || "0", 10)),
                      }))
                    }
                    maxFractionDigits={0}
                    className="h-10 text-right tabular-nums font-mono"
                  />
                  <FieldDescription className="text-xs text-muted-foreground">
                    {copy.shiftCapDescription}
                  </FieldDescription>
                </Field>
              </Frame>

              {/* Qty Ratio Threshold */}
              <Frame className="p-3 bg-card">
                <Field className="flex flex-col gap-1.5">
                  <FieldLabel className="text-xs font-semibold">
                    {copy.qtyRatioLabel}
                  </FieldLabel>
                  <QuantityInput
                    value={String(Math.round(form.qtyRatioThreshold * 100))}
                    onValueChange={(val) =>
                      setForm((prev) => ({
                        ...prev,
                        qtyRatioThreshold: Math.min(
                          1,
                          Math.max(0, parseFloat(val || "0") / 100),
                        ),
                      }))
                    }
                    maxFractionDigits={0}
                    className="h-10 text-right tabular-nums font-mono"
                  />
                  <FieldDescription className="text-xs text-muted-foreground">
                    {copy.qtyRatioDescription}
                  </FieldDescription>
                </Field>
              </Frame>
            </div>

            {/* Enforce reason rules toggle */}
            <Frame className="flex items-center justify-between p-4 mt-2 bg-card">
              <div className="flex flex-col gap-1 pr-4">
                <FieldLabel className="text-xs font-semibold">
                  {copy.enforceReasonLabel}
                </FieldLabel>
                <FieldDescription className="text-xs text-muted-foreground">
                  {copy.enforceReasonDescription}
                </FieldDescription>
              </div>
              <Switch
                checked={form.enforceReasonRules}
                onCheckedChange={(checked) =>
                  setForm((prev) => ({ ...prev, enforceReasonRules: checked }))
                }
              />
            </Frame>
          </AppSection>
        )}
      </div>

      <AppDetailFooter
        sticky
        className="bg-card/95 px-4 py-3 backdrop-blur"
        trailing={
          <Button
            type="button"
            onClick={handleSave}
            disabled={isPending || !isDirty || Boolean(validationError)}
            size="lg"
          >
            {isPending ? (
              <Spinner className="mr-2" />
            ) : (
              <IconSave className="size-4" />
            )}
            {copy.saveAction}
          </Button>
        }
      />
    </AppListFrame>
  );
}
