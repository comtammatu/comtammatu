"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { INVENTORY_VI } from "@comtammatu/shared/messages";
import { WASTE_REASON_LABELS_VI } from "@comtammatu/shared/labels";
import {
  isAlwaysTier2WasteReason,
  isRiskyWasteReason,
} from "@lib/inventory/waste-tier-model";

type WasteReason = keyof typeof WASTE_REASON_LABELS_VI;

interface WasteReasonDropdownProps {
  value: WasteReason | "";
  onChange: (value: WasteReason) => void;
  /** Hide auto-gen-only reasons (pos_return / kds_cancel_*) from manual UI. */
  manualOnly?: boolean;
  disabled?: boolean;
  id?: string;
  size?: "sm" | "default" | "touch";
  className?: string;
}

/**
 * Waste reason Select (S11).
 * By default hides POS/KDS auto-gen reasons from manual entry — those should
 * only be set by the source RPCs (`create_waste_from_order`).
 */
export function WasteReasonDropdown({
  value,
  onChange,
  manualOnly = true,
  disabled,
  id,
  size = "default",
  className,
}: WasteReasonDropdownProps) {
  const options = (Object.keys(WASTE_REASON_LABELS_VI) as WasteReason[]).filter(
    (key) => {
      if (!manualOnly) return true;
      // Hide auto-gen-only reasons from manual picker
      return (
        key !== "customer_return" &&
        key !== "kds_cancel_mid_cook" &&
        key !== "kds_cancel_after_cook"
      );
    },
  );

  return (
    <Select
      value={value}
      onValueChange={(v) => onChange(v as WasteReason)}
      disabled={disabled}
    >
      <SelectTrigger id={id} size={size} className={className}>
        <SelectValue placeholder={INVENTORY_VI.selectReason} />
      </SelectTrigger>
      <SelectContent>
        {options.map((key) => {
          const isAlwaysT2 = isAlwaysTier2WasteReason(key);
          const isRisky = isRiskyWasteReason(key);
          return (
            <SelectItem key={key} value={key}>
              {WASTE_REASON_LABELS_VI[key]}
              {isAlwaysT2 ? " ⚠" : isRisky ? " ⚠" : ""}
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
