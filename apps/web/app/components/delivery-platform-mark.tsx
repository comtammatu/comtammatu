"use client";

import type { DeliveryPlatform } from "@comtammatu/shared/delivery";
import {
  DELIVERY_PLATFORM_LABELS_VI,
  getDeliveryPlatformLabelVi,
} from "@comtammatu/shared/labels";
import { cn } from "@comtammatu/ui";

const MONOGRAM: Record<DeliveryPlatform, string> = {
  grab: "G",
  shopee: "SF",
  be: "Be",
  green_sm: "SM",
};

const SIZE_CLASS = {
  xs: "size-4 text-3xs",
  sm: "size-5 text-2xs",
  md: "size-6 text-xs",
} as const;

export function DeliveryPlatformMark({
  platform,
  size = "sm",
  className,
}: {
  platform: DeliveryPlatform | string | null | undefined;
  size?: keyof typeof SIZE_CLASS;
  className?: string;
}) {
  if (
    platform !== "grab" &&
    platform !== "shopee" &&
    platform !== "be" &&
    platform !== "green_sm"
  ) {
    return null;
  }

  const label = getDeliveryPlatformLabelVi(platform);
  const monogram = MONOGRAM[platform];

  return (
    <span
      aria-hidden="true"
      title={label}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-md bg-muted font-semibold text-foreground",
        SIZE_CLASS[size],
        className,
      )}
    >
      {monogram}
    </span>
  );
}

export function deliveryPlatformAccessibleName(
  platform: DeliveryPlatform | string | null | undefined,
): string {
  if (!platform) return "";
  return (
    (DELIVERY_PLATFORM_LABELS_VI as Record<string, string>)[platform] ?? ""
  );
}
