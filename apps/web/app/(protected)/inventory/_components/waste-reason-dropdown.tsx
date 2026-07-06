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

type WasteReason = keyof typeof WASTE_REASON_LABELS_VI;

/** Reason codes that always force tier 2 (regardless of value). */
const ALWAYS_TIER_2: ReadonlyArray<WasteReason> = [
  "found_missing",
  "theft_suspected",
];

/** Reason codes that trigger tier 1 photo even at low value. */
const RISKY_REASONS: ReadonlyArray<WasteReason> = [
  "dropped",
  "quality_fail",
  "contaminated",
  "found_missing",
  "theft_suspected",
];

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
          const isAlwaysT2 = ALWAYS_TIER_2.includes(key);
          const isRisky = RISKY_REASONS.includes(key);
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

/** Runtime helper for clients to preview whether a reason forces tier 2. */
export function isAlwaysTier2Reason(code: string): boolean {
  return (ALWAYS_TIER_2 as ReadonlyArray<string>).includes(code);
}

/** Runtime helper — reason triggers tier 1 photo regardless of value. */
export function isRiskyReason(code: string): boolean {
  return (RISKY_REASONS as ReadonlyArray<string>).includes(code);
}
