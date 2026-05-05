import Image, { type ImageProps } from "next/image";
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

export type BrandAssetVariant = keyof typeof BRAND_ASSETS;
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
  md: "size-9",
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
