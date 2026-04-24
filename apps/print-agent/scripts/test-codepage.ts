/**
 * Codepage calibration — prints a Vietnamese sample through several common
 * CP1258 register indexes. Operator reads the paper, picks the index that
 * renders Vietnamese diacritics correctly, then sets `PRINT_CODEPAGE_ID`
 * in `.env`.
 *
 * Usage:
 *   PRINTER_HOST=192.168.1.50 PRINTER_PORT=9100 pnpm test:codepage
 *
 * Output on paper (one block per tested codepage):
 *   CODEPAGE 38
 *   Cơm Tấm Má Tư
 *   Bánh mì thịt nướng — Sườn bì chả
 *   ĂÂĐÊÔƠƯăâđêôơư
 *   ---
 */

import iconv from "iconv-lite";
import net from "node:net";

const ESC = 0x1b;
const GS = 0x1d;

/** Common CP1258 register indexes seen in the wild on Vietnamese POS market. */
const CANDIDATES = [15, 28, 30, 38, 52];

const SAMPLE_LINES = [
  "Cơm Tấm Má Tư",
  "Bánh mì thịt nướng — Sườn bì chả",
  "ĂÂĐÊÔƠƯăâđêôơư",
];

const requireEnv = (k: string): string => {
  const v = process.env[k];
  if (!v) {
    console.error(`Missing env ${k}`);
    process.exit(1);
  }
  return v;
};

const buf = (arr: number[]) => Buffer.from(arr);
const concat = (parts: Buffer[]) => Buffer.concat(parts);

const encode1258 = (s: string): Buffer => {
  const decomposed = s.normalize("NFD");
  return iconv.encode(decomposed, "windows-1258");
};

const init = () => buf([ESC, 0x40]);
const selectCodepage = (n: number) => buf([ESC, 0x74, n]);
const newline = () => buf([0x0a]);
const boldOn = () => buf([ESC, 0x45, 0x01]);
const boldOff = () => buf([ESC, 0x45, 0x00]);
const feed = (n: number) => buf([ESC, 0x64, n]);
const cutPartial = () => buf([GS, 0x56, 0x01]);

const buildBytes = (): Buffer => {
  const parts: Buffer[] = [init()];
  for (const cp of CANDIDATES) {
    parts.push(selectCodepage(cp));
    parts.push(boldOn(), encode1258(`CODEPAGE ${cp}`), boldOff(), newline());
    for (const s of SAMPLE_LINES) {
      parts.push(encode1258(s), newline());
    }
    parts.push(encode1258("-".repeat(32)), newline());
  }
  parts.push(feed(3), cutPartial());
  return concat(parts);
};

const sendLAN = async (host: string, port: number, payload: Buffer): Promise<void> =>
  new Promise((resolve, reject) => {
    const sock = new net.Socket();
    let settled = false;
    const done = (err?: Error) => {
      if (settled) return;
      settled = true;
      try { sock.destroy(); } catch { /* ignore */ }
      err ? reject(err) : resolve();
    };
    sock.setTimeout(10_000, () => done(new Error(`timeout ${host}:${port}`)));
    sock.once("error", done);
    sock.connect(port, host, () => {
      sock.write(payload, (err) => {
        if (err) return done(err);
        sock.end(() => done());
      });
    });
  });

async function main() {
  const host = requireEnv("PRINTER_HOST");
  const port = Number(process.env.PRINTER_PORT ?? 9100);

  console.log(`[test-codepage] printing calibration sheet to ${host}:${port}`);
  console.log(`[test-codepage] candidates: ${CANDIDATES.join(", ")}`);
  const payload = buildBytes();
  await sendLAN(host, port, payload);
  console.log("[test-codepage] done. Read the paper and set PRINT_CODEPAGE_ID to the block that renders correctly.");
}

main().catch((e) => {
  console.error("[test-codepage] failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
