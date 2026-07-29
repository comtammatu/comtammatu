"use client";

import { useState, useTransition } from "react";
import { Label } from "@comtammatu/ui/components/label";
import { Switch } from "@comtammatu/ui/components/switch";
import { toast } from "@comtammatu/ui/components/sonner";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { AppSection } from "@/components/surface";
import { messages } from "@lib/messages";
import { setBranchStockOutcomePosting } from "./actions";

export function StockControlCard({
  branchId,
  initialPostingEnabled,
  canToggle,
  embedded = false,
}: {
  branchId: number;
  initialPostingEnabled: boolean;
  canToggle: boolean;
  embedded?: boolean;
}) {
  const copy = messages.settings.pos;
  const switchId = "stock-outcome-posting";
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

  const content = (
    <Item variant="outline" className="items-center gap-3">
      <ItemContent className="min-w-0">
        <ItemTitle className="line-clamp-none">
          <Label htmlFor={switchId} className="text-sm">
            {copy.stockOutcomePostingLabel}
          </Label>
        </ItemTitle>
        <ItemDescription className="line-clamp-none text-xs leading-5">
          {copy.stockOutcomePostingHelp}
        </ItemDescription>
        {!canToggle ? (
          <ItemDescription className="line-clamp-none text-xs leading-5">
            {copy.stockOutcomePostingOwnerOnly}
          </ItemDescription>
        ) : null}
      </ItemContent>
      <ItemActions className="self-center">
        <Switch
          id={switchId}
          size="touch"
          checked={postingEnabled}
          onCheckedChange={handlePostingChange}
          disabled={isSaving || !canToggle}
        />
      </ItemActions>
    </Item>
  );

  if (embedded) return content;

  return (
    <AppSection title={copy.stockControlTitle} size="sm">
      {content}
    </AppSection>
  );
}
