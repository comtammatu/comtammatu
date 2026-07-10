import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { BROWSER_CHROME_THEME_COLORS } from "../app/_lib/theme-tokens";

// The className-pattern gates in scripts/check-ui-contract.mjs cannot see token
// VALUES, so a palette retune can silently strand a status pair below WCAG.
// This asserts the shipped OKLCH values, converted to sRGB, still clear their
// floor in both themes.

const GLOBALS_CSS = join(
  import.meta.dirname,
  "../../../packages/ui/src/styles/globals.css",
);

type Oklch = readonly [L: number, C: number, h: number];

const css = readFileSync(GLOBALS_CSS, "utf8");

function scopeSource(kind: "light" | "dark"): string {
  const blocks: string[] = [];
  const ruleRe = /([^{}]+)\{([^{}]*)\}/g;
  let match: RegExpExecArray | null;
  while ((match = ruleRe.exec(css)) !== null) {
    const selector = (match[1] ?? "").trim();
    const body = match[2] ?? "";
    const isDark = /(^|,)\s*\.dark\s*$/.test(selector);
    const isLight = /:root/.test(selector) || /\.theme-light-only/.test(selector);
    if (kind === "dark" ? isDark : isLight && !isDark) blocks.push(body);
  }
  return blocks.join("\n");
}

const SCOPE: Record<"light" | "dark", string> = {
  light: scopeSource("light"),
  dark: scopeSource("dark"),
};

function token(scope: "light" | "dark", name: string): Oklch {
  const re = new RegExp(`--${name}:\\s*oklch\\(\\s*([\\d.]+)\\s+([\\d.]+)\\s+([\\d.]+)`);
  const match = SCOPE[scope].match(re);
  assert.ok(match, `--${name} not found in ${scope} scope of globals.css`);
  return [Number(match[1]), Number(match[2]), Number(match[3])] as const;
}

function oklchToLinearSrgb([L, C, hDeg]: Oklch): [number, number, number] {
  const h = (hDeg * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const encodeGamma = (c: number) =>
  c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
const decodeGamma = (c: number) =>
  c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);

function srgb(t: Oklch): [number, number, number] {
  const [r, g, b] = oklchToLinearSrgb(t);
  return [clamp01(encodeGamma(clamp01(r))), clamp01(encodeGamma(clamp01(g))), clamp01(encodeGamma(clamp01(b)))];
}

function luminance([r, g, b]: [number, number, number]): number {
  return 0.2126 * decodeGamma(r) + 0.7152 * decodeGamma(g) + 0.0722 * decodeGamma(b);
}

function contrast(a: number, b: number): number {
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

const ratio = (fg: Oklch, bg: Oklch) => contrast(luminance(srgb(fg)), luminance(srgb(bg)));

/** Browsers blend a `/NN` tint in gamma space, so composite there too. */
function ratioOverTint(fg: Oklch, tint: Oklch, bg: Oklch, alpha: number): number {
  const tintRgb = srgb(tint);
  const bgRgb = srgb(bg);
  const blended = tintRgb.map((c, i) => clamp01(c * alpha + (bgRgb[i] ?? 0) * (1 - alpha))) as [
    number,
    number,
    number,
  ];
  return contrast(luminance(srgb(fg)), luminance(blended));
}

const AA_TEXT = 4.5;
const NON_TEXT = 3;

test("contrast pipeline anchors hold", () => {
  assert.ok(Math.abs(contrast(luminance(srgb([1, 0, 0])), luminance(srgb([0, 0, 0]))) - 21) < 0.2);
});

test("light theme: status inks clear AA on background, card, and their own tints", () => {
  const bg = token("light", "background");
  const card = token("light", "card");
  for (const name of ["warning", "success", "destructive"] as const) {
    const ink = token("light", name);
    assert.ok(ratio(ink, bg) >= AA_TEXT, `text-${name} on background: ${ratio(ink, bg).toFixed(2)}`);
    assert.ok(ratio(ink, card) >= AA_TEXT, `text-${name} on card: ${ratio(ink, card).toFixed(2)}`);
    for (const alpha of [0.1, 0.15]) {
      const r = ratioOverTint(ink, ink, bg, alpha);
      assert.ok(r >= AA_TEXT, `text-${name} on bg-${name}/${alpha * 100}: ${r.toFixed(2)}`);
    }
  }
});

test("both themes: *-foreground reads on its own solid fill", () => {
  for (const scope of ["light", "dark"] as const) {
    for (const name of ["primary", "success", "warning", "destructive"] as const) {
      const fill = token(scope, name);
      const fg = token(scope, `${name}-foreground`);
      const r = ratio(fg, fill);
      assert.ok(r >= AA_TEXT, `${scope}: ${name}-foreground on solid ${name}: ${r.toFixed(2)}`);
    }
  }
});

test("night theme: inks still read on the gạo cháy surface", () => {
  const bg = token("dark", "background");
  for (const name of ["primary", "warning", "success", "destructive"] as const) {
    const ink = token("dark", name);
    const r = ratio(ink, bg);
    assert.ok(r >= AA_TEXT, `dark text-${name} on background: ${r.toFixed(2)}`);
  }
  const destructive = token("dark", "destructive");
  const tinted = ratioOverTint(destructive, destructive, bg, 0.1);
  assert.ok(tinted >= AA_TEXT, `dark text-destructive on bg-destructive/10: ${tinted.toFixed(2)}`);
  assert.ok(ratio(destructive, bg) >= NON_TEXT, "dark aria-invalid border must stay a visible keyline");
});

test("both themes: body and muted text clear AA", () => {
  for (const scope of ["light", "dark"] as const) {
    const bg = token(scope, "background");
    for (const name of ["foreground", "muted-foreground"] as const) {
      const r = ratio(token(scope, name), bg);
      assert.ok(r >= AA_TEXT, `${scope}: ${name} on background: ${r.toFixed(2)}`);
    }
  }
});

function toHex(t: Oklch): string {
  return `#${srgb(t)
    .map((c) => Math.round(c * 255).toString(16).padStart(2, "0"))
    .join("")}`;
}

// The browser-chrome-theme-color-source gate single-sources the hex STRING but
// cannot tell whether it still equals the token it claims to mirror, and the
// static manifest sits outside every guard root.
test("browser chrome colors equal the --background token of their theme", () => {
  assert.equal(toHex(token("light", "background")), BROWSER_CHROME_THEME_COLORS.light);
  assert.equal(toHex(token("dark", "background")), BROWSER_CHROME_THEME_COLORS.night);
});

test("static PWA manifest colors track the light chrome color", () => {
  const manifest = JSON.parse(
    readFileSync(join(import.meta.dirname, "../public/manifest.webmanifest"), "utf8"),
  ) as { theme_color?: string; background_color?: string };
  assert.equal(manifest.theme_color, BROWSER_CHROME_THEME_COLORS.light);
  assert.equal(manifest.background_color, BROWSER_CHROME_THEME_COLORS.light);
});

test("the brand gold stays an accent: --ring is not required to be ink", () => {
  const ring = token("light", "ring");
  const warning = token("light", "warning");
  assert.notDeepEqual(
    ring,
    warning,
    "--warning must not fall back to the brand gold; the gold fails AA as ink on kem gạo",
  );
});
