/**
 * Bitmap rendering for ESC/POS thermal printers whose firmware does NOT
 * decode CP1258 at any register id (e.g. PDIT PD805KL). Text is rasterized
 * into a 1-bit bitmap via pureimage + Roboto Mono, then sent via the
 * `GS v 0` raster command — codepage-agnostic, works on any ESC/POS printer.
 *
 * One GS v 0 block per line. Line height adapts to size (normal/double).
 * Bold uses Roboto Mono Bold variant.
 */

import { Bitmap, registerFont } from "pureimage";
import { fileURLToPath } from "node:url";
import path from "node:path";

// 80mm thermal paper @ 203dpi ≈ 576 printable dots.
const DOTS_WIDTH = 576;
const BYTES_PER_ROW = DOTS_WIDTH / 8; // 72

// Canvas fills the full 576-dot printable area. 48 chars × 12-dot glyph
// (Roboto Mono @ 20px) = 576 exact. Small left-edge side-bearing on thin
// glyphs like `|` may clip ~1 dot but letters print with their full width.
const MARGIN_LEFT = 0;
const MARGIN_RIGHT = 0;
const DRAW_WIDTH = DOTS_WIDTH - MARGIN_LEFT - MARGIN_RIGHT; // 576 dots

// ─── PD805KL Bitmap Layout Spec ──────────────────────────────────────────
//
// Physical:
//   Paper 80mm, printable 72mm = 576 dots @ 203dpi
//   Self-test Font A = 48 chars/line (12 dots/char)
//
// Canvas:
//   Width:          576 dots         (matches printer printable width)
//   Left margin:      0 dots         (full-bleed; thin glyphs may clip ~1 dot
//                                      on left edge — accepted trade-off so
//                                      48 chars × 12 dots fills exactly 576)
//   Right margin:     0 dots
//   Drawing area:   576 dots         (= DRAW_WIDTH)
//
// Normal size (default for text, meta rows, table borders):
//   Font:           Roboto Mono Regular 20px
//   Glyph width:    ~12 dots
//   Max chars/line: 48  (48 × 12 = 576; slight right edge trim accepted)
//   Line height:    26 dots
//
// Double size (for banners, headers, TỔNG CỘNG):
//   Font:           Roboto Mono Bold 40px (2× normal)
//   Glyph width:    ~24 dots
//   Max chars/line: 24  (24 × 24 = 576)  ← HARD LIMIT
//   Line height:    52 dots
//
// Layout rules:
//   - Normal lines → use full 48-char width (compat with text-mode pair/
//     table helpers in escpos.ts)
//   - Double-size lines → MUST be ≤ 24 chars (half width). Pair-formatted
//     lines like "TỔNG CỘNG ... 158.850đ" need a compact 24-char layout
//     at double-size, not the 48-char padded version.
//   - Long item names → wrap across multiple double-size lines, or keep
//     item name at normal size and use prefix banner double-size.
const FONT_SIZE_NORMAL = 20;
const FONT_SIZE_DOUBLE = 40;

// Line height tight to font size — no extra leading. Rasters emit
// back-to-back with line-spacing=0 so vertical alignment is pixel-exact.
const LINE_HEIGHT_NORMAL = 26;
const LINE_HEIGHT_DOUBLE = 52;

/** Max chars per line at normal size (matches PD805KL Font A = 48). */
export const CHARS_PER_LINE_NORMAL = 48;
/** Max chars per line at double size (half of normal). */
export const CHARS_PER_LINE_DOUBLE = 24;

const FAMILY_REG = "RobotoMono";
const FAMILY_BOLD = "RobotoMono-Bold";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// In dev (tsx): __dirname = apps/print-agent/src/ → ../assets/fonts/
// In tsc build: __dirname = apps/print-agent/dist/ → ../assets/fonts/
// In pkg .exe:  __dirname = /snapshot/<...>/dist/   → ../assets/fonts/ (pkg.assets)
const FONT_DIR = path.resolve(__dirname, "../assets/fonts");

let fontsReady: Promise<void> | null = null;

/** Register + async-load both font faces. Idempotent. */
export const ensureFontsLoaded = (): Promise<void> => {
  if (fontsReady) return fontsReady;
  const reg = registerFont(path.join(FONT_DIR, "RobotoMono-Regular.ttf"), FAMILY_REG);
  const bold = registerFont(path.join(FONT_DIR, "RobotoMono-Bold.ttf"), FAMILY_BOLD);
  fontsReady = Promise.all([reg.load(), bold.load()]).then(() => undefined);
  return fontsReady;
};

export type RenderOpts = {
  bold?: boolean;
  double?: boolean;
  align?: "left" | "center" | "right";
  /** Inverse video (white text on black) — used for HỦY MÓN banner on
   * cancel tickets. Paints a solid black line, writes white glyphs. */
  inverse?: boolean;
  /** Strike-through: draw a horizontal black line through the text middle
   * after rasterizing. Used for cancelled item names so chef + customer
   * see "gạch ngang" treatment. ESC/POS has no native strikethrough, so
   * we paint it directly into the bitmap. */
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
        // Threshold on R channel (bitmap is drawn in grayscale via black on white).
        // Red < 128 = dark pixel → set bit (MSB first).
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
    0x1d, 0x76, 0x30, 0x00,
    BYTES_PER_ROW & 0xff, (BYTES_PER_ROW >> 8) & 0xff,
    height & 0xff, (height >> 8) & 0xff,
  ]);
  const out = new Uint8Array(header.length + packed.length);
  out.set(header, 0);
  out.set(packed, header.length);
  return out;
};

