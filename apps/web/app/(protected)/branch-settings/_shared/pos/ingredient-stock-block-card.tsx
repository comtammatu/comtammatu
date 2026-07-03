"use client";

import { useState, useTransition } from "react";
import { Button } from "@comtammatu/ui/components/button";
import { toast } from "@comtammatu/ui/components/sonner";
import { AppSection } from "@/components/surface";
import { messages } from "@lib/messages";
import { setBranchIngredientStockBlock } from "./actions";

/**
 * Frozen — do not enable. Superseded by "Giới hạn bán theo tồn kho"
 * (StockControlCard). Renders nothing when the flag is off; when a branch
 * still has it on, offers only a turn-off control. Full flag/trigger removal
 * is pending owner confirmation (D064 §7).
 */
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

  if (!enabled) return null;

  function handleTurnOff() {
    setEnabled(false);
    start(async () => {
      const res = await setBranchIngredientStockBlock(branchId, false);
      if (!res.success) {
        setEnabled(true);
        toast.error(res.error ?? copy.ingredientStockBlockFailed);
        return;
      }
      toast.success(copy.ingredientStockBlockSaved);
    });
  }

  return (
    <AppSection title={copy.ingredientStockBlockReplacedTitle} size="sm">
      <div className="flex items-center justify-between rounded-md border p-3">
        <div className="pr-4">
          <p className="text-sm">{copy.ingredientStockBlockLabel}</p>
          <p className="text-xs text-muted-foreground">
            {copy.ingredientStockBlockReplacedHelp}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isSaving}
          onClick={handleTurnOff}
        >
          {copy.ingredientStockBlockTurnOff}
        </Button>
      </div>
    </AppSection>
  );
}
