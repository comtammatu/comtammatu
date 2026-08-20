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
          {/* Official Grab twin-line ribbon logotype */}
          <path
            fill="none"
            stroke="#fff"
            strokeWidth="0.9"
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M10.8 13.5c-.6-1.5-2-2.2-3.4-2.2-2.1 0-3.6 2-3.6 5.2s1.5 5.2 3.6 5.2c1.8 0 3.1-1.4 3.4-3H8.2 M9.8 14.5c-.4-1-1.2-1.6-2.4-1.6-1.3 0-2.2 1.4-2.2 3.6s.9 3.6 2.2 3.6c1.2 0 2-.8 2.2-2.6H8.2 M12.2 21.7V14.1 M12.2 16.1c.6-1.6 2-2.4 3.8-2 M13.6 21.7V15.5 M13.6 17c.4-1.1 1.2-1.7 2.2-1.5 M20.8 21.7V14.1 M20.8 20.3c-.6 1-1.8 1.4-2.8 1.4-1.6 0-2.8-1.4-2.8-3.8s1.2-3.8 2.8-3.8c1 0 2.2.4 2.8 1.4 M19.4 21.7V15.5 M19.4 19.1c-.4.8-1 1.2-1.6 1.2-1 0-1.4-1-1.4-2.4s.4-2.4 1.4-2.4c.6 0 1.2.4 1.6 1.2 M22.6 9v12.7 M22.6 15.5c.6-1 1.8-1.4 2.8-1.4 1.6 0 2.8 1.4 2.8 3.8s-1.2 3.8-2.8 3.8c-1 0-2.2-.4-2.8-1.4 M24 10.5v11.2 M24 16.7c.4-.8 1-1.2 1.6-1.2 1 0 1.4 1 1.4 2.4s-.4 2.4-1.4 2.4c-.6 0-1.2-.4-1.6-1.2"
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
            fillRule="evenodd"
            d="M12.5 9.2c0-2.1 1.5-3.7 3.5-3.7s3.5 1.6 3.5 3.7h-1.5c0-1.2-.9-2.2-2-2.2s-2 1-2 2.2h-1.5z M7.8 9.5h16.4c.7 0 1.3.6 1.2 1.3l-1.4 13.8c-.1.8-.8 1.4-1.6 1.4H9.6c-.8 0-1.5-.6-1.6-1.4L6.6 10.8c-.1-.7.5-1.3 1.2-1.3z M17.6 13.8c-.4-.3-.9-.4-1.5-.4-1 0-1.6.5-1.6 1.2 0 .7.5 1 1.5 1.3l.5.2c1.4.4 2.3 1.1 2.3 2.5 0 1.6-1.3 2.7-3.1 2.7-1.1 0-2-.3-2.7-.9l.7-1.3c.5.4 1.2.7 1.9.7 1 0 1.6-.5 1.6-1.3 0-.8-.6-1.1-1.6-1.4l-.5-.2c-1.3-.4-2.2-1.1-2.2-2.4 0-1.5 1.2-2.6 2.9-2.6 1 0 1.8.3 2.4.7l-.6 1.5z"
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
            fillRule="evenodd"
            d="M6.8 7.5h3.2v4.8c.8-1 1.9-1.6 3.2-1.6 2.6 0 4.6 2.1 4.6 5.1s-2 5.1-4.6 5.1c-1.3 0-2.4-.6-3.2-1.6v1.4H6.8V7.5zm3.2 8.3c0 1.6 1.2 2.8 2.7 2.8s2.7-1.2 2.7-2.8-1.2-2.8-2.7-2.8-2.7 1.2-2.7 2.8z M19 15.8c0-3 2-5.1 4.8-5.1 2.7 0 4.6 2 4.6 4.9v1.1h-6.2c.2 1.3 1.3 2.1 2.6 2.1 1 0 1.9-.4 2.4-1.2l2.2 1.3c-.9 1.5-2.6 2.4-4.6 2.4-3 0-5.8-2.2-5.8-5.5zm3.2-1.2h3.1c-.2-1.1-1-1.7-1.9-1.7s-1.8.6-2 1.7z M23.2 17.8h5.2v1.2h-5.2z M24.2 15h4.2v1.2h-4.2z"
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
          <rect width="32" height="32" rx="7" fill="#00A59A" />
          <path
            fill="#fff"
            fillRule="evenodd"
            d="M16 23.5c-.3 0-.6-.1-.8-.4-1.8-2.2-4.8-6.1-7.8-9.4-2.1-2.3-3.1-4.2-3.1-5.7 0-.5.4-.9.9-.9 1.5 0 3.7.8 6.4 2.5 2.1 1.3 3.6 2.7 4.4 3.6.8-.9 2.3-2.3 4.4-3.6 2.7-1.7 4.9-2.5 6.4-2.5.5 0 .9.4.9.9 0 1.5-1 3.4-3.1 5.7-3 3.3-6 7.2-7.8 9.4-.2.3-.5.4-.8.4zm-1.8-6.8c-.8-1-2.4-2.6-4.6-3.9-1.8-1.1-3.2-1.7-4.1-1.9.4 1.1 1.3 2.6 2.8 4.3 2.1 2.3 4.3 5.1 5.9 7.1 1.6-2 3.8-4.8 5.9-7.1 1.5-1.7 2.4-3.2 2.8-4.3-.9.2-2.3.8-4.1 1.9-2.2 1.3-3.8 2.9-4.6 3.9h-.1z"
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
