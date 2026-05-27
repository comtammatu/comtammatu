/**
 * Target codepage 27 (Vietnam) on PDIT PD805KL — confirmed present in the
 * printer's self-test code-page list. Tries 3 encodings since Xprinter/PDIT
 * firmware may map page 27 to any of them:
 *   - Windows-1258 (CP1258) — Microsoft Vietnamese
 *   - VISCII — Vietnamese Standard Code for Information Interchange
 *   - TCVN-3 — Vietnamese TCVN 5712:1993
 *
 * Usage:
 *   PRINTER_HOST=192.168.1.240 pnpm test:vn27
 */

import iconv from "iconv-lite";
import net from "node:net";

const ESC = 0x1b;
const GS = 0x1d;

const SAMPLE = "Cơm Tấm Má Tư — Bánh mì thịt nướng";
const SAMPLE2 = "Sườn bì chả · đặc biệt · 145.000đ";

type Encoding = "windows-1258" | "viscii" | "tcvn";
const ENCODINGS: Encoding[] = ["windows-1258", "viscii", "tcvn"];

const buf = (arr: number[]) => Buffer.from(arr);
const concat = (parts: Buffer[]) => Buffer.concat(parts);

const encode = (enc: Encoding, s: string): Buffer => {
  // For CP1258, combining marks live in 0x80-0x9F → NFD decompose first.
  // For VISCII + TCVN-3, encoders use precomposed chars directly (no NFD).
  const input =
    enc === "windows-1258" ? s.normalize("NFD") : s.normalize("NFC");
  return iconv.encode(input, enc);
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
  parts.push(
    boldOn(),
    iconv.encode("PAGE 27 VIETNAM TEST", "ascii"),
    boldOff(),
    newline(),
  );
  parts.push(iconv.encode("Target: Cơm sườn đặc biệt", "ascii"), newline());
  parts.push(iconv.encode("=".repeat(40), "ascii"), newline(), newline());

  // Select Vietnam codepage once; all subsequent text uses this table.
  parts.push(selectCodepage(27));

  for (const enc of ENCODINGS) {
    parts.push(
      boldOn(),
      iconv.encode(`[${enc}]`, "ascii"),
      boldOff(),
      newline(),
    );
    parts.push(encode(enc, SAMPLE), newline());
    parts.push(encode(enc, SAMPLE2), newline());
    parts.push(iconv.encode("-".repeat(40), "ascii"), newline(), newline());
  }

  parts.push(feed(3), cutPartial());
  return concat(parts);
};

const sendLAN = async (
  host: string,
  port: number,
  payload: Buffer,
): Promise<void> =>
  new Promise((resolve, reject) => {
    const sock = new net.Socket();
    let settled = false;
    const done = (err?: Error) => {
      if (settled) return;
      settled = true;
      try {
        sock.destroy();
      } catch {
        /* ignore */
      }
      err ? reject(err) : resolve();
    };
    sock.setTimeout(15_000, () => done(new Error(`timeout ${host}:${port}`)));
    sock.once("error", done);
    sock.connect(port, host, () => {
      sock.write(payload, (err) => {
        if (err) return done(err);
        sock.end(() => done());
      });
    });
  });

async function main() {
  const host = process.env.PRINTER_HOST;
  if (!host) {
    console.error("Missing PRINTER_HOST");
    process.exit(1);
  }
  const port = Number(process.env.PRINTER_PORT ?? 9100);
  const payload = buildBytes();
  console.log(`[test-vn27] sending ${payload.length} bytes to ${host}:${port}`);
  console.log(`[test-vn27] trying codepage 27 with: ${ENCODINGS.join(", ")}`);
  await sendLAN(host, port, payload);
  console.log(
    `[test-vn27] done. Read the paper — the [encoding] block that renders correctly is the one to use.`,
  );
}

main().catch((e) => {
  console.error("[test-vn27] failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
