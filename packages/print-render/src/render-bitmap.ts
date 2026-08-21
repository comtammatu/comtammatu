/**
 * Bitmap rendering for ESC/POS thermal printers whose firmware does NOT
 * decode CP1258 at any register id (e.g. PDIT PD805KL). Text is rasterized
 * into a 1-bit bitmap via pureimage + JetBrains Mono, then sent via the
 * `GS v 0` raster command — codepage-agnostic, works on any ESC/POS printer.
 *
 * One GS v 0 block per line. Line height adapts to size (normal/double).
 * Bold uses JetBrains Mono Bold variant.
 */

import { Bitmap } from "pureimage";
import { Buffer } from "node:buffer";
import { FAMILY_BOLD, FAMILY_REG, ensureFontsLoaded } from "./fonts";

export { ensureFontsLoaded };

// 80mm thermal paper @ 203dpi ≈ 576 printable dots.
export const DOTS_WIDTH = 576;
const BYTES_PER_ROW = DOTS_WIDTH / 8; // 72

// Canvas fills the full 576-dot printable area. 48 chars × 12-dot glyph
// (JetBrains Mono @ 20px) = 576 exact. Small left-edge side-bearing on thin
// glyphs like `|` may clip ~1 dot but letters print with their full width.
const MARGIN_LEFT = 0;
const MARGIN_RIGHT = 0;
const DRAW_WIDTH = DOTS_WIDTH - MARGIN_LEFT - MARGIN_RIGHT; // 576 dots

// Layout spec:
//   Normal size: JetBrains Mono Regular 20px, ~12 dots/glyph,
//     48 chars/line, 26-dot line height
//   Double size: JetBrains Mono Bold 40px, ~24 dots/glyph,
//     24 chars/line (HARD LIMIT), 52-dot line height
//   Line spacing zero so rasters stack pixel-exact.
const FONT_SIZE_NORMAL = 20;
const FONT_SIZE_DOUBLE = 40;

export const LINE_HEIGHT_NORMAL = 26;
const LINE_HEIGHT_DOUBLE = 52;

/** Max chars per line at normal size (matches PD805KL Font A = 48). */
export const CHARS_PER_LINE_NORMAL = 48;
/** Max chars per line at double size (half of normal). */
export const CHARS_PER_LINE_DOUBLE = 24;

export type RenderOpts = {
  bold?: boolean;
  double?: boolean;
  align?: "left" | "center" | "right";
  /** Inverse video (white text on black) — used for HỦY MÓN banner on
   * cancel tickets. Paints a solid black line, writes white glyphs. */
  inverse?: boolean;
  /** Strike-through: draw a horizontal black line through the text middle
   * after rasterizing. ESC/POS has no native strikethrough, so it is
   * painted directly into the bitmap. */
  strikethrough?: boolean;
};

export type BillHeaderLine = {
  text: string;
  bold?: boolean;
};

