/**
 * Smoke test for bitmap rendering — verifies that Vietnamese text renders
 * correctly on the printer via rasterization, bypassing CP1258 firmware.
 *
 * Usage:
 *   PRINTER_HOST=192.168.1.240 pnpm test:bitmap
 */

import net from "node:net";
import {
  blankLine,
  ensureFontsLoaded,
  lineSpacingDefault,
  lineSpacingZero,
  renderLineRaster,
} from "../src/render-bitmap.js";

const ESC = 0x1b;
const GS = 0x1d;

const init = () => new Uint8Array([ESC, 0x40]);
const feed = (n: number) => new Uint8Array([ESC, 0x64, n]);
const cut = () => new Uint8Array([GS, 0x56, 0x01]);
const newline = () => new Uint8Array([0x0a]);

const concat = (parts: Uint8Array[]): Uint8Array => {
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
};

// Layout spec: normal = 48 chars/line, double = 24 chars/line.
// Double-size rows MUST be ≤24 chars or they clip off the right edge.
// Use `pair24` / `pair48` helpers below to format label..........value rows.

/** "label..................value" padded to exactly `width` chars. */
const pair = (label: string, value: string, width: number): string => {
  const combined = label.length + value.length;
  if (combined >= width) return (label + " " + value).slice(0, width);
  return label + " ".repeat(width - combined) + value;
};
const pair48 = (label: string, value: string) => pair(label, value, 48);
const pair24 = (label: string, value: string) => pair(label, value, 24);

const SAMPLES: Array<{
  text: string;
  bold?: boolean;
  double?: boolean;
  align?: "left" | "center" | "right";
}> = [
  // --- Alignment diagnostic: pipes at same positions should stack vertically ---
  { text: "ALIGN TEST (v5, 48 chars, margin 8)", bold: true, align: "center" },
  { text: "|12345|ABCDE|abcde|" },
  { text: "|11111|22222|33333|" },
  { text: "|.....|.....|.....|" },
  { text: "|-----+-----+-----|" },
  { text: "" },
  // --- Vietnamese glyph integrity ---
  { text: "Cơm Tấm Má Tư — Bánh mì thịt nướng" },
  { text: "ĂÂĐÊÔƠƯăâđêôơư" },
  { text: "áàảãạ ắằẳẵặ ấầẩẫậ" },
  { text: "óòỏõọ ốồổỗộ ớờởỡợ" },
  { text: "-".repeat(48) },
  // --- Receipt sample — follows production layout ---
  { text: "BITMAP MODE TEST", bold: true, double: true, align: "center" },
  { text: "-".repeat(48), align: "center" },
  { text: "Cơm Tấm Má Tư", align: "center" },
  { text: "Chi nhánh Quận 1", align: "center" },
  { text: "123 Nguyễn Huệ, P. Bến Nghé, Q.1", align: "center" },
  { text: "ĐT: 028.1234.5678", align: "center" },
  { text: "MST: 0123456789", align: "center" },
  { text: "=".repeat(48) },
  { text: "HÓA ĐƠN THANH TOÁN", bold: true, double: true, align: "center" },
  { text: "=".repeat(48) },
  { text: pair48("Đơn hàng:", "ORD-2026-001") },
  { text: pair48("Ngày:", "14:30 24/04/2026") },
  { text: pair48("Loại:", "Bàn 5") },
  { text: pair48("Thu ngân:", "Nguyễn A") },
  { text: pair48("Thanh toán:", "Tiền mặt") },
  { text: "+------------------+----+----------+-----------+" },
  { text: "| MÓN              | SL |      GIÁ |        TT |", bold: true },
  { text: "+------------------+----+----------+-----------+" },
  { text: "| Cơm tấm sườn bì  |  2 |  55.000đ |  110.000đ |" },
  { text: "|   chả            |    |          |           |" },
  { text: "|   + Thêm trứng   |    |          |           |" },
  { text: "+------------------+----+----------+-----------+" },
  { text: "| Bánh mì thịt     |  1 |  35.000đ |   35.000đ |" },
  { text: "|   nướng          |    |          |           |" },
  { text: "+------------------+----+----------+-----------+" },
  { text: pair48("Tạm tính", "145.000đ") },
  { text: pair48("Thuế VAT", "11.600đ") },
  { text: "=".repeat(48) },
  // TỔNG CỘNG at double-size must fit ≤24 chars → use pair24
  { text: pair24("TỔNG CỘNG", "158.850đ"), bold: true, double: true },
  { text: "=".repeat(48) },
  { text: pair48("Tiền nhận", "200.000đ") },
  { text: pair48("Tiền trả khách", "41.150đ") },
  { text: "-".repeat(48) },
  { text: "" },
  { text: "Được phát triển bởi", align: "center" },
  { text: "Cơm Tấm Má Tư", align: "center" },
];

async function buildPayload(): Promise<Uint8Array> {
  await ensureFontsLoaded();
  const parts: Uint8Array[] = [init(), lineSpacingZero()];
  for (const s of SAMPLES) {
    if (s.text === "") {
      parts.push(blankLine());
    } else {
      parts.push(renderLineRaster(s.text, s));
    }
  }
  parts.push(lineSpacingDefault(), feed(6), cut());
  return concat(parts);
}

const sendLAN = async (
  host: string,
  port: number,
  payload: Uint8Array,
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
    sock.setTimeout(30_000, () => done(new Error(`timeout ${host}:${port}`)));
    sock.once("error", done);
    sock.connect(port, host, () => {
      sock.write(Buffer.from(payload), (err) => {
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
  console.log(
    `[test-bitmap] rendering sample (this loads fonts, may take 1-2s)...`,
  );
  const payload = await buildPayload();
  console.log(`[test-bitmap] payload size: ${payload.length} bytes`);
  console.log(`[test-bitmap] sending to ${host}:${port}`);
  await sendLAN(host, port, payload);
  console.log(
    `[test-bitmap] done. If Vietnamese renders correctly, set PRINT_MODE=bitmap in .env.`,
  );
}

main().catch((e) => {
  console.error("[test-bitmap] failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
