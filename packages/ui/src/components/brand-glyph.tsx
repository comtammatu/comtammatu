import * as React from "react";

import { cn } from "../lib/utils";

/**
 * BrandGlyph — the five Concept-01 brand sub-symbols as inline SVG line art.
 *
 * Decoration only (packaging, storefront, empty-state accents), never an
 * interactive affordance — use lucide-react for UI icons. Inherits
 * currentColor by default; pass `tone` to paint the glyph's semantic brand
 * color. To override, set a token class via `className` (e.g. text-primary),
 * not a raw color value.
 */

export type BrandGlyphName =
  | "hat-gao"
  | "to-com"
  | "dia-tron"
  | "mai-nha"
  | "dua";

const GLYPHS: Record<BrandGlyphName, React.ReactNode> = {
  "hat-gao": (
    <g>
      <path d="M12 4.8 C13.5 8 13.5 12.6 12 16.3 C10.5 12.6 10.5 8 12 4.8 Z" />
      <path
        d="M12 4.8 C13.5 8 13.5 12.6 12 16.3 C10.5 12.6 10.5 8 12 4.8 Z"
        transform="rotate(-30 12 16.8)"
      />
      <path
        d="M12 4.8 C13.5 8 13.5 12.6 12 16.3 C10.5 12.6 10.5 8 12 4.8 Z"
        transform="rotate(30 12 16.8)"
      />
    </g>
  ),
  "to-com": (
    <g>
      <ellipse cx="12" cy="8.6" rx="8" ry="2.3" />
      <path d="M4 8.6 C4.4 14.4 7.8 18.6 12 18.6 C16.2 18.6 19.6 14.4 20 8.6" />
    </g>
  ),
  "dia-tron": (
    <g>
      <circle cx="12" cy="12" r="9.2" />
      <circle cx="12" cy="12" r="5.6" />
    </g>
  ),
  "mai-nha": (
    <g>
      <path d="M3.6 11.4 L12 4 L20.4 11.4 L20.4 20 L3.6 20 Z" />
      <path d="M12 16.4 C8.9 14.1 9.1 11.6 11 11.25 C11.75 11.1 12 11.7 12 11.7 C12 11.7 12.25 11.1 13 11.25 C14.9 11.6 15.1 14.1 12 16.4 Z" />
    </g>
  ),
  dua: (
    <g>
      <line x1="7.2" y1="19.2" x2="15.4" y2="4.8" />
      <line x1="10.8" y1="20.4" x2="19" y2="6" />
    </g>
  ),
};

const toneClass: Record<BrandGlyphName, string> = {
  "hat-gao": "text-warning",
  "to-com": "text-foreground",
  "dia-tron": "text-primary",
  "mai-nha": "text-success",
  dua: "text-foreground",
};

export type BrandGlyphProps = React.SVGAttributes<SVGSVGElement> & {
  /** Which of the five Concept-01 sub-symbols to render. */
  name: BrandGlyphName;
  /** Pixel size (width = height). Default 24. */
  size?: number;
  /** Stroke weight on the 24x24 grid. Default 1.6. */
  strokeWidth?: number;
  /** Paint with the glyph's semantic brand color instead of currentColor. */
  tone?: boolean;
};

function BrandGlyph({
  name,
  size = 24,
  strokeWidth = 1.6,
  tone = false,
  className,
  ...props
}: BrandGlyphProps) {
  const inner = GLYPHS[name];

  if (!inner) {
    return null;
  }

  return (
    <svg
      data-slot="brand-glyph"
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label={name}
      className={cn("shrink-0", tone && toneClass[name], className)}
      {...props}
    >
      {inner}
    </svg>
  );
}

export { BrandGlyph };