const BILL_HEADER_LOGO_SIZE = 144;
const BILL_HEADER_LOGO_X = 8;
const BILL_HEADER_TEXT_X = 176;
// Packed 1-bit seal keeps the logo portable inside the bundled print agent.
const BILL_HEADER_LOGO = Buffer.from(
  `
AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB//wAAAAAAAAAA
AAAAAAAAAB////wAAAAAAAAAAAAAAAAAAP////+AAAAAAAAAAAAAAAAAD/4AAD/4AAAAAAAAAAAAAAAAP8AAAAH+AAAAAAAA
AAAAAAAB/AAAAAA/wAAAAAAAAAAAAAAH8AAAAAAH8AAAAAAAAAAAAAAfgAAAAAAA/AAAAAAAAAAAAAA+AAAAAAAAPgAAAAAA
AAAAAAD4AAAAAAAAD4AAAAAAAAAAAAHgAAAAAAAAA8AAAAAAAAAAAAfAAAAAAwAAAfAAAAAAAAAAAA+AAAAAHQAAAPgAAAAA
AAAAAB4AAADwPgAAADwAAAAAAAAAADwAAAH4YwwAAB4AAAAAAAAAAPAAAAGA4wxgAA8AAAAAAAAAAeAAAAEAww7gAAPAAAAA
AAAAA8AAEAGI4x/gAAHgAAAAAAAAB4AAOAGYfh/AAADwAAAAAAAADwABPAD4PBfAEAB4AAAAAAAADgADnAAAADLAGAA4AAAA
AAAAHAAB1gAAAADADgAcAAAAAAAAOAGB9wAAAAAADwAOAAAAAAAAcAFhsgAAAAAAGAAHAAAAAAAA4ADAwAAAAAAAMAwDgAAA
AAAA4AGQwAAAAAAAMA+DgAAAAAABwADwAAAAAAAAYDgBwAAAAAADgADkAAAAAAAAAPgA4AAAAAADgBBsAAAAAAAAA9AA4AAA
AAAHADg4AAAAAAAAA/AAcAAAAAAGABw0AAAAAAAAAHAAMAAAAAAOAA4EAAAAAAAAACBAOAAAAAAcAAMAAAAAAAAAAGHAHAAA
AAAcAYGAAAAAAAAAACPAHAAAAAA4AwAAAAAAAAAAAAeADgAAAAA4A4AAAAAAAAAAAAGYDgAAAABwBuAAAAAAAAAAAAH8BwAA
AABwAHAAAAAAAAAAAAG4BwAAAADgADAAAAAAAAAAAABgA4AAAADgAAAAAAAAAAAAAAHAA4AAAADAAAAAAAAAAAAAAACAA4AA
AAHAAAAAAAAAAAAAAAAAAcAAAAHAAAAAAAAAAAAAAAAAAcAAAAGAAAAAAAAAAAAAAAAAAMAAAAOAAAAAAAAAAAAAAB4AAOAA
AAOAAAD/AAAH/ngAf/wAAOAAAAMAAAH/gAAP/n4Af/wAAGAAAAMAAAH/wAAP/n/gH+AAAGAAAAcAAAH/wAAf/n/8AAAAAGAA
AAcAAAH/4AAf/n///+AAAHAAAAcAAAH/4AA//n///+AAAHAAAAYAAAH/8AA//n///+AAADAAAAYAAAH/8AB//n///+AAADAA
AAYAAAH/+AB//n///+AAADAAAAYAAAH/+AB//j///8AAADAAAA4AAAH//AD//g///wAAADgAAA4AAAH//AD//gB/8AAAADgA
AA4AAAH//gH//gB/8AAAADgAAA4AAAH//gH//gB/4AAAADgAAA4AAAH//wP//gB/8AAAADgAAA4AAAH//wP//gB/8AAAADgA
AA4AAAH//4f//gB/8AAAADgAAA4AAAH//4f//gB/8AAAADgAAA4AAAH//8///gB/8AAAADgAAA4AAAH//8///gB/8AAAADgA
AA4AAAH/f////gB/8AAAADgAAA4AAAH/f////gB/8AAAADgAAAYAAAH/P//3/gB/4AAAADAAAAYAAAH/P//3/gB/4AAAADAA
AAYAAAH/H//n/gB/4AAAADAAAAYAAAH/H//n/gB/8AAAADAAAAcAAAH/H//H/gB/8AAAAHAAAAcAAAH/D//H/gB/8AAAAHAA
AAcAAAH/D/+H/gB/8AAAAHAAAAMAAAH/B/+H/gB/8AAAAGAAAAMAAAH/B/8H/gB/8AAAAGAAAAOAAAH/A/8H/gB/8AAAAOAA
AAOAAAH/A/4H/gB/8AAAAOAAAAGAAAH/Af4H/gB/8AAAAMAAAAHAAAH/APwH/gB/8AAAAcAAAAHAAAH/AAAH/gB/8AAAAcAA
AADAAAH/AAAH/gB/8AAAA4AAAADgAAH/AAAD/gB/4AAAA4AAAADgAAD+AAAD/gA/4AAAA4AAAABwAAB8AAAA+AAPgAAABwAA
AABwAAAAAAAAAAAAAAAABwAAAAA4AAAAAAAAAAAAAAAADgAAAAA4AAAAAAAAAAAAAAAADgAAAAAcAAAAAAAAAAAAAAAAHAAA
AAAcAAAAAAAAAAAAAAAAHAAAAAAOAAAAAAAAAAAAAAAAOAAAAAAOABgAAAAAAAAAAAwAMAAAAAAHABwAAAABwAAAABwAcAAA
AAADgA4AAAADwAAAADAA4AAAAAADgAMAAAAD4AAAAGAA4AAAAAABwAGAAAADYAAAAMABwAAAAAAA4ADgAAADYAAAA4ADgAAA
AAAA8ABwAAADYAAABwAHgAAAAAAAcAAcAAwDYDgAHAAHAAAAAAAAOAAPAB8DYHgAeAAOAAAAAAAAHAADwAuD4PgB4AAcAAAA
AAAADgAA8A2D4NgHgAA4AAAAAAAADwAAPA3BwdgeAAB4AAAAAAAAB4AADAbBwbAYAADwAAAAAAAAA8AAAAfAAXAAAAHgAAAA
AAAAAeAwAAPAA+AADAPAAAAAAAAAAPAcAAHAAcAAPA+AAAAAAAAAADgVAAAAAAAAPB4AAAAAAAAAABAxAAAAAAACPwwAAAAA
AAAAAABjCAAAAAAHh4AAAAAAAAAAAABDyAAAAACMh4AAAAAAAAAAAABG2QAAAAHkxAAAAAAAAAAAAAAEkwIACDMkxAAAAAAA
AAAAAAAFk4IADDs2wAAAAAAAAAAAAAABMgdM7BkzgAAAAAAAAAAAAAAAJgRJ5AmwAAAAAAAAAAAAAAAAYwRKJAjgAAAAAAAA
AAAAAAAAAARaJAgAAAAAAAAAAAAAAAAAAAZ55AAAAAAAAAAAAAAAAAAAAAAAgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
`,
  "base64",
);

