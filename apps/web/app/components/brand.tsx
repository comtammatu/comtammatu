import Image, { type ImageProps } from "next/image";
import type { ReactNode } from "react";
import { cn } from "@comtammatu/ui";

export const BRAND_NAME = "Cơm Tấm Má Tư";
export const BRAND_LOCKUP_EYEBROW = "TIỆM CƠM TẤM";
export const BRAND_LOCKUP_NAME = "MÁ TƯ";
export const BRAND_LOCKUP_TAGLINE = "Thịt tươi 100%";

const BRAND_ASSETS = {
  seal: {
    src: "/brand/logo-matu-seal.png",
    width: 512,
    height: 512,
  },
  horizontal: {
    src: "/brand/logo-matu.png",
    width: 960,
    height: 540,
  },
  vertical: {
    src: "/brand/logo-matu-vertical.png",
    width: 540,
    height: 720,
  },
} as const;

type BrandAssetVariant = keyof typeof BRAND_ASSETS;
export type BrandMarkVariant = Extract<BrandAssetVariant, "seal">;
export type BrandLockupVariant = Extract<
  BrandAssetVariant,
  "horizontal" | "vertical"
>;

type SharedBrandImageProps = Omit<
  ImageProps,
  "src" | "width" | "height" | "alt"
> & {
  alt?: string;
  decorative?: boolean;
};

const markSizeClass = {
  xs: "size-6",
  sm: "size-8",
  md: "size-8",
  lg: "size-10",
  xl: "size-14",
} as const;

const lockupSizeClass = {
  sm: "h-16 w-auto",
  md: "h-20 w-auto",
  lg: "h-24 w-auto",
  xl: "h-28 w-auto",
} as const;

export function BrandMark({
  variant = "seal",
  size = "md",
  alt,
  decorative = false,
  className,
  ...imageProps
}: SharedBrandImageProps & {
  variant?: BrandMarkVariant;
  size?: keyof typeof markSizeClass;
}) {
  const asset = BRAND_ASSETS[variant];

  return (
    <Image
      {...imageProps}
      src={asset.src}
      width={asset.width}
      height={asset.height}
      alt={decorative ? "" : (alt ?? BRAND_NAME)}
      aria-hidden={decorative ? true : imageProps["aria-hidden"]}
      className={cn("object-contain", markSizeClass[size], className)}
    />
  );
}

type BrandLogoBoxTone = "card" | "sidebar" | "sidebar-primary";

const BRAND_LOGO_BOX_TONE: Record<BrandLogoBoxTone, string> = {
  card: "border bg-background",
  sidebar: "border bg-sidebar-accent",
  "sidebar-primary": "bg-sidebar-primary text-sidebar-primary-foreground",
};

/**
 * Canonical header brand-lockup logo box: the size-10 rounded-md container that
 * holds a `BrandMark` (or a fallback icon) in app chrome headers. Single-sourced
 * here so the Management sidebar header and the Operations (employee/PWA) header
 * stop hand-rolling the same box (design-system.md § B header lockup).
 */
export function BrandLogoBox({
  tone = "card",
  className,
  children,
}: {
  tone?: BrandLogoBoxTone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-md p-1",
        BRAND_LOGO_BOX_TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function BrandLockup({
  variant = "horizontal",
  size = "md",
  alt,
  decorative = false,
  className,
  ...imageProps
}: SharedBrandImageProps & {
  variant?: BrandLockupVariant;
  size?: keyof typeof lockupSizeClass;
}) {
  const asset = BRAND_ASSETS[variant];

  return (
    <Image
      {...imageProps}
      src={asset.src}
      width={asset.width}
      height={asset.height}
      alt={decorative ? "" : (alt ?? BRAND_NAME)}
      aria-hidden={decorative ? true : imageProps["aria-hidden"]}
      className={cn("object-contain", lockupSizeClass[size], className)}
    />
  );
}
