"use client";

import type { DeliveryPlatform } from "@comtammatu/shared/delivery";
import {
  DELIVERY_PLATFORM_LABELS_VI,
  getDeliveryPlatformLabelVi,
} from "@comtammatu/shared/labels";
import { cn } from "@comtammatu/ui";

const SIZE_CLASS = {
  xs: "size-4",
  sm: "size-5",
  md: "size-6",
} as const;

function PlatformSvg({
  platform,
  className,
}: {
  platform: DeliveryPlatform;
  className?: string;
}) {
  switch (platform) {
    case "grab":
      return (
        <svg
          viewBox="0 0 32 32"
          className={className}
          aria-hidden="true"
          focusable="false"
        >
          <rect width="32" height="32" rx="7" fill="#00B14F" />
          <path
            fill="#fff"
            d="M10.2 22.5V9.5h6.1c2.9 0 4.8 1.7 4.8 4.2 0 1.7-.9 3.1-2.4 3.7l2.9 5.1h-2.7l-2.6-4.8h-3.4v4.8h-2.7zm2.7-7.1h3.3c1.4 0 2.2-.8 2.2-1.9s-.8-1.9-2.2-1.9h-3.3v3.8z"
          />
        </svg>
      );
    case "shopee":
      return (
        <svg
          viewBox="0 0 32 32"
          className={className}
          aria-hidden="true"
          focusable="false"
        >
          <rect width="32" height="32" rx="7" fill="#EE4D2D" />
          <path
            fill="#fff"
            d="M9.5 13.2c0-3.6 2.6-6.2 6.5-6.2s6.5 2.6 6.5 6.2v1.1h1.6v9.7c0 1.1-.9 2-2 2H10c-1.1 0-2-.9-2-2v-9.7h1.5v-1.1zm2.4 0c0-2.3 1.6-3.8 4.1-3.8s4.1 1.5 4.1 3.8v1.1H11.9v-1.1zm.6 4.2h2.3v5.4h-2.3v-5.4zm5.2 0h2.3v5.4h-2.3v-5.4z"
          />
        </svg>
      );
    case "be":
      return (
        <svg
          viewBox="0 0 32 32"
          className={className}
          aria-hidden="true"
          focusable="false"
        >
          <rect width="32" height="32" rx="7" fill="#FFD200" />
          <path
            fill="#111"
            d="M8.8 22.4V9.6h5.2c2.7 0 4.4 1.5 4.4 3.7 0 1.4-.7 2.5-1.9 3.1 1.5.5 2.4 1.8 2.4 3.4 0 2.4-1.8 4-4.7 4H8.8zm2.6-7.5h2.5c1.3 0 2-.6 2-1.6s-.7-1.6-2-1.6h-2.5v3.2zm0 5.4h2.8c1.4 0 2.2-.7 2.2-1.8s-.8-1.7-2.2-1.7h-2.8v3.5zm9.2-10.7h2.5v12.8h-2.5V9.6z"
          />
        </svg>
      );
    case "green_sm":
      return (
        <svg
          viewBox="0 0 32 32"
          className={className}
          aria-hidden="true"
          focusable="false"
        >
          <rect width="32" height="32" rx="7" fill="#1B7A4E" />
          <path
            fill="#fff"
            d="M7.2 22.4 10.6 9.6h2.8l2.1 8.4 2.1-8.4h2.8l3.4 12.8h-2.7l-.8-3.3h-3.9l-.8 3.3H7.2zm4.4-5.5h2.8l-.9-3.7-.5-2.2h-.1l-.5 2.2-.9 3.7zm8.9 5.5V9.6h2.6v10.3h3.5v2.5h-6.1z"
          />
        </svg>
      );
  }
}

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

  return (
    <span
      aria-hidden="true"
      title={label}
      className={cn(
        "inline-flex shrink-0 overflow-hidden rounded-md",
        SIZE_CLASS[size],
        className,
      )}
    >
      <PlatformSvg platform={platform} className="size-full" />
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

/** Short chip label for narrow POS controls (sidebar / mobile drawer). */
export function deliveryPlatformChipLabel(
  platform: DeliveryPlatform,
): string {
  switch (platform) {
    case "grab":
      return "Grab";
    case "shopee":
      return "Shopee";
    case "be":
      return "be";
    case "green_sm":
      return "Green SM";
  }
}