/**
 * Pack RGBA pixel buffer (white=background, dark=foreground) into 1-bit
 * MSB-first raster bytes, row by row.
 */
const packPixels = (bitmap: Bitmap): Uint8Array => {
  const { width, height, data } = bitmap;
  const out = new Uint8Array(BYTES_PER_ROW * height);
  for (let y = 0; y < height; y += 1) {
    for (let xByte = 0; xByte < BYTES_PER_ROW; xByte += 1) {
      let byte = 0;
      for (let bit = 0; bit < 8; bit += 1) {
        const x = xByte * 8 + bit;
        if (x >= width) break;
        const idx = (y * width + x) * 4;
        // Threshold on R channel (bitmap is grayscale black-on-white).
        const r = data[idx] ?? 255;
        if (r < 128) {
          byte |= 0x80 >> bit;
        }
      }
      out[y * BYTES_PER_ROW + xByte] = byte;
    }
  }
  return out;
};

/** Emit `GS v 0 m xL xH yL yH data[]` for a prepared raster. */
const wrapRasterCommand = (packed: Uint8Array, height: number): Uint8Array => {
  const header = new Uint8Array([
    0x1d,
    0x76,
    0x30,
    0x00,
    BYTES_PER_ROW & 0xff,
    (BYTES_PER_ROW >> 8) & 0xff,
    height & 0xff,
    (height >> 8) & 0xff,
  ]);
  const out = new Uint8Array(header.length + packed.length);
  out.set(header, 0);
  out.set(packed, header.length);
  return out;
};

/**
 * Draw a single styled line of text onto a fresh Bitmap. Used by both the
 * ESC/POS raster path and the PNG preview path so they stay pixel-identical.
 *
 * MUST be called after `ensureFontsLoaded()` resolves.
 */
export const drawLineBitmap = (text: string, opts: RenderOpts = {}): Bitmap => {
  const fontSize = opts.double ? FONT_SIZE_DOUBLE : FONT_SIZE_NORMAL;
  const lineHeight = opts.double ? LINE_HEIGHT_DOUBLE : LINE_HEIGHT_NORMAL;
  const family = opts.bold ? FAMILY_BOLD : FAMILY_REG;

  const img = new Bitmap(DOTS_WIDTH, lineHeight);
  const ctx = img.getContext("2d");

  // Disable smoothing so glyph edges are clean 1-bit. Thermal printers
  // only print black/white — anti-aliased grays become dithered mess.
  ctx.imageSmoothingEnabled = false;

  ctx.fillStyle = opts.inverse ? "black" : "white";
  ctx.fillRect(0, 0, DOTS_WIDTH, lineHeight);

  ctx.fillStyle = opts.inverse ? "white" : "black";
  ctx.font = `${fontSize} ${family}`;
  ctx.textBaseline = "top" as never;

  let x = MARGIN_LEFT;
  if (opts.align === "center" || opts.align === "right") {
    const metrics = ctx.measureText(text);
    const w = Math.ceil(metrics.width);
    x =
      opts.align === "center"
        ? MARGIN_LEFT + Math.max(0, Math.floor((DRAW_WIDTH - w) / 2))
        : MARGIN_LEFT + Math.max(0, DRAW_WIDTH - w);
  }

  // Small top padding so ascenders don't clip.
  ctx.fillText(text, x, 2);

  if (opts.strikethrough) {
    const metrics = ctx.measureText(text);
    const w = Math.ceil(metrics.width);
    const midY = Math.floor(lineHeight / 2);
    const strokeH = opts.double ? 3 : 2;
    ctx.fillStyle = opts.inverse ? "white" : "black";
    ctx.fillRect(x, midY, w, strokeH);
  }

  return img;
};