/**
 * Render a single line of text at the given style as an ESC/POS raster
 * command. Caller appends commands sequentially on the printer — no trailing
 * newline byte is emitted (the raster itself occupies vertical space).
 *
 * MUST be called after `ensureFontsLoaded()` resolves.
 */
export const renderLineRaster = (text: string, opts: RenderOpts = {}): Uint8Array => {
  const fontSize = opts.double ? FONT_SIZE_DOUBLE : FONT_SIZE_NORMAL;
  const lineHeight = opts.double ? LINE_HEIGHT_DOUBLE : LINE_HEIGHT_NORMAL;
  const family = opts.bold ? FAMILY_BOLD : FAMILY_REG;

  const img = new Bitmap(DOTS_WIDTH, lineHeight);
  const ctx = img.getContext("2d");

  // Disable smoothing so glyph edges are clean 1-bit. Thermal printers
  // only print black/white — anti-aliased grays become dithered mess.
  ctx.imageSmoothingEnabled = false;

  // Background: inverse mode paints the whole line black.
  ctx.fillStyle = opts.inverse ? "black" : "white";
  ctx.fillRect(0, 0, DOTS_WIDTH, lineHeight);

  // Measure + align (glyph colour flips too).
  ctx.fillStyle = opts.inverse ? "white" : "black";
  ctx.font = `${fontSize} ${family}`;
  ctx.textBaseline = "top" as never;

  // All drawing happens inside [MARGIN_LEFT, MARGIN_LEFT + DRAW_WIDTH].
  let x = MARGIN_LEFT;
  if (opts.align === "center" || opts.align === "right") {
    const metrics = ctx.measureText(text);
    const w = Math.ceil(metrics.width);
    x = opts.align === "center"
      ? MARGIN_LEFT + Math.max(0, Math.floor((DRAW_WIDTH - w) / 2))
      : MARGIN_LEFT + Math.max(0, DRAW_WIDTH - w);
  }

  // Small top padding so ascenders don't clip.
  ctx.fillText(text, x, 2);

  // Strike-through: draw a 2-dot black line through the vertical middle of
  // the text only (not the full canvas — leaves left/right padding clean).
  if (opts.strikethrough) {
    const metrics = ctx.measureText(text);
    const w = Math.ceil(metrics.width);
    const midY = Math.floor(lineHeight / 2);
    const strokeH = opts.double ? 3 : 2;
    ctx.fillStyle = opts.inverse ? "white" : "black";
    ctx.fillRect(x, midY, w, strokeH);
  }

  return wrapRasterCommand(packPixels(img), lineHeight);
};

/** Blank vertical whitespace in bitmap mode. Since we zero line-spacing
 * around rasters, emit an empty raster of the desired height (default =
 * one normal line). */
export const blankLine = (height = LINE_HEIGHT_NORMAL): Uint8Array => {
  const packed = new Uint8Array(BYTES_PER_ROW * height); // all zeros = white
  return wrapRasterCommand(packed, height);
};

export type Segment = {
  text: string;
  bold?: boolean;
  double?: boolean;
  /** Per-segment strikethrough — only the segment's text gets the line.
   * Used by cancel ticket so the qty prefix stays clean while item name
   * itself gets gạch ngang. */
  strikethrough?: boolean;
};

/**
 * Render a row composed of multiple text segments drawn left-to-right on
 * a single raster, each with its own size/weight. Line height = max
 * segment height. Used by kitchen tickets where ` x2 | ` is normal-size
 * but the item name is double-size on the same visual row.
 */
export const renderMixedRow = (segments: Segment[]): Uint8Array => {
  const height = segments.some((s) => s.double) ? LINE_HEIGHT_DOUBLE : LINE_HEIGHT_NORMAL;
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
    // Baseline-align smaller segments to the top of the larger ones so
    // they sit on the same visual row (use top offset = height diff).
    const yOffset = seg.double ? 2 : Math.max(2, height - LINE_HEIGHT_NORMAL + 2);
    ctx.fillText(seg.text, x, yOffset);
    const metrics = ctx.measureText(seg.text);
    const segWidth = Math.ceil(metrics.width);
    if (seg.strikethrough) {
      // Strike-through: 2-dot (normal) or 3-dot (double) horizontal line
      // through the vertical middle of THIS segment only.
      const segLineHeight = seg.double ? LINE_HEIGHT_DOUBLE : LINE_HEIGHT_NORMAL;
      const midY = yOffset + Math.floor(segLineHeight / 2);
      const strokeH = seg.double ? 3 : 2;
      ctx.fillRect(x, midY, segWidth, strokeH);
    }
    x += segWidth;
    if (x >= MARGIN_LEFT + DRAW_WIDTH) break; // clipped
  }

  return wrapRasterCommand(packPixels(img), height);
};

/** Zero printer line-spacing — MUST wrap a raster block to prevent the
 * printer from inserting its default ~30-dot feed between raster lines,
 * which causes vertical gaps and apparent misalignment. */
export const lineSpacingZero = (): Uint8Array => new Uint8Array([0x1b, 0x33, 0x00]);

/** Restore default line spacing (~30 dots) for subsequent text commands. */
export const lineSpacingDefault = (): Uint8Array => new Uint8Array([0x1b, 0x32]);
