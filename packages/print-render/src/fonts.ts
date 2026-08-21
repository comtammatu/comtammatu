/**
 * Font registration for pureimage. TTFs are embedded (fonts-data.ts) and
 * written to a temp dir on first use because pureimage's registerFont only
 * accepts file paths. Works identically under tsx, esbuild single-file
 * bundles, and Next.js server actions.
 */

import { registerFont } from "pureimage";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  JETBRAINS_MONO_BOLD_B64,
  JETBRAINS_MONO_REGULAR_B64,
} from "./fonts-data";

export const FAMILY_REG = "JetBrainsMono";
export const FAMILY_BOLD = "JetBrainsMono-Bold";

let fontsReady: Promise<void> | null = null;

const materializeFont = (dir: string, name: string, b64: string): string => {
  const file = path.join(dir, name);
  if (!existsSync(file)) {
    writeFileSync(file, Buffer.from(b64, "base64"));
  }
  return file;
};

/** Register + async-load both font faces. Idempotent. */
export const ensureFontsLoaded = (): Promise<void> => {
  if (fontsReady) return fontsReady;
  const dir = path.join(tmpdir(), "comtammatu-print-render-fonts-v1");
  mkdirSync(dir, { recursive: true });
  const regular = materializeFont(
    dir,
    "JetBrainsMono-Regular.ttf",
    JETBRAINS_MONO_REGULAR_B64,
  );
  const bold = materializeFont(
    dir,
    "JetBrainsMono-Bold.ttf",
    JETBRAINS_MONO_BOLD_B64,
  );
  fontsReady = Promise.all([
    registerFont(regular, FAMILY_REG).load(),
    registerFont(bold, FAMILY_BOLD).load(),
  ]).then(() => undefined);
  return fontsReady;
};
