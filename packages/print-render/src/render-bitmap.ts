/**
 * Bitmap rendering for ESC/POS thermal printers whose firmware does NOT
 * decode CP1258 at any register id (e.g. PDIT PD805KL). Text is rasterized
 * into a 1-bit bitmap via pureimage + Roboto Mono, then sent via the
 * `GS v 0` raster command — codepage-agnostic, works on any ESC/POS printer.
 *
 * One GS v 0 block per line. Line height adapts to size (normal/double).
 * Bold uses Roboto Mono Bold variant.
 */

import { Bitmap } from "pureimage";
import { FAMILY_BOLD, FAMILY_REG, ensureFontsLoaded } from "./fonts";

export { ensureFontsLoaded };

// 80mm thermal paper @ 203dpi ≈ 576 printable dots.
export const DOTS_WIDTH = 576;
const BYTES_PER_ROW = DOTS_WIDTH / 8; // 72

// Canvas fills the full 576-dot printable area. 48 chars × 12-dot glyph
// (Roboto Mono @ 20px) = 576 exact. Small left-edge side-bearing on thin
// glyphs like `|` may clip ~1 dot but letters print with their full width.
const MARGIN_LEFT = 0;
const MARGIN_RIGHT = 0;
const DRAW_WIDTH = DOTS_WIDTH - MARGIN_LEFT - MARGIN_RIGHT; // 576 dots

// Layout spec:
//   Normal size: Roboto Mono Regular 20px, ~12 dots/glyph,
//     48 chars/line, 26-dot line height
//   Double size: Roboto Mono Bold 40px, ~24 dots/glyph,
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

/** Render a single line as an ESC/POS raster command. */
export const renderLineRaster = (
  text: string,
  opts: RenderOpts = {},
): Uint8Array => {
  const img = drawLineBitmap(text, opts);
  return wrapRasterCommand(packPixels(img), img.height);
};

/** Blank vertical whitespace as an empty raster (default = one normal line). */
export const blankLine = (height = LINE_HEIGHT_NORMAL): Uint8Array => {
  const packed = new Uint8Array(BYTES_PER_ROW * height); // all zeros = white
  return wrapRasterCommand(packed, height);
};

export type Segment = {
  text: string;
  bold?: boolean;
  double?: boolean;
  /** Per-segment strikethrough — only the segment's text gets the line. */
  strikethrough?: boolean;
};

/**
 * Render a row composed of multiple text segments drawn left-to-right on a
 * single raster, each with its own size/weight. Line height = max segment
 * height. Used by the printer smoke-test scripts.
 */
export const renderMixedRow = (segments: Segment[]): Uint8Array => {
  const height = segments.some((s) => s.double)
    ? LINE_HEIGHT_DOUBLE
    : LINE_HEIGHT_NORMAL;
  const img = new Bitmap(DOTS_WIDTH, height);
  const ctx = img.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, DOTS_WIDTH, height);
  ctx.fillStyle = "black";
  ctx.textBaseline = "top" as never;

  let x = MARGIN_LEFT;
  for (const seg of segments) {
    const fontSize = seg.double ? FONT_SIZE_DOUBLE : FONT_SIZE_NORMAL;
    const family = seg.bold ? FAMILY_BOLD : FAMILY_REG;
    ctx.font = `${fontSize} ${family}`;
    const yOffset = seg.double
      ? 2
      : Math.max(2, height - LINE_HEIGHT_NORMAL + 2);
    ctx.fillText(seg.text, x, yOffset);
    const metrics = ctx.measureText(seg.text);
    const segWidth = Math.ceil(metrics.width);
    if (seg.strikethrough) {
      const segLineHeight = seg.double
        ? LINE_HEIGHT_DOUBLE
        : LINE_HEIGHT_NORMAL;
      const midY = yOffset + Math.floor(segLineHeight / 2);
      const strokeH = seg.double ? 3 : 2;
      ctx.fillRect(x, midY, segWidth, strokeH);
    }
    x += segWidth;
    if (x >= MARGIN_LEFT + DRAW_WIDTH) break; // clipped
  }

  return wrapRasterCommand(packPixels(img), height);
};

/** Zero printer line-spacing — MUST wrap raster blocks to prevent the
 * printer from inserting its default ~30-dot feed between raster lines. */
export const lineSpacingZero = (): Uint8Array =>
  new Uint8Array([0x1b, 0x33, 0x00]);

/** Restore default line spacing (~30 dots) for subsequent text commands. */
export const lineSpacingDefault = (): Uint8Array =>
  new Uint8Array([0x1b, 0x32]);
