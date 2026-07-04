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

const BRAND_SYMBOL_ASSETS = {
  chopsticks: {
    src: "/brand/symbols/dua.svg",
    width: 48,
    height: 48,
  },
  riceBowl: {
    src: "/brand/symbols/to-com.svg",
    width: 48,
    height: 48,
  },
  roundPlate: {
    src: "/brand/symbols/dia-tron.svg",
    width: 48,
    height: 48,
  },
  roof: {
    src: "/brand/symbols/mai-nha.svg",
    width: 48,
    height: 48,
  },
  riceGrain: {
    src: "/brand/symbols/hat-gao.svg",
    width: 48,
    height: 48,
  },
} as const;

const BRAND_MASCOT_ASSETS = {
  cotlet: {
    src: "/brand/mascot/cotlet.png",
    width: 384,
    height: 512,
  },
} as const;

type BrandAssetVariant = keyof typeof BRAND_ASSETS;
export type BrandSymbolVariant = keyof typeof BRAND_SYMBOL_ASSETS;
type BrandMascotVariant = keyof typeof BRAND_MASCOT_ASSETS;
type BrandMascotMood = "idle" | "waiting" | "waving";
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

const symbolSizeClass = {
  sm: "size-5",
  md: "size-6",
  lg: "size-8",
  xl: "size-10",
} as const;

const mascotSizeClass = {
  sm: "h-24 w-auto",
  md: "h-32 w-auto",
  lg: "h-44 w-auto",
} as const;
const mascotMoodClass: Record<BrandMascotMood, string> = {
  idle: "mascot-cotlet-idle motion-safe:animate-cotlet-idle",
  waiting: "mascot-cotlet-waiting motion-safe:animate-cotlet-waiting",
  waving: "mascot-cotlet-waving motion-safe:animate-cotlet-waving",
};

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

export function BrandSymbol({
  variant = "riceGrain",
  size = "md",
  alt,
  decorative = true,
  className,
  ...imageProps
}: SharedBrandImageProps & {
  variant?: BrandSymbolVariant;
  size?: keyof typeof symbolSizeClass;
}) {
  const asset = BRAND_SYMBOL_ASSETS[variant];

  return (
    <Image
      {...imageProps}
      src={asset.src}
      width={asset.width}
      height={asset.height}
      alt={decorative ? "" : (alt ?? BRAND_NAME)}
      aria-hidden={decorative ? true : imageProps["aria-hidden"]}
      className={cn("object-contain", symbolSizeClass[size], className)}
    />
  );
}

export function BrandMascot({
  variant = "cotlet",
  size = "md",
  animated = false,
  mood = "idle",
  alt,
  decorative = true,
  className,
  ...imageProps
}: SharedBrandImageProps & {
  variant?: BrandMascotVariant;
  size?: keyof typeof mascotSizeClass;
  animated?: boolean;
  mood?: BrandMascotMood;
}) {
  const asset = BRAND_MASCOT_ASSETS[variant];

  if (animated && variant === "cotlet") {
    return (
      <span
        aria-hidden={decorative ? true : imageProps["aria-hidden"]}
        role={decorative ? undefined : "img"}
        aria-label={decorative ? undefined : (alt ?? "Cốt Lết")}
        className={cn("block mascot-cotlet", mascotMoodClass[mood], className)}
      />
    );
  }

  return (
    <Image
      {...imageProps}
      src={asset.src}
      width={asset.width}
      height={asset.height}
      alt={decorative ? "" : (alt ?? "Cốt Lết")}
      aria-hidden={decorative ? true : imageProps["aria-hidden"]}
      className={cn("object-contain", mascotSizeClass[size], className)}
    />
  );
}