export const drawBillHeaderBitmap = (lines: BillHeaderLine[]): Bitmap => {
  const lineCount = Math.max(1, lines.length);
  const height = Math.max(
    BILL_HEADER_LOGO_SIZE,
    lineCount * LINE_HEIGHT_NORMAL,
  );
  const img = new Bitmap(DOTS_WIDTH, height);
  const ctx = img.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, DOTS_WIDTH, height);

  const logoY = Math.floor((height - BILL_HEADER_LOGO_SIZE) / 2);
  ctx.fillStyle = "black";
  for (let y = 0; y < BILL_HEADER_LOGO_SIZE; y += 1) {
    for (let x = 0; x < BILL_HEADER_LOGO_SIZE; x += 1) {
      const bit = y * BILL_HEADER_LOGO_SIZE + x;
      if ((BILL_HEADER_LOGO[bit >> 3] ?? 0) & (0x80 >> (bit & 7))) {
        ctx.fillRect(BILL_HEADER_LOGO_X + x, logoY + y, 1, 1);
      }
    }
  }

  const textY = Math.floor((height - lineCount * LINE_HEIGHT_NORMAL) / 2);
  ctx.fillStyle = "black";
  ctx.textBaseline = "top" as never;
  lines.forEach((line, index) => {
    ctx.font = `${FONT_SIZE_NORMAL} ${line.bold ? FAMILY_BOLD : FAMILY_REG}`;
    ctx.fillText(
      line.text,
      BILL_HEADER_TEXT_X,
      textY + index * LINE_HEIGHT_NORMAL + 2,
    );
  });

  return img;
};

export const drawRuleBitmap = (thickness = 2): Bitmap => {
  const img = new Bitmap(DOTS_WIDTH, LINE_HEIGHT_NORMAL);
  const ctx = img.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, DOTS_WIDTH, LINE_HEIGHT_NORMAL);
  ctx.fillStyle = "black";
  const y = Math.floor((LINE_HEIGHT_NORMAL - thickness) / 2);
  ctx.fillRect(0, y, DOTS_WIDTH, Math.max(1, thickness));
  return img;
};

/** Render a single line as an ESC/POS raster command. */
export const renderLineRaster = (
  text: string,
  opts: RenderOpts = {},
): Uint8Array => {
  const img = drawLineBitmap(text, opts);
  return wrapRasterCommand(packPixels(img), img.height);
};

export const renderRuleRaster = (thickness = 2): Uint8Array => {
  const img = drawRuleBitmap(thickness);
  return wrapRasterCommand(packPixels(img), img.height);
};

export const renderBillHeaderRaster = (
  lines: BillHeaderLine[],
): Uint8Array => {
  const img = drawBillHeaderBitmap(lines);
  return wrapRasterCommand(packPixels(img), img.height);
};

/** Blank vertical whitespace as an empty raster (default = one normal line). */
export const blankLine = (height = LINE_HEIGHT_NORMAL): Uint8Array => {
  const packed = new Uint8Array(BYTES_PER_ROW * height); // all zeros = white
  return wrapRasterCommand(packed, height);
};

/** Zero printer line-spacing — MUST wrap raster blocks to prevent the
 * printer from inserting its default ~30-dot feed between raster lines. */
export const lineSpacingZero = (): Uint8Array =>
  new Uint8Array([0x1b, 0x33, 0x00]);

/** Restore default line spacing (~30 dots) for subsequent text commands. */
export const lineSpacingDefault = (): Uint8Array =>
  new Uint8Array([0x1b, 0x32]);
