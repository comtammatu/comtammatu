"use client";

import { useState, useTransition } from "react";
import { Label } from "@comtammatu/ui/components/label";
import { Switch } from "@comtammatu/ui/components/switch";
import { toast } from "@comtammatu/ui/components/sonner";
import { AppSection } from "@/components/surface";
import { messages } from "@lib/messages";
import {
  setBranchStockAvailabilityGate,
  setBranchStockOutcomePosting,
} from "./actions";

export function StockControlCard({
  branchId,
  initialPostingEnabled,
  initialGateEnabled,
}: {
  branchId: number;
  initialPostingEnabled: boolean;
  initialGateEnabled: boolean;
}) {
  const copy = messages.settings.pos;
  const [postingEnabled, setPostingEnabled] = useState(initialPostingEnabled);
  const [gateEnabled, setGateEnabled] = useState(initialGateEnabled);
  const [isSavingPosting, startPosting] = useTransition();
  const [isSavingGate, startGate] = useTransition();

  function handlePostingChange(next: boolean) {
    const previousPosting = postingEnabled;
    const previousGate = gateEnabled;
    setPostingEnabled(next);
    startPosting(async () => {
      const res = await setBranchStockOutcomePosting(branchId, next);
      if (!res.success) {
        setPostingEnabled(previousPosting);
        toast.error(res.error ?? copy.stockOutcomePostingFailed);
        return;
      }

      // GATE_eff = GATE AND DED (D064 §1): the gate switch renders unchecked
      // once posting is off, so its persisted value must follow — otherwise
      // re-enabling posting silently resurrects a gate the manager never
      // re-confirmed.
      if (!next && previousGate) {
        const gateRes = await setBranchStockAvailabilityGate(branchId, false);
        if (!gateRes.success) {
          setPostingEnabled(previousPosting);
          toast.error(gateRes.error ?? copy.stockAvailabilityGateFailed);
          return;
        }
        setGateEnabled(false);
      }

      toast.success(copy.stockOutcomePostingSaved);
    });
  }

  function handleGateChange(next: boolean) {
    const previous = gateEnabled;
    setGateEnabled(next);
    startGate(async () => {
      const res = await setBranchStockAvailabilityGate(branchId, next);
      if (!res.success) {
        setGateEnabled(previous);
        toast.error(res.error ?? copy.stockAvailabilityGateFailed);
        return;
      }
      toast.success(copy.stockAvailabilityGateSaved);
    });
  }

  return (
    <AppSection title={copy.stockControlTitle} size="sm">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between rounded-md border p-3">
          <div className="pr-4">
            <Label className="text-sm">{copy.stockOutcomePostingLabel}</Label>
            <p className="text-xs text-muted-foreground">
              {copy.stockOutcomePostingHelp}
            </p>
          </div>
          <Switch
            checked={postingEnabled}
            onCheckedChange={handlePostingChange}
            disabled={isSavingPosting}
          />
        </div>
        <div className="flex items-center justify-between rounded-md border p-3">
          <div className="pr-4">
            <Label className="text-sm">
              {copy.stockAvailabilityGateLabel}
            </Label>
            <p className="text-xs text-muted-foreground">
              {postingEnabled
                ? copy.stockAvailabilityGateHelp
                : copy.stockAvailabilityGateDisabledHelp}
            </p>
          </div>
          <Switch
            checked={postingEnabled && gateEnabled}
            onCheckedChange={handleGateChange}
            disabled={isSavingGate || !postingEnabled}
          />
        </div>
      </div>
    </AppSection>
  );
}
