"use client";

import { useState, useTransition } from "react";
import { Label } from "@comtammatu/ui/components/label";
import { Switch } from "@comtammatu/ui/components/switch";
import { toast } from "@comtammatu/ui/components/sonner";
import { AppSection } from "@/components/surface";
import { messages } from "@lib/messages";
import { setBranchIngredientStockBlock } from "./actions";

export function IngredientStockBlockCard({
  branchId,
  initialEnabled,
}: {
  branchId: number;
  initialEnabled: boolean;
}) {
  const copy = messages.settings.pos;
  const [enabled, setEnabled] = useState(initialEnabled);
  const [isSaving, start] = useTransition();

  function handleChange(next: boolean) {
    const previous = enabled;
    setEnabled(next);
    start(async () => {
      const res = await setBranchIngredientStockBlock(branchId, next);
      if (!res.success) {
        setEnabled(previous);
        toast.error(res.error ?? copy.ingredientStockBlockFailed);
        return;
      }
      toast.success(copy.ingredientStockBlockSaved);
    });
  }

  return (
    <AppSection title={copy.ingredientStockBlockTitle} size="sm">
      <div className="flex items-center justify-between rounded-md border p-3">
        <div className="pr-4">
          <Label className="text-sm">{copy.ingredientStockBlockLabel}</Label>
          <p className="text-xs text-muted-foreground">
            {copy.ingredientStockBlockHelp}
          </p>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={handleChange}
          disabled={isSaving}
        />
      </div>
    </AppSection>
  );
}
