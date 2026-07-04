"use client";

import { useState, useTransition } from "react";
import { Label } from "@comtammatu/ui/components/label";
import { Switch } from "@comtammatu/ui/components/switch";
import { toast } from "@comtammatu/ui/components/sonner";
import { AppSection } from "@/components/surface";
import { messages } from "@lib/messages";
import { setBranchStockOutcomePosting } from "./actions";

export function StockControlCard({
  branchId,
  initialPostingEnabled,
}: {
  branchId: number;
  initialPostingEnabled: boolean;
}) {
  const copy = messages.settings.pos;
  const [postingEnabled, setPostingEnabled] = useState(initialPostingEnabled);
  const [isSaving, startSaving] = useTransition();

  function handlePostingChange(next: boolean) {
    const previous = postingEnabled;
    setPostingEnabled(next);
    startSaving(async () => {
      const res = await setBranchStockOutcomePosting(branchId, next);
      if (!res.success) {
        setPostingEnabled(previous);
        toast.error(res.error ?? copy.stockOutcomePostingFailed);
        return;
      }
      toast.success(copy.stockOutcomePostingSaved);
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
            disabled={isSaving}
          />
        </div>
      </div>
    </AppSection>
  );
}
