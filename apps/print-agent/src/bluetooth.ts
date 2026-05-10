import { open } from "node:fs/promises";

const WINDOWS_COM_RE = /^COM\d+$/i;

function normalizeDevicePath(target: string): string {
  const value = target.trim();
  if (process.platform === "win32" && WINDOWS_COM_RE.test(value)) {
    return `\\\\.\\${value.toUpperCase()}`;
  }
  return value;
}

function timeoutAfter(ms: number, label: string): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
}

/**
 * Bluetooth thermal printers usually expose an SPP/RFCOMM serial endpoint:
 *
 * - Windows paired printer: COM5, COM6, ...
 * - Linux/Raspberry Pi: /dev/rfcomm0
 * - macOS: /dev/tty.<device>
 * - Termux/Android: a bound rfcomm/serial path from the host setup
 *
 * Node has no built-in Bluetooth stack and we intentionally avoid native deps
 * in the branch agent. The OS owns pairing/binding; the agent writes raw ESC/POS
 * bytes to the already-bound serial device.
 */
export async function sendRawBluetooth(
  target: string,
  bytes: Uint8Array,
  timeoutMs = 5000,
): Promise<void> {
  const devicePath = normalizeDevicePath(target);
  if (!devicePath) {
    throw new Error("bluetooth printer target is empty");
  }

  let handle: Awaited<ReturnType<typeof open>> | null = null;
  try {
    handle = await Promise.race([
      open(devicePath, "w"),
      timeoutAfter(timeoutMs, `bluetooth printer ${target} open`),
    ]);
    await Promise.race([
      handle.write(Buffer.from(bytes)),
      timeoutAfter(timeoutMs, `bluetooth printer ${target} write`),
    ]);
  } finally {
    if (handle) {
      await handle.close().catch(() => undefined);
    }
  }
}
