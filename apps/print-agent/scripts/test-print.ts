/**
 * Real-pipeline printer smoke test — renders the package sample payloads
 * through renderPayloadBitmap (the exact path the daemon uses) and sends
 * them to a thermal printer over TCP:9100. What this prints is what
 * production tickets look like.
 *
 * Usage:
 *   PRINTER_HOST=192.168.1.240 pnpm test:print                      # all 5 kinds
 *   PRINTER_HOST=192.168.1.241 TYPE=kitchen_ticket pnpm test:print  # one kind
 *   PRINTER_PORT defaults to 9100.
 */

import net from "node:net";
import {
  PRINT_KINDS,
  SAMPLE_PAYLOADS,
  renderPayloadBitmap,
} from "@comtammatu/print-render";

const host = process.env.PRINTER_HOST;
const port = Number(process.env.PRINTER_PORT ?? 9100);
const type = (process.env.TYPE ?? "all").toLowerCase();

function send(bytes: Uint8Array): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port, timeout: 5000 }, () => {
      socket.end(Buffer.from(bytes), () => resolve());
    });
    socket.on("error", reject);
    socket.on("timeout", () => {
      socket.destroy();
      reject(new Error(`${host}:${port} timed out`));
    });
  });
}

async function main() {
  if (!host) {
    console.error(
      "Usage: PRINTER_HOST=<ip> [PRINTER_PORT=9100] [TYPE=all|" +
        PRINT_KINDS.join("|") +
        "] pnpm test:print",
    );
    process.exit(1);
  }

  const kinds =
    type === "all" ? PRINT_KINDS : PRINT_KINDS.filter((k) => k === type);
  if (kinds.length === 0) {
    console.error(
      `Unknown TYPE=${type}. Expected all | ${PRINT_KINDS.join(" | ")}`,
    );
    process.exit(1);
  }

  for (const kind of kinds) {
    const bytes = await renderPayloadBitmap(SAMPLE_PAYLOADS[kind]);
    await send(bytes);
    console.log(
      `[test-print] sent ${kind} (${bytes.length} bytes) to ${host}:${port}`,
    );
  }
  console.log("[test-print] done — compare paper against the admin preview.");
}

main().catch((error) => {
  console.error(
    "[test-print] failed:",
    error instanceof Error ? error.message : error,
  );
  process.exit(1);
});
