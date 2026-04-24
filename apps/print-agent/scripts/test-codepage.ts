/**
 * Codepage calibration — prints a Vietnamese sample through ESC/POS code-page
 * register indexes. Operator reads the paper, picks the index that renders
 * diacritics correctly, then sets `PRINT_CODEPAGE_ID` in `.env`.
 *
 * Usage:
 *   # Quick mode — tests 5 common VN candidates (short sample)
 *   PRINTER_HOST=192.168.1.240 pnpm test:codepage
 *
 *   # Exhaustive mode — brute-force all 256 codepage ids (1 compact line each)
 *   PRINTER_HOST=192.168.1.240 EXHAUSTIVE=1 pnpm test:codepage
 *
 *   # Custom list
 *   PRINTER_HOST=192.168.1.240 PRINT_CODEPAGE_IDS=38,52,100 pnpm test:codepage
 */

import iconv from "iconv-lite";
import net from "node:net";

const ESC = 0x1b;
const GS = 0x1d;

/** Common CP1258 register indexes seen in the wild on Vietnamese POS market. */
const QUICK_CANDIDATES = [15, 28, 30, 38, 52];

/** Full sample for quick mode — 3 lines per codepage. */
const QUICK_SAMPLE_LINES = [
  "Cơm Tấm Má Tư",
  "Bánh mì thịt nướng — Sườn bì chả",
  "ĂÂĐÊÔƠƯăâđêôơư",
];

/** Compact sample for exhaustive mode — 1 line per codepage.
 * Covers: ơ (horn), ờ (horn+grave), ầ (circumflex+grave), ế (circumflex+acute),
 * ộ (circumflex+dot), đ (special letter), ă (breve), ặ (breve+dot). */
const COMPACT_SAMPLE = "Cơm sườn đặc biệt ế ộ";

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
/** Print+feed partial cut — used to break the strip every ~64 codepages
 * in exhaustive mode so the operator can separate sections. */
const cutAndContinue = () => buf([GS, 0x56, 0x42, 0x00]);

/** Quick mode: multi-line sample per codepage, 5 candidates by default. */
const buildQuick = (candidates: number[]): Buffer => {
  const parts: Buffer[] = [init()];
  for (const cp of candidates) {
    parts.push(selectCodepage(cp));
    parts.push(boldOn(), encode1258(`CODEPAGE ${cp}`), boldOff(), newline());
    for (const s of QUICK_SAMPLE_LINES) {
      parts.push(encode1258(s), newline());
    }
    parts.push(encode1258("-".repeat(32)), newline());
  }
  parts.push(feed(3), cutPartial());
  return concat(parts);
};

/** Exhaustive mode: one compact line per codepage id (0-255).
 * Cuts every 64 codepages so the strip breaks into ~20cm sections. */
const buildExhaustive = (): Buffer => {
  const parts: Buffer[] = [init()];
  parts.push(boldOn(), encode1258("EXHAUSTIVE SCAN 0-255"), boldOff(), newline());
  parts.push(encode1258("Target: Cơm sườn đặc biệt ế ộ"), newline());
  parts.push(encode1258("=".repeat(40)), newline());

  for (let cp = 0; cp <= 255; cp += 1) {
    parts.push(selectCodepage(cp));
    const idCell = String(cp).padStart(3, " ");
    parts.push(encode1258(`${idCell}  ${COMPACT_SAMPLE}`), newline());
    // Partial cut every 64 ids to let the operator break the strip manually
    if (cp > 0 && (cp + 1) % 64 === 0) {
      parts.push(feed(1));
      parts.push(selectCodepage(0)); // reset to ASCII for the marker
      parts.push(
        boldOn(),
        encode1258(`--- break @ ${cp} ---`),
        boldOff(),
        newline(),
      );
      parts.push(cutAndContinue());
    }
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
    sock.setTimeout(30_000, () => done(new Error(`timeout ${host}:${port}`)));
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
  const exhaustive = process.env.EXHAUSTIVE === "1";
  const customList = process.env.PRINT_CODEPAGE_IDS;

  let payload: Buffer;
  let modeDesc: string;

  if (exhaustive) {
    payload = buildExhaustive();
    modeDesc = "exhaustive (0-255, 1 line each)";
  } else if (customList) {
    const ids = customList
      .split(",")
      .map((s) => Number.parseInt(s.trim(), 10))
      .filter((n) => Number.isFinite(n) && n >= 0 && n <= 255);
    payload = buildQuick(ids);
    modeDesc = `custom [${ids.join(", ")}]`;
  } else {
    payload = buildQuick(QUICK_CANDIDATES);
    modeDesc = `quick [${QUICK_CANDIDATES.join(", ")}]`;
  }

  console.log(`[test-codepage] sending to ${host}:${port}`);
  console.log(`[test-codepage] mode: ${modeDesc}`);
  console.log(`[test-codepage] payload: ${payload.length} bytes`);
  await sendLAN(host, port, payload);
  console.log(
    "[test-codepage] done. Read the paper and set PRINT_CODEPAGE_ID to the id that renders correctly.",
  );
}

main().catch((e) => {
  console.error("[test-codepage] failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
